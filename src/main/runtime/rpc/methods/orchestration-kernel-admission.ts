import { kernelTaskSpec } from '../../orchestration/kernel-task-contract'
import {
  kernelDependencyBase,
  assertKernelDependencyBase,
  verifyKernelDependencyLocation
} from '../../orchestration/kernel-dependency-base'
import type { KernelBase } from '../../orchestration/kernel-acceptance-policy'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import { isWslUncPath } from '../../../../shared/wsl-paths'
import type { OrchestrationCompatibilityEvidence } from '../../../../shared/orchestration-compatibility-evidence'
import type { OrcaRuntimeService } from '../../orca-runtime'
import {
  assertKernelWorkerPolicy,
  assertKernelTaskBindings,
  assertKernelRunOwner,
  readKernelRunConfig
} from '../../orchestration/kernel-run-config'
import { OrchestrationError } from '../../orchestration/orchestration-error'
import type { RunRow } from '../../orchestration/types'
import type { WorkerStartInput } from './orchestration-worker-start-schema'
import { resolveRunScope } from './orchestration-run-scope'

function verifiedKernelCaller(
  runtime: OrcaRuntimeService,
  from: string,
  evidence?: OrchestrationCompatibilityEvidence
) {
  const caller =
    evidence &&
    runtime.verifyOrchestrationCompatibilityCaller(evidence, {
      currentRuntimeLaunchSufficient: true
    })
  if (!caller || caller.terminalHandle !== from) {
    throw new OrchestrationError(
      'consumer_fenced',
      'Kernel changes require the verified Run coordinator.'
    )
  }
  return caller
}

export function requireKernelCoordinator(
  runtime: OrcaRuntimeService,
  runId: string,
  from: string,
  evidence?: OrchestrationCompatibilityEvidence
): RunRow {
  const caller = verifiedKernelCaller(runtime, from, evidence)
  return resolveRunScope(runtime, {
    runId,
    callerTerminalHandle: from,
    callerPaneKey: caller.paneKey,
    requireCurrentConsumer: true,
    callerEvidence: evidence
  })
}

export function prepareKernelRunBinding(
  runtime: OrcaRuntimeService,
  runId: string,
  from: string,
  evidence?: OrchestrationCompatibilityEvidence
) {
  const caller = verifiedKernelCaller(runtime, from, evidence)
  const owner = { terminalHandle: caller.terminalHandle, paneKey: caller.paneKey }
  const db = runtime.getOrchestrationDb()
  const expected = db.getRun(runId)
  if (!expected) {
    throw new OrchestrationError('run_not_found', 'Kernel Run was not found.')
  }
  assertKernelRunOwner(db, expected, owner)
  return {
    paneKey: caller.paneKey,
    validate: (current: RunRow) => {
      if (
        current.consumer_generation !== expected.consumer_generation ||
        current.kernel_config !== expected.kernel_config
      ) {
        throw new OrchestrationError(
          'consumer_fenced',
          'Kernel Run changed before owner restoration.'
        )
      }
      assertKernelRunOwner(db, current, owner)
      const config = readKernelRunConfig(current)
      if (config && !config.owner) {
        db.db
          .prepare('UPDATE runs SET kernel_config = ? WHERE id = ?')
          .run(JSON.stringify({ ...config, owner }), current.id)
      }
    }
  }
}

export function admitKernelWorkerStart(
  runtime: OrcaRuntimeService,
  runId: string,
  params: WorkerStartInput,
  evidence?: OrchestrationCompatibilityEvidence
): string | null {
  const db = runtime.getOrchestrationDb()
  const run = db.getRun(runId)
  if (!run) {
    throw new OrchestrationError('run_not_found', 'The Worker Run no longer exists.')
  }
  const config = readKernelRunConfig(run)
  if (!config) {
    return null
  }
  requireKernelCoordinator(runtime, runId, params.from, evidence)
  if (params.on || params.worktree !== 'new-top-level' || params.terminal) {
    throw new OrchestrationError(
      'kernel_unsupported_path',
      'Kernel supports only local new-top-level Workers.'
    )
  }
  assertKernelWorkerPolicy(db, params.task, run.kernel_config)
  const base = kernelDependencyBase(db, run, config, params.task)
  if (
    (params.repo && params.repo !== config.repoId && params.repo !== `id:${config.repoId}`) ||
    (params.baseBranch && params.baseBranch !== base.baseCommit)
  ) {
    throw new OrchestrationError(
      'kernel_start_mismatch',
      'Worker repository or base differs from the approved Run plan.'
    )
  }
  params.repo = `id:${config.repoId}`
  params.baseBranch = base.baseCommit
  return run.kernel_config as string
}

export async function requireKernelLocalRepo(
  runtime: OrcaRuntimeService,
  snapshot: string | null,
  params: WorkerStartInput
): Promise<void> {
  if (snapshot === null) {
    return
  }
  const repo = await runtime.showRepo(params.repo as string)
  if (
    `id:${repo.id}` !== params.repo ||
    !isGitRepoKind(repo) ||
    repo.connectionId ||
    (repo.executionHostId && repo.executionHostId !== 'local') ||
    isWslUncPath(repo.path)
  ) {
    throw new OrchestrationError(
      'kernel_unsupported_path',
      'Kernel requires a local Git repository.'
    )
  }
}

export function recheckKernelWorkerStart(
  runtime: OrcaRuntimeService,
  runId: string,
  params: WorkerStartInput,
  snapshot: string | null,
  evidence?: OrchestrationCompatibilityEvidence
): void {
  const current = runtime.getOrchestrationDb().getRun(runId)
  if (!current || (current.kernel_config ?? null) !== snapshot) {
    throw new OrchestrationError(
      'kernel_config_changed',
      'Run policy changed during Worker preparation; retry from current state.'
    )
  }
  admitKernelWorkerStart(runtime, runId, params, evidence)
}

export function rejectKernelDispatch(runtime: OrcaRuntimeService, run: RunRow): void {
  const current = runtime.getOrchestrationDb().getRun(run.id)
  if (!current) {
    throw new OrchestrationError('run_not_found', 'The Dispatch Run no longer exists.')
  }
  if (readKernelRunConfig(current)) {
    throw new OrchestrationError(
      'kernel_unsupported_path',
      'Kernel Runs require supervised workerStart, not low-level dispatch.'
    )
  }
}

export function kernelWorkerBase(
  runtime: OrcaRuntimeService,
  runId: string,
  taskId: string
): KernelBase | null {
  const db = runtime.getOrchestrationDb(),
    run = db.getRun(runId)
  if (!run) {
    throw new OrchestrationError('run_not_found', 'The Worker Run no longer exists.')
  }
  const config = readKernelRunConfig(run)
  if (!config) {
    return null
  }
  assertKernelTaskBindings(db, runId, config)
  return kernelDependencyBase(db, run, config, taskId)
}

export async function recheckKernelWorkerBase(
  runtime: OrcaRuntimeService,
  runId: string,
  params: WorkerStartInput,
  snapshot: string | null,
  base: KernelBase | null,
  evidence?: OrchestrationCompatibilityEvidence,
  worktreeId?: string
): Promise<() => void> {
  const recheck = () => {
    const run = runtime.getOrchestrationDb().getRun(runId)
    if (!run || (run.kernel_config ?? null) !== snapshot) {
      throw new OrchestrationError(
        'kernel_config_changed',
        'Run policy changed during Worker preparation.'
      )
    }
    if (base) {
      requireKernelCoordinator(runtime, runId, params.from, evidence)
      assertKernelDependencyBase(kernelWorkerBase(runtime, runId, params.task)!, base)
    }
  }
  recheck()
  if (base?.dependency) {
    await verifyKernelDependencyLocation(runtime, params.repo!.slice(3), base, worktreeId)
  }
  recheck()
  return recheck
}

export function prepareKernelWorkerStart(
  runtime: OrcaRuntimeService,
  runId: string,
  params: WorkerStartInput,
  nativeSpec: string,
  evidence?: OrchestrationCompatibilityEvidence
) {
  const snapshot = admitKernelWorkerStart(runtime, runId, params, evidence)
  const base = kernelWorkerBase(runtime, runId, params.task)
  const taskSpec =
    kernelTaskSpec(snapshot, params.task, nativeSpec) +
    (base?.dependency
      ? `\nServer-selected actual execution base (supersedes the Plan base for this Task checkout): ${base.baseCommit}\nAccepted parent Task: ${base.dependency.task}; Dispatch: ${base.dependency.dispatch}.`
      : '')
  return {
    snapshot,
    base,
    taskSpec,
    recheckAdmission: () => recheckKernelWorkerStart(runtime, runId, params, snapshot, evidence),
    recheckBase: (worktreeId?: string) =>
      recheckKernelWorkerBase(runtime, runId, params, snapshot, base, evidence, worktreeId)
  }
}
