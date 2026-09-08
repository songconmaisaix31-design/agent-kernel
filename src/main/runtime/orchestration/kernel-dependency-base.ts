import { reviewKernelCandidate } from './kernel-candidate-review'
import type { Plan } from './kernel-plan'
import { isDeepStrictEqual } from 'node:util'
import { resolve } from 'node:path'
import { isGitRepoKind } from '../../../shared/repo-kind'
import type { OrcaRuntimeService } from '../orca-runtime'
import type { OrchestrationDb } from './db'
import type { RunRow } from './types'
import type { KernelRunConfig } from './kernel-run-config'
import {
  kernelAcceptanceStamp,
  readKernelAcceptanceRecord,
  parseKernelStartBinding,
  type KernelBase
} from './kernel-acceptance-policy'
import { nativeAcceptancePath, snapshotGit } from './kernel-candidate-snapshot'
import { OrchestrationError } from './orchestration-error'

function reject(message: string): never {
  throw new OrchestrationError('kernel_dependency_invalid', message)
}

export function kernelDependencyBase(
  db: OrchestrationDb,
  run: RunRow,
  config: KernelRunConfig,
  taskId: string
): KernelBase {
  const planned = config.plan.tasks.find((task) => task.key === taskId)
  if (!planned) {
    reject('Task is not in the approved Plan.')
  }
  if (!planned.dependsOn.length) {
    return { baseCommit: config.plan.baseCommit }
  }
  const parent = config.plan.tasks.find((task) => task.key === planned.dependsOn[0])
  if (planned.dependsOn.length !== 1 || !parent || parent.dependsOn.length) {
    throw new OrchestrationError(
      'kernel_dependency_unsupported',
      'Only one independent accepted parent is supported; multi-parent and deeper chains are unsupported.'
    )
  }
  const task = db.getTask(parent.key)
  const accepted = readKernelAcceptanceRecord(task?.kernel_acceptance)
  if (
    !task ||
    task.run_id !== run.id ||
    task.status !== 'completed' ||
    accepted?.status !== 'accepted'
  ) {
    reject(
      'The parent requires a current server-persisted accepted result; completion is insufficient.'
    )
  }
  const dispatch = db.getDispatchContextById(accepted.dispatch)
  const worker = db.getWorkerDispatch(accepted.dispatch)
  if (
    accepted.task !== task.id ||
    !dispatch ||
    dispatch.run_id !== run.id ||
    dispatch.task_id !== task.id ||
    db.getDispatchContext(task.id)?.id !== dispatch.id ||
    dispatch.status !== 'completed' ||
    !worker ||
    worker.state !== 'succeeded' ||
    worker.stage !== 'settled' ||
    !worker.worktree_id ||
    db.db.prepare('SELECT 1 FROM federated_dispatches WHERE dispatch_id = ?').get(dispatch.id) ||
    !parent.spec ||
    !config.acceptancePolicy?.checks[parent.key] ||
    accepted.approvalId !== config.acceptancePolicy.approvalId ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(accepted.candidate) ||
    /^0+$/.test(accepted.candidate) ||
    accepted.binding !== kernelAcceptanceStamp(run, task, dispatch, worker)
  ) {
    reject('Parent acceptance no longer matches its Run, approved policy or latest Dispatch.')
  }
  const options = parseKernelStartBinding(worker.start_options)
  if (options.repo !== `id:${config.repoId}` || options.baseBranch !== config.plan.baseCommit) {
    reject('Parent Dispatch did not start from the approved repository/base.')
  }
  const { token, approvalId, binding, location, candidate } = accepted
  return {
    baseCommit: candidate,
    dependency: {
      task: task.id,
      dispatch: dispatch.id,
      candidate,
      token,
      approvalId,
      binding,
      location
    }
  }
}

export function assertKernelDependencyBase(actual: KernelBase, expected: KernelBase): void {
  if (!isDeepStrictEqual(actual, expected)) {
    reject('Dependency base changed; start again from current server state.')
  }
}

export async function verifyKernelDependencyLocation(
  runtime: OrcaRuntimeService,
  repoId: string,
  base: KernelBase,
  createdWorktreeId?: string
): Promise<void> {
  const dependency = base.dependency
  if (!dependency) {
    return
  }
  const worker = runtime.getOrchestrationDb().getWorkerDispatch(dependency.dispatch)
  if (!worker?.worktree_id) {
    reject('Parent worktree binding is missing.')
  }
  const repo = await runtime.showRepo(`id:${repoId}`)
  const worktree = await runtime.showManagedWorktree(`id:${worker.worktree_id}`)
  if (
    repo.id !== repoId ||
    !isGitRepoKind(repo) ||
    repo.connectionId ||
    (repo.executionHostId && repo.executionHostId !== 'local') ||
    worktree.id !== worker.worktree_id ||
    worktree.repoId !== repo.id
  ) {
    reject('Parent must belong to the configured native Git repository.')
  }
  const repoPath = await nativeAcceptancePath(repo.path),
    source = await nativeAcceptancePath(worktree.path)
  const common = async (path: string) =>
    nativeAcceptancePath(
      resolve(path, (await snapshotGit(path, ['rev-parse', '--git-common-dir'])).trim())
    )
  if (
    JSON.stringify({ repoPath, source, repoId: repo.id, worktreeId: worktree.id }) !==
      dependency.location ||
    (await common(repoPath)) !== (await common(source)) ||
    (await snapshotGit(source, ['rev-parse', '--verify', 'HEAD'])).trim() !== dependency.candidate
  ) {
    reject('Parent candidate or native workspace location changed.')
  }
  if (createdWorktreeId) {
    const child = await runtime.showManagedWorktree(`id:${createdWorktreeId}`)
    const path = await nativeAcceptancePath(child.path)
    if (
      child.id !== createdWorktreeId ||
      child.repoId !== repoId ||
      (await common(path)) !== (await common(repoPath)) ||
      (await snapshotGit(path, ['rev-parse', '--verify', 'HEAD'])).trim() !== base.baseCommit
    ) {
      reject('Downstream worktree does not start at its selected dependency candidate.')
    }
  }
}

// Full approved bindings are checked by the caller before deriving this single-Task scope view.
export function reviewKernelTaskCandidate(
  plan: Plan,
  taskKey: string,
  repoPath: string,
  base: KernelBase,
  candidateCommit: string
) {
  return reviewKernelCandidate({
    plan: base.dependency
      ? {
          ...plan,
          baseCommit: base.baseCommit,
          tasks: plan.tasks
            .filter((task) => task.key === taskKey)
            .map((task) => ({ ...task, dependsOn: [] }))
        }
      : plan,
    taskKey,
    repoPath,
    baseCommit: base.baseCommit,
    candidateCommit,
    executionHost: 'native'
  })
}
