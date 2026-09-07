import type { OrchestrationDb } from './db'
import { validatePlan, type Plan } from './kernel-plan'
import { OrchestrationError } from './orchestration-error'
import type { RunRow } from './types'

export type KernelRunConfig = { repoId: string; plan: Plan }

export function parseKernelRunConfig(input: unknown): KernelRunConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new OrchestrationError('kernel_config_invalid', 'Kernel configuration must be an object.')
  }
  const value = input as Record<string, unknown>
  if (
    Object.keys(value).some((key) => key !== 'repoId' && key !== 'plan') ||
    typeof value.repoId !== 'string' ||
    !value.repoId.trim() ||
    value.repoId !== value.repoId.trim()
  ) {
    throw new OrchestrationError(
      'kernel_config_invalid',
      'Kernel requires a canonical repoId and plan.'
    )
  }
  const checked = validatePlan(value.plan)
  if (!checked.ok) {
    throw new OrchestrationError(
      'kernel_plan_invalid',
      'Kernel plan validation failed.',
      checked.errors
    )
  }
  return { repoId: value.repoId, plan: checked.plan }
}

export function readKernelRunConfig(run: RunRow): KernelRunConfig | null {
  if (run.kernel_config == null) {
    return null
  }
  let input: unknown
  try {
    input = JSON.parse(run.kernel_config)
  } catch {
    throw new OrchestrationError(
      'kernel_config_invalid',
      'Stored Kernel configuration is not JSON.'
    )
  }
  // Why: serialized null or an unknown version must not silently disable protection.
  return parseKernelRunConfig(input)
}

export function assertKernelTaskBindings(
  db: OrchestrationDb,
  runId: string,
  config: KernelRunConfig
): void {
  for (const planned of config.plan.tasks) {
    const task = db.getTask(planned.key)
    if (!task || task.run_id !== runId) {
      throw new OrchestrationError(
        'kernel_task_mismatch',
        'Every plan key must name a Task in this Run.'
      )
    }
    let dependencies: unknown
    try {
      dependencies = JSON.parse(task.deps)
    } catch {
      throw new OrchestrationError('kernel_task_mismatch', 'Task dependencies are not valid JSON.')
    }
    if (
      !Array.isArray(dependencies) ||
      dependencies.length !== planned.dependsOn.length ||
      new Set(dependencies).size !== dependencies.length ||
      dependencies.some((key) => !planned.dependsOn.includes(key))
    ) {
      throw new OrchestrationError(
        'kernel_task_mismatch',
        'Task dependencies differ from the approved plan.'
      )
    }
  }
}

export function assertKernelWorkerPolicy(
  db: OrchestrationDb,
  taskId: string,
  expectedConfig?: string | null
): void {
  const task = db.getTask(taskId)
  if (!task) {
    return
  }
  const run = task && db.getRun(task.run_id)
  if (!run) {
    throw new OrchestrationError('run_not_found', 'Worker Task has no Run.')
  }
  const stored = run.kernel_config ?? null
  if (
    (expectedConfig !== undefined && stored !== expectedConfig) ||
    (stored !== null && expectedConfig !== stored)
  ) {
    throw new OrchestrationError(
      'kernel_config_changed',
      'Worker admission does not match the persisted Run policy.'
    )
  }
  const config = readKernelRunConfig(run)
  if (!config) {
    return
  }
  assertKernelTaskBindings(db, run.id, config)
  const planned = config.plan.tasks.find((entry) => entry.key === taskId)
  if (!planned) {
    throw new OrchestrationError('kernel_task_unapproved', 'Task is not approved by this Run.')
  }
  if (planned.dependsOn.length > 0) {
    throw new OrchestrationError(
      'kernel_dependency_unsupported',
      'Managed dependent Tasks require trusted acceptance and landed code; native completion is insufficient.'
    )
  }
}

export function assertKernelLowLevelDispatch(db: OrchestrationDb, taskId: string): void {
  const task = db.getTask(taskId)
  const run = task && db.getRun(task.run_id)
  if (run && readKernelRunConfig(run)) {
    throw new OrchestrationError(
      'kernel_unsupported_path',
      'Kernel Runs require supervised workerStart.'
    )
  }
}

export function configureKernelRun(
  db: OrchestrationDb,
  expectedRun: RunRow,
  input: unknown
): RunRow {
  const config = input === null ? null : parseKernelRunConfig(input)
  db.db.exec('BEGIN IMMEDIATE')
  try {
    const run = db.getRun(expectedRun.id)
    if (
      !run ||
      run.legacy ||
      run.consumer_generation !== expectedRun.consumer_generation ||
      run.coordinator_pane_key !== expectedRun.coordinator_pane_key
    ) {
      throw new OrchestrationError(
        'consumer_fenced',
        'The Run coordinator changed before configuration.'
      )
    }
    const active = db.db
      .prepare(`
      SELECT 1 FROM dispatch_contexts WHERE run_id = ? AND status IN ('pending', 'dispatched')
      UNION ALL
      SELECT 1 FROM worker_dispatches worker
      JOIN dispatch_contexts dispatch ON dispatch.id = worker.dispatch_id
      WHERE dispatch.run_id = ? AND worker.state NOT IN ('succeeded', 'failed', 'stopped', 'abandoned')
      UNION ALL
      SELECT 1 FROM worker_terminal_resources resource
      JOIN dispatch_contexts dispatch ON dispatch.id = resource.owner_dispatch_id
      WHERE dispatch.run_id = ? AND resource.ownership_state != 'released'
        AND resource.release_state != 'released'
      LIMIT 1
    `)
      .get(run.id, run.id, run.id)
    if (active) {
      throw new OrchestrationError(
        'kernel_run_active',
        'Stop or release existing Run resources before changing Kernel configuration.'
      )
    }
    if (config) {
      assertKernelTaskBindings(db, run.id, config)
    }
    db.db
      .prepare("UPDATE runs SET kernel_config = ?, updated_at = datetime('now') WHERE id = ?")
      .run(config ? JSON.stringify(config) : null, run.id)
    db.db.exec('COMMIT')
    return db.getRun(run.id) as RunRow
  } catch (error) {
    db.db.exec('ROLLBACK')
    throw error
  }
}
