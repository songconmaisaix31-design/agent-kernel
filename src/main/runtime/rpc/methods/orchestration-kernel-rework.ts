import { isGitRepoKind } from '../../../../shared/repo-kind'
import { isWslUncPath } from '../../../../shared/wsl-paths'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { readKernelRunConfig, assertKernelTaskBindings } from '../../orchestration/kernel-run-config'
import { OrchestrationError } from '../../orchestration/orchestration-error'
import { isEquivalentPaneKey } from '../../orchestration/db/pane-key-match'
import { parseWorkerTerminalHostScope } from '../../orchestration/worker-terminal-process-liveness'
import type { KernelReworkStartBinding } from '../../orchestration/kernel-acceptance-policy'
import type { WorkerStartInput } from './orchestration-worker-start-schema'

type KernelReworkBinding = KernelReworkStartBinding['kernelRework']

function reject(message: string): never {
  throw new OrchestrationError('kernel_rework_invalid', message)
}

export function isKernelReworkRequest(params: WorkerStartInput): boolean {
  return params.worktree !== 'new-top-level' || Boolean(params.terminal)
}

export function assertKernelReworkRequest(params: WorkerStartInput): void {
  if (
    params.on ||
    !params.retryOf ||
    !params.terminal ||
    !params.worktree?.startsWith('id:') ||
    params.name ||
    params.repo ||
    params.baseBranch ||
    params.setup ||
    params.agent ||
    params.model ||
    params.effort
  ) {
    throw new OrchestrationError(
      'kernel_unsupported_path',
      'Kernel rework requires the exact original local worktree and terminal.'
    )
  }
}

export function prepareKernelReworkStart(args: {
  runtime: OrcaRuntimeService
  runId: string
  params: WorkerStartInput
  snapshot: string | null
}) {
  if (args.snapshot === null || !isKernelReworkRequest(args.params)) {
    return { recheck: async (): Promise<KernelReworkBinding | undefined> => undefined }
  }
  assertKernelReworkRequest(args.params)
  let initial: KernelReworkBinding | undefined
  return {
    recheck: async (): Promise<KernelReworkBinding> => {
      const observed = await observeKernelRework(args)
      if (initial && JSON.stringify(initial) !== JSON.stringify(observed)) {
        reject('Original Worker identity changed during rework preparation.')
      }
      initial = observed
      return observed
    }
  }
}

async function observeKernelRework(args: {
  runtime: OrcaRuntimeService
  runId: string
  params: WorkerStartInput
  snapshot: string | null
}): Promise<KernelReworkBinding> {
  const { runtime, params } = args
  const db = runtime.getOrchestrationDb()
  const run = db.getRun(args.runId)
  if (!run || run.kernel_config !== args.snapshot) {
    throw new OrchestrationError('kernel_config_changed', 'Run policy changed during rework.')
  }
  const config = readKernelRunConfig(run)
  if (!config) {
    throw new OrchestrationError('kernel_config_changed', 'Kernel policy changed during rework.')
  }
  assertKernelTaskBindings(db, run.id, config)
  const task = db.getTask(params.task)
  const prior = db.getDispatchContextById(params.retryOf as string)
  const worker = db.getWorkerDispatch(params.retryOf as string)
  const resource = db.getWorkerTerminalResourceByOwner(params.retryOf as string)
  if (
    !task ||
    task.run_id !== run.id ||
    !prior ||
    prior.task_id !== task.id ||
    !worker ||
    !resource ||
    !prior.assignee_pane_key ||
    !prior.process_incarnation ||
    !worker.runtime_epoch ||
    !resource.pane_key ||
    !resource.process_incarnation ||
    resource.ownership_state !== 'owned' ||
    (resource.release_state !== 'not_requested' &&
      (resource.release_state !== 'retained' || resource.retained_reason !== 'user_requested'))
  ) {
    reject('Original Worker resource is not eligible for same-owner rework.')
  }
  const repo = await runtime.showRepo(`id:${config.repoId}`)
  const worktree = await runtime.showManagedTerminalWorkspace(params.worktree as string)
  const terminal = await runtime.showTerminal(params.terminal as string)
  if (
    !isGitRepoKind(repo) ||
    repo.id !== config.repoId ||
    repo.connectionId ||
    (repo.executionHostId && repo.executionHostId !== 'local') ||
    isWslUncPath(repo.path) ||
    worktree.id !== resource.worktree_id ||
    worktree.repoId !== repo.id ||
    !worktree.branch ||
    terminal.handle !== params.terminal ||
    terminal.worktreeId !== worktree.id ||
    !(await runtime.isTerminalRunningAgent(params.terminal as string))
  ) {
    reject('Rework requires the live original local Git worktree and agent terminal.')
  }
  const paneKey = runtime.getTerminalPaneKey(params.terminal as string)
  const processIncarnation = runtime.getTerminalProcessIncarnation(params.terminal as string)
  const hostScope = parseWorkerTerminalHostScope(resource.host_scope)
  if (
    !paneKey ||
    !processIncarnation ||
    hostScope?.kind !== 'local' ||
    !isEquivalentPaneKey(paneKey, prior.assignee_pane_key) ||
    !isEquivalentPaneKey(paneKey, resource.pane_key) ||
    processIncarnation !== prior.process_incarnation ||
    processIncarnation !== resource.process_incarnation ||
    resource.terminal_handle !== params.terminal ||
    worker.agent_terminal_handle !== params.terminal ||
    worker.worktree_id !== worktree.id ||
    worker.runtime_epoch !== runtime.getRuntimeId()
  ) {
    reject('Original Worker terminal identity is no longer current.')
  }
  return {
    priorDispatchId: prior.id,
    resourceId: resource.id,
    worktreeId: worktree.id,
    terminalHandle: params.terminal as string,
    paneKey,
    processIncarnation,
    hostScope: resource.host_scope as string,
    branch: worktree.branch,
    repoId: repo.id,
    runtimeEpoch: worker.runtime_epoch
  }
}
