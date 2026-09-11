import { isEquivalentPaneKey } from './db/pane-key-match'
import type { OrchestrationDb } from './db'
import {
  readKernelAcceptanceRecord,
  type KernelReworkStartBinding
} from './kernel-acceptance-policy'
import type { KernelRunConfig } from './kernel-run-config'
import { OrchestrationError } from './orchestration-error'
import type { RunRow, TaskRow } from './types'
import type { WorkerTerminalResourceRow } from './worker-terminal-ownership'

export function assertKernelReworkStart(
  db: OrchestrationDb,
  run: RunRow,
  config: KernelRunConfig,
  task: TaskRow,
  base: { baseCommit: string },
  start: KernelReworkStartBinding,
  retryOf?: string
): void {
  const { kernelRework: rework } = start
  if (
    !retryOf ||
    retryOf !== rework.priorDispatchId ||
    start.repo !== `id:${config.repoId}` ||
    start.baseBranch !== base.baseCommit ||
    start.worktree !== `id:${rework.worktreeId}` ||
    rework.repoId !== config.repoId
  ) {
    throw new OrchestrationError(
      'kernel_rework_invalid',
      'Rework binding differs from Kernel policy.'
    )
  }
  const prior = db.getDispatchContextById(rework.priorDispatchId)
  const priorWorker = db.getWorkerDispatch(rework.priorDispatchId)
  const resource = db.getWorkerTerminalResource(rework.resourceId)
  const acceptance = readKernelAcceptanceRecord(task.kernel_acceptance)
  if (
    !prior ||
    prior.run_id !== run.id ||
    prior.task_id !== task.id ||
    db.getDispatchContext(task.id)?.id !== prior.id ||
    prior.status !== 'completed' ||
    prior.assignee_handle !== rework.historicalTerminalHandle ||
    !prior.assignee_pane_key ||
    !isEquivalentPaneKey(prior.assignee_pane_key, rework.paneKey) ||
    prior.process_incarnation !== rework.processIncarnation ||
    !priorWorker ||
    priorWorker.state !== 'succeeded' ||
    priorWorker.stage !== 'settled' ||
    priorWorker.runtime_epoch !== rework.runtimeEpoch ||
    priorWorker.worktree_id !== rework.worktreeId ||
    priorWorker.agent_terminal_handle !== rework.historicalTerminalHandle ||
    task.status !== 'completed' ||
    acceptance?.status === 'accepted' ||
    acceptance?.status === 'checking' ||
    hasActiveKernelDownstream(db, config, task.id) ||
    db.getFederatedDispatch(prior.id) ||
    !resource ||
    db.getWorkerTerminalResourceByOwner(prior.id)?.id !== resource.id ||
    resource.owner_dispatch_id !== prior.id ||
    resource.terminal_handle !== rework.historicalTerminalHandle ||
    resource.worktree_id !== rework.worktreeId ||
    !resource.pane_key ||
    !isEquivalentPaneKey(resource.pane_key, rework.paneKey) ||
    resource.process_incarnation !== rework.processIncarnation ||
    resource.host_scope !== rework.hostScope ||
    resource.ownership_state !== 'owned' ||
    (resource.release_state !== 'not_requested' &&
      (resource.release_state !== 'retained' || resource.retained_reason !== 'user_requested')) ||
    !hasKernelReworkResourceLineage(db, run.id, task.id, resource, rework)
  ) {
    throw new OrchestrationError(
      'kernel_rework_invalid',
      'Rework requires the original unaccepted local Worker resource.'
    )
  }
}

function hasKernelReworkResourceLineage(
  db: OrchestrationDb,
  runId: string,
  taskId: string,
  resource: WorkerTerminalResourceRow,
  rework: KernelReworkStartBinding['kernelRework']
): boolean {
  let owners: unknown
  try {
    owners = JSON.parse(resource.prior_owner_dispatch_ids)
  } catch {
    return false
  }
  if (
    !Array.isArray(owners) ||
    !owners.every((owner) => typeof owner === 'string') ||
    resource.origin_dispatch_id !== rework.originDispatchId ||
    (owners.length
      ? owners[0] !== resource.origin_dispatch_id
      : resource.owner_dispatch_id !== resource.origin_dispatch_id)
  ) {
    return false
  }
  const lineage = [...owners, resource.owner_dispatch_id] as string[]
  if (new Set(lineage).size !== lineage.length) {
    return false
  }
  return lineage.every((dispatchId) => {
    const dispatch = db.getDispatchContextById(dispatchId),
      worker = db.getWorkerDispatch(dispatchId)
    return Boolean(
      dispatch &&
      worker &&
      dispatch.run_id === runId &&
      dispatch.task_id === taskId &&
      dispatch.status === 'completed' &&
      dispatch.assignee_pane_key &&
      isEquivalentPaneKey(dispatch.assignee_pane_key, rework.paneKey) &&
      dispatch.process_incarnation === rework.processIncarnation &&
      worker.state === 'succeeded' &&
      worker.stage === 'settled' &&
      worker.worktree_id === rework.worktreeId &&
      !db.getFederatedDispatch(dispatchId)
    )
  })
}

function hasActiveKernelDownstream(
  db: OrchestrationDb,
  config: KernelRunConfig,
  taskId: string
): boolean {
  const pending = [taskId],
    visited = new Set<string>()
  while (pending.length > 0) {
    const current = pending.pop() as string
    for (const planned of config.plan.tasks) {
      if (!planned.dependsOn.includes(current) || visited.has(planned.key)) {
        continue
      }
      if (db.getTask(planned.key)?.status === 'dispatched') {
        return true
      }
      visited.add(planned.key)
      pending.push(planned.key)
    }
  }
  return false
}
