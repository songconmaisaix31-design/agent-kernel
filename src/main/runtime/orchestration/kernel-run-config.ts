import { kernelDependencyBase, assertKernelDependencyBase } from './kernel-dependency-base'
import { parseKernelStartBinding } from './kernel-acceptance-policy'
import { StoredAcceptancePolicy, type AcceptancePolicy } from './kernel-acceptance-policy'
import type { OrchestrationDb } from './db'
import { validatePlan, type Plan } from './kernel-plan'
import { OrchestrationError } from './orchestration-error'
import type { RunRow } from './types'
import { isEquivalentPaneKey } from './db/pane-key-match'
import {
  assertKernelLimits,
  kernelOccupiedSlots,
  parseKernelLimits,
  type KernelLimits
} from './kernel-run-limits'

export type KernelOwner = { terminalHandle: string; paneKey: string }
export type KernelRunConfig = {
  repoId: string
  plan: Plan
  owner?: KernelOwner
  limits: KernelLimits
  acceptancePolicy?: AcceptancePolicy
}

export function parseKernelRunConfig(input: unknown, defaultMaxAttempts?: number): KernelRunConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new OrchestrationError('kernel_config_invalid', 'Kernel configuration must be an object.')
  }
  const value = input as Record<string, unknown>
  if (
    Object.keys(value).some(
      (key) => !['repoId', 'plan', 'owner', 'limits', 'acceptancePolicy'].includes(key)
    ) ||
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
  let owner: KernelOwner | undefined
  if ('owner' in value) {
    const candidate = value.owner as Record<string, unknown> | null
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate) ||
      Object.keys(candidate).length !== 2 ||
      !['terminalHandle', 'paneKey'].every(
        (key) =>
          typeof candidate[key] === 'string' &&
          (candidate[key] as string).trim().length > 0 &&
          candidate[key] === (candidate[key] as string).trim()
      )
    ) {
      throw new OrchestrationError('kernel_config_invalid', 'Stored Kernel owner is invalid.')
    }
    owner = {
      terminalHandle: candidate.terminalHandle as string,
      paneKey: candidate.paneKey as string
    }
  }
  const policy =
    value.acceptancePolicy === undefined
      ? undefined
      : StoredAcceptancePolicy.safeParse(value.acceptancePolicy)
  if (policy && !policy.success) {
    throw new OrchestrationError('kernel_policy_invalid', 'Stored acceptance policy is invalid.')
  }
  return {
    ...(policy?.success ? { acceptancePolicy: policy.data } : {}),
    repoId: value.repoId,
    plan: checked.plan,
    ...(owner ? { owner } : {}),
    limits: parseKernelLimits(value.limits, defaultMaxAttempts ?? 2 * checked.plan.tasks.length)
  }
}

export function assertKernelRunOwner(db: OrchestrationDb, run: RunRow, caller: KernelOwner): void {
  const config = readKernelRunConfig(run)
  const sameOwner = (owner: KernelOwner) =>
    owner.terminalHandle === caller.terminalHandle &&
    isEquivalentPaneKey(owner.paneKey, caller.paneKey)
  const currentOwner =
    run.coordinator_handle && run.coordinator_pane_key
      ? { terminalHandle: run.coordinator_handle, paneKey: run.coordinator_pane_key }
      : null
  if (
    run.legacy ||
    (currentOwner && !sameOwner(currentOwner)) ||
    ((!run.coordinator_handle || !run.coordinator_pane_key) &&
      (run.coordinator_handle !== null || run.coordinator_pane_key !== null))
  ) {
    throw new OrchestrationError('consumer_fenced', 'Run has a different or invalid current owner.')
  }
  if (config?.owner) {
    if (sameOwner(config.owner)) {
      return
    }
  } else if (currentOwner) {
    return
  } else {
    // Narrow legacy compatibility: a single native coordinator history entry, not any prior caller.
    const history = db.db
      .prepare('SELECT terminal_handle FROM run_coordinator_handles WHERE run_id = ?')
      .all(run.id) as { terminal_handle: string }[]
    if (history.length === 1 && history[0].terminal_handle === caller.terminalHandle) {
      return
    }
  }
  throw new OrchestrationError(
    'consumer_fenced',
    'Only the proven original Kernel owner may restore this Run.'
  )
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
  return parseKernelRunConfig(input, run.kernel_default_max_attempts ?? undefined)
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
  expectedConfig?: string | null,
  execution?: { startOptions: unknown }
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
  const base = kernelDependencyBase(db, run, config, taskId)
  if (base.dependency && execution) {
    const options = parseKernelStartBinding(JSON.stringify(execution.startOptions))
    if (
      options.repo !== `id:${config.repoId}` ||
      options.baseBranch !== base.baseCommit ||
      !options.kernelBase
    ) {
      throw new OrchestrationError(
        'kernel_dependency_invalid',
        'Dispatch requires the server-selected dependency base.'
      )
    }
    assertKernelDependencyBase(base, options.kernelBase)
  }
  assertKernelLimits(db, run.id, taskId, config.limits)
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
  if (input && typeof input === 'object' && ('owner' in input || 'acceptancePolicy' in input)) {
    throw new OrchestrationError(
      'kernel_config_invalid',
      'Kernel owner and acceptance policy are assigned through verified server approval.'
    )
  }
  let config = input === null ? null : parseKernelRunConfig(input)
  db.db.exec('BEGIN IMMEDIATE')
  try {
    const run = db.getRun(expectedRun.id)
    if (
      !run ||
      run.legacy ||
      !run.coordinator_handle ||
      !run.coordinator_pane_key ||
      run.consumer_generation !== expectedRun.consumer_generation ||
      run.coordinator_handle !== expectedRun.coordinator_handle ||
      run.coordinator_pane_key !== expectedRun.coordinator_pane_key
    ) {
      throw new OrchestrationError(
        'consumer_fenced',
        'The Run coordinator changed before configuration.'
      )
    }
    const active = kernelOccupiedSlots(db, run.id)
    if (active) {
      throw new OrchestrationError(
        'kernel_run_active',
        'Stop or release existing Run resources before changing Kernel configuration.'
      )
    }
    const owner = {
      terminalHandle: run.coordinator_handle,
      paneKey: run.coordinator_pane_key
    }
    if (run.kernel_config != null) {
      assertKernelRunOwner(db, run, owner)
    }
    const original = readKernelRunConfig(run)
    const originalTaskCount = original?.plan.tasks.length ?? config?.plan.tasks.length
    const anchor =
      run.kernel_default_max_attempts ??
      (originalTaskCount === undefined ? null : 2 * originalTaskCount)
    if (anchor !== null) {
      // Preserve a v30 plan's original ceiling even when its first post-upgrade operation is disable.
      db.db
        .prepare(
          'UPDATE runs SET kernel_default_max_attempts = COALESCE(kernel_default_max_attempts, ?) WHERE id = ?'
        )
        .run(anchor, run.id)
    }
    if (config) {
      config = parseKernelRunConfig(input, anchor ?? undefined)
      assertKernelTaskBindings(db, run.id, config)
      config.owner = original?.owner ?? owner
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
