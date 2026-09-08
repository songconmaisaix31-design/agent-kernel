import {
  reviewKernelTaskCandidate,
  kernelDependencyBase,
  assertKernelDependencyBase,
  verifyKernelDependencyLocation
} from './kernel-dependency-base'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { OrcaRuntimeService } from '../orca-runtime'
import { commandExecFileAsync } from '../../git/runner'
import { isGitRepoKind } from '../../../shared/repo-kind'
import {
  readKernelRunConfig,
  assertKernelTaskBindings,
  assertKernelRunOwner
} from './kernel-run-config'
import {
  AcceptanceChecks,
  kernelAcceptanceStamp,
  parseKernelStartBinding,
  readKernelAcceptanceRecord
} from './kernel-acceptance-policy'
import {
  acceptanceEnvironment,
  createCandidateSnapshot,
  nativeAcceptancePath,
  snapshotGit
} from './kernel-candidate-snapshot'
import { OrchestrationError } from './orchestration-error'
import type { RunRow } from './types'

type Context = { runtime: OrcaRuntimeService; authorize: () => RunRow; signal?: AbortSignal }
export type AcceptanceRequest = { task: string; dispatch: string; candidate: string }
function fail(code: string, message: string): never {
  throw new OrchestrationError(code, message)
}
export function approveKernelAcceptance(context: Context, input: unknown) {
  const checks = AcceptanceChecks.safeParse(input)
  if (!checks.success) {
    fail('kernel_policy_invalid', 'Expected bounded per-Task source and timeoutMs checks.')
  }
  const db = context.runtime.getOrchestrationDb()
  db.db.exec('BEGIN IMMEDIATE')
  try {
    const run = context.authorize()
    const config = readKernelRunConfig(run)
    if (!config) {
      fail('kernel_disabled', 'Enable and approve the Run plan first.')
    }
    assertKernelRunOwner(db, run, {
      terminalHandle: run.coordinator_handle!,
      paneKey: run.coordinator_pane_key!
    })
    assertKernelTaskBindings(db, run.id, config)
    if (
      Object.keys(checks.data).some((key) => !config.plan.tasks.some((task) => task.key === key))
    ) {
      fail('kernel_task_mismatch', 'Every check must bind an approved Task in this Run.')
    }
    config.acceptancePolicy = { approvalId: randomUUID(), checks: checks.data }
    db.db
      .prepare('UPDATE runs SET kernel_config = ? WHERE id = ?')
      .run(JSON.stringify(config), run.id)
    db.db.exec('COMMIT')
    return {
      status: 'approved' as const,
      policy: config.acceptancePolicy,
      runGeneration: run.consumer_generation
    }
  } catch (error) {
    db.db.exec('ROLLBACK')
    throw error
  }
}
export function kernelAcceptanceBinding(context: Context, request: AcceptanceRequest) {
  const db = context.runtime.getOrchestrationDb(),
    run = context.authorize()
  const config = readKernelRunConfig(run)
  if (!config?.acceptancePolicy) {
    fail('kernel_policy_required', 'Approve a server-side check before acceptance.')
  }
  assertKernelRunOwner(db, run, {
    terminalHandle: run.coordinator_handle!,
    paneKey: run.coordinator_pane_key!
  })
  assertKernelTaskBindings(db, run.id, config)
  const task = db.getTask(request.task),
    dispatch = db.getDispatchContextById(request.dispatch)
  const worker = db.getWorkerDispatch(request.dispatch),
    latest = db.getDispatchContext(request.task)
  const planned = config.plan.tasks.find((entry) => entry.key === request.task)
  if (
    !task ||
    task.run_id !== run.id ||
    !planned ||
    !dispatch ||
    dispatch.run_id !== run.id ||
    dispatch.task_id !== task.id ||
    latest?.id !== dispatch.id ||
    task.status !== 'completed' ||
    dispatch.status !== 'completed' ||
    !worker ||
    worker.state !== 'succeeded' ||
    worker.stage !== 'settled' ||
    !worker.worktree_id ||
    db.db.prepare('SELECT 1 FROM federated_dispatches WHERE dispatch_id = ?').get(dispatch.id)
  ) {
    fail('kernel_dispatch_mismatch', 'Acceptance requires the latest successful local Dispatch.')
  }
  const base = kernelDependencyBase(db, run, config, request.task)
  if (!planned.spec) {
    fail('kernel_task_body_required', 'Approve the Task body before acceptance.')
  }
  const check = config.acceptancePolicy.checks[task.id]
  if (!check) {
    fail('kernel_policy_required', 'This Task has no approved check.')
  }
  const options = parseKernelStartBinding(worker.start_options)
  if (
    options.repo !== `id:${config.repoId}` ||
    options.baseBranch !== base.baseCommit ||
    options.worktree !== 'new-top-level'
  ) {
    fail('kernel_dispatch_mismatch', 'Dispatch repository/base differs from the approved plan.')
  }
  if (base.dependency) {
    if (!options.kernelBase) {
      fail('kernel_dependency_invalid', 'Dispatch has no persisted dependency base.')
    }
    assertKernelDependencyBase(base, options.kernelBase)
  }
  const stamp = kernelAcceptanceStamp(run, task, dispatch, worker)
  return { run, config, task, worker, check, stamp, base }
}
export async function kernelAcceptanceLocation(
  context: Context,
  request: AcceptanceRequest,
  initial: ReturnType<typeof kernelAcceptanceBinding>
) {
  const repo = await context.runtime.showRepo(`id:${initial.config.repoId}`)
  const worktree = await context.runtime.showManagedWorktree(`id:${initial.worker.worktree_id}`)
  if (
    !isGitRepoKind(repo) ||
    repo.id !== initial.config.repoId ||
    repo.connectionId ||
    (repo.executionHostId && repo.executionHostId !== 'local') ||
    worktree.repoId !== repo.id ||
    worktree.id !== initial.worker.worktree_id
  ) {
    fail('kernel_unsupported_host', 'Only the bound native Git workspace is supported.')
  }
  const repoPath = await nativeAcceptancePath(repo.path),
    source = await nativeAcceptancePath(worktree.path)
  const common = async (path: string) =>
    nativeAcceptancePath(
      resolve(path, (await snapshotGit(path, ['rev-parse', '--git-common-dir'])).trim())
    )
  if ((await common(repoPath)) !== (await common(source))) {
    fail(
      'kernel_dispatch_mismatch',
      'Worker worktree does not belong to the configured repository.'
    )
  }
  const identity = JSON.stringify({ repoPath, source, repoId: repo.id, worktreeId: worktree.id })
  if ((await snapshotGit(source, ['rev-parse', '--verify', 'HEAD'])).trim() !== request.candidate) {
    fail('kernel_candidate_changed', 'Candidate must equal the bound Worker worktree HEAD.')
  }
  await verifyKernelDependencyLocation(context.runtime, initial.config.repoId, initial.base)
  return { repoPath, source, identity }
}
export async function acceptKernelCandidate(context: Context, request: AcceptanceRequest) {
  if (
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(request.candidate) ||
    /^0+$/.test(request.candidate)
  ) {
    fail('invalid_commit', 'A lowercase full nonzero candidate SHA is required.')
  }
  const db = context.runtime.getOrchestrationDb(),
    initial = kernelAcceptanceBinding(context, request)
  const local = await kernelAcceptanceLocation(context, request, initial)
  const scope = await reviewKernelTaskCandidate(
    initial.config.plan,
    request.task,
    local.source,
    initial.base,
    request.candidate
  )
  if (scope.status !== 'scope-checked') {
    fail(scope.code, scope.message)
  }
  if (kernelAcceptanceBinding(context, request).stamp !== initial.stamp) {
    fail('kernel_acceptance_changed', 'Binding changed before checks.')
  }
  const record = {
    status: 'checking',
    kernelBase: initial.base,
    ...request,
    approvalId: initial.config.acceptancePolicy!.approvalId,
    binding: initial.stamp,
    location: local.identity,
    token: randomUUID()
  }
  const checking = JSON.stringify(record)
  db.db.exec('BEGIN IMMEDIATE')
  try {
    const current = kernelAcceptanceBinding(context, request)
    if (current.stamp !== initial.stamp) {
      fail('kernel_acceptance_changed', 'Binding changed before reservation.')
    }
    const previous = readKernelAcceptanceRecord(current.task.kernel_acceptance)
    if (previous?.status === 'checking') {
      fail(
        'kernel_acceptance_busy',
        'A check is running or unresolved; do not automatically retry after process loss.'
      )
    }
    if (
      previous?.status === 'accepted' &&
      previous.binding === initial.stamp &&
      previous.candidate === request.candidate &&
      previous.location === local.identity
    ) {
      db.db.exec('COMMIT')
      return { acceptance: previous, duplicate: true }
    }
    db.db.prepare('UPDATE tasks SET kernel_acceptance = ? WHERE id = ?').run(checking, request.task)
    db.db.exec('COMMIT')
  } catch (error) {
    db.db.exec('ROLLBACK')
    throw error
  }
  let snapshot: Awaited<ReturnType<typeof createCandidateSnapshot>> | undefined
  try {
    snapshot = await createCandidateSnapshot(local.source, request.candidate, initial.config.plan)
    const checked = await commandExecFileAsync(
      process.execPath,
      ['--input-type=commonjs', '-e', initial.check.source],
      {
        cwd: snapshot.path,
        env: { ...acceptanceEnvironment(), ELECTRON_RUN_AS_NODE: '1' },
        timeout: initial.check.timeoutMs,
        maxBuffer: 65_536,
        signal: context.signal
      }
    )
    await snapshot.verify()
    const currentLocation = await kernelAcceptanceLocation(context, request, initial)
    if (currentLocation.identity !== local.identity) {
      fail('kernel_candidate_changed', 'Workspace binding changed during checks.')
    }
    await snapshot.cleanup()
    snapshot = undefined
    db.db.exec('BEGIN IMMEDIATE')
    try {
      if (
        context.signal?.aborted ||
        kernelAcceptanceBinding(context, request).stamp !== initial.stamp
      ) {
        fail('kernel_acceptance_changed', 'Binding changed during checks.')
      }
      const accepted = {
        ...record,
        status: 'accepted',
        paths: scope.paths,
        checkedAt: new Date().toISOString(),
        check: { exitCode: 0, stdout: checked.stdout, stderr: checked.stderr }
      }
      const updated = db.db
        .prepare('UPDATE tasks SET kernel_acceptance = ? WHERE id = ? AND kernel_acceptance = ?')
        .run(JSON.stringify(accepted), request.task, checking)
      if (updated.changes !== 1) {
        fail('kernel_acceptance_changed', 'Acceptance reservation was invalidated.')
      }
      db.db.exec('COMMIT')
      return { acceptance: accepted, duplicate: false }
    } catch (error) {
      db.db.exec('ROLLBACK')
      throw error
    }
  } catch (error) {
    let failure = error
    try {
      await snapshot?.cleanup()
    } catch (cleanupError) {
      failure = cleanupError
    }
    const code = failure instanceof OrchestrationError ? failure.code : 'kernel_check_failed'
    const message = failure instanceof Error ? failure.message : 'Acceptance failed.'
    db.db
      .prepare(
        "UPDATE tasks SET kernel_acceptance = ? WHERE id = ? AND json_extract(kernel_acceptance, '$.token') = ?"
      )
      .run(
        JSON.stringify({ ...record, status: 'rejected', code, message }),
        request.task,
        record.token
      )
    throw new OrchestrationError(code, message)
  }
}
