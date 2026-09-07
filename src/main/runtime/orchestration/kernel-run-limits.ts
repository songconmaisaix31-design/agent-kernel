import type { OrchestrationDb } from './db'
import { OrchestrationError } from './orchestration-error'

export type KernelLimits = {
  maxConcurrentWorkers: number
  maxAttemptsPerTask: number
  maxAttempts: number
}

export function assertKernelHistoryResetAllowed(db: OrchestrationDb): void {
  // Raw markers deliberately fence disabled and damaged policies too; never parse-and-ignore them.
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
  // Count a Dispatch once even if several native records indicate that it still owns resources.
  const row = db.db
    .prepare(`
    SELECT COUNT(*) AS occupied FROM dispatch_contexts dispatch WHERE dispatch.run_id = ? AND (
      dispatch.status IN ('pending', 'dispatched')
      OR EXISTS (SELECT 1 FROM worker_dispatches worker WHERE worker.dispatch_id = dispatch.id AND (
        worker.state NOT IN ('succeeded', 'failed', 'stopped', 'abandoned')
        OR worker.residual_resources != '[]'
      ))
      OR EXISTS (SELECT 1 FROM worker_terminal_resources resource WHERE resource.owner_dispatch_id = dispatch.id
        AND (resource.ownership_state != 'released' OR resource.release_state != 'released'))
    )
  `)
    .get(runId) as { occupied: number }
  return row.occupied
}

export function assertKernelLimits(
  db: OrchestrationDb,
  runId: string,
  taskId: string,
  limits: KernelLimits
): void {
  // The caller repeats this inside createStartingWorkerDispatch's BEGIN IMMEDIATE.
  // Native historical Dispatches and failed starts count even if a new plan no longer lists their Task.
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
