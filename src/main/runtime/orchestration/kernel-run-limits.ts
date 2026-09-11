import type { OrchestrationDb } from './db'
import { OrchestrationError } from './orchestration-error'
import { isEquivalentPaneKey } from './db/pane-key-match'
import { parseWorkerTerminalHostScope } from './worker-terminal-process-liveness'

export type KernelLimits = {
  maxConcurrentWorkers: number
  maxAttemptsPerTask: number
  maxAttempts: number
}

export function assertKernelHistoryResetAllowed(db: OrchestrationDb): void {
  if (
    db.db
      .prepare(
        'SELECT 1 FROM runs WHERE kernel_config IS NOT NULL OR kernel_default_max_attempts IS NOT NULL LIMIT 1'
      )
      .get()
  ) {
    throw new OrchestrationError(
      'kernel_unsupported_path',
      'Reset cannot erase Kernel Run attempt history, including after management is disabled.'
    )
  }
}

export function parseKernelLimits(input: unknown, defaultMaxAttempts: number): KernelLimits {
  const defaults: KernelLimits = {
    maxConcurrentWorkers: 2,
    maxAttemptsPerTask: 2,
    maxAttempts: defaultMaxAttempts
  }
  if (
    !Number.isSafeInteger(defaultMaxAttempts) ||
    defaultMaxAttempts <= 0 ||
    (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input)))
  ) {
    throw new OrchestrationError(
      'kernel_limits_invalid',
      'Kernel limits must be finite positive integers.'
    )
  }
  const supplied = (input ?? {}) as Record<string, unknown>
  for (const [key, value] of Object.entries(supplied)) {
    if (
      !Object.hasOwn(defaults, key) ||
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value <= 0
    ) {
      throw new OrchestrationError(
        'kernel_limits_invalid',
        'Kernel limits must be finite positive integers with known names.'
      )
    }
  }
  return { ...defaults, ...supplied } as KernelLimits
}

export function kernelOccupiedSlots(db: OrchestrationDb, runId: string): number {
  const rows = db.db
    .prepare(`
    SELECT dispatch.id, worker.residual_resources, (
      dispatch.status IN ('pending', 'dispatched')
      OR COALESCE(worker.state NOT IN ('succeeded', 'failed', 'stopped', 'abandoned'), 0)
      OR EXISTS (SELECT 1 FROM worker_terminal_resources resource WHERE resource.owner_dispatch_id = dispatch.id
        AND (resource.ownership_state != 'released' OR resource.release_state != 'released'))
    ) AS occupied
    FROM dispatch_contexts dispatch
    LEFT JOIN worker_dispatches worker ON worker.dispatch_id = dispatch.id
    WHERE dispatch.run_id = ?
  `)
    .all(runId) as { id: string; occupied: number; residual_resources: string | null }[]
  return rows.filter(
    (row) => row.occupied || hasUnreleasedKernelResiduals(db, row.id, row.residual_resources)
  ).length
}

function hasUnreleasedKernelResiduals(
  db: OrchestrationDb,
  dispatchId: string,
  serialized: string | null
): boolean {
  if (serialized === null || serialized === '[]') {
    return false
  }
  let residuals: unknown
  try {
    residuals = JSON.parse(serialized)
  } catch {
    return true
  }
  if (!Array.isArray(residuals)) {
    return true
  }
  if (residuals.length === 0) {
    return false
  }
  const worker = db.getWorkerDispatch(dispatchId)
  const dispatch = db.getDispatchContextById(dispatchId)
  const resource = db.getWorkerTerminalResourceByOwner(dispatchId)
  if (
    !worker ||
    !dispatch ||
    !resource ||
    resource.origin_dispatch_id !== dispatchId ||
    resource.owner_dispatch_id !== dispatchId ||
    resource.ownership_state !== 'released' ||
    resource.release_state !== 'released' ||
    parseWorkerTerminalHostScope(resource.host_scope)?.kind !== 'local' ||
    db.getFederatedDispatch(dispatchId) ||
    !worker.worktree_id?.includes('::') ||
    worker.worktree_id.startsWith('folder:') ||
    resource.worktree_id !== worker.worktree_id ||
    resource.terminal_handle !== worker.agent_terminal_handle ||
    resource.terminal_handle !== dispatch.assignee_handle ||
    !resource.pane_key ||
    !dispatch.assignee_pane_key ||
    !isEquivalentPaneKey(resource.pane_key, dispatch.assignee_pane_key) ||
    !resource.process_incarnation ||
    resource.process_incarnation !== dispatch.process_incarnation
  ) {
    return true
  }
  return residuals.some((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return true
    }
    const residual = entry as Record<string, unknown>
    if (residual.kind === 'worktree') {
      return (
        residual.id !== resource.worktree_id ||
        (residual.action !== 'created_child' && residual.action !== 'created_top_level')
      )
    }
    if (residual.kind === 'terminal') {
      return (
        residual.id !== resource.terminal_handle ||
        residual.role !== 'agent' ||
        (residual.action !== 'created' && residual.action !== 'reused_agent_terminal')
      )
    }
    return true
  })
}

export function assertKernelLimits(
  db: OrchestrationDb,
  runId: string,
  taskId: string,
  limits: KernelLimits
): void {
  const history = db.db
    .prepare(`
    SELECT COUNT(*) AS attempts, COALESCE(SUM(task_id = ?), 0) AS taskAttempts
    FROM dispatch_contexts WHERE run_id = ?
  `)
    .get(taskId, runId) as { attempts: number; taskAttempts: number }
  if (history.taskAttempts >= limits.maxAttemptsPerTask) {
    throw new OrchestrationError(
      'kernel_task_attempt_limit',
      'This Task has reached its attempt limit.'
    )
  }
  if (history.attempts >= limits.maxAttempts) {
    throw new OrchestrationError(
      'kernel_run_attempt_limit',
      'This Run has reached its cumulative attempt limit.'
    )
  }
  if (kernelOccupiedSlots(db, runId) >= limits.maxConcurrentWorkers) {
    throw new OrchestrationError(
      'kernel_concurrency_limit',
      'This Run has reached its concurrent Worker limit.'
    )
  }
}
