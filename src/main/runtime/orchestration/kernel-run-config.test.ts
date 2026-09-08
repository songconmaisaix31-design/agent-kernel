import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OrchestrationDb } from './db'
import { configureKernelRun, readKernelRunConfig } from './kernel-run-config'
import type { Plan } from './kernel-plan'
import type { RunRow } from './types'

describe('Kernel Run persistence', () => {
  let db: OrchestrationDb
  let run: RunRow
  let plan: Plan
  const directories: string[] = []

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    run = db.createRun({
      objective: 'Kernel test',
      coordinatorHandle: 'term_coord',
      coordinatorPaneKey: 'pane_coord'
    })
    const task = db.createTask({ spec: 'Implement one file', runId: run.id })
    plan = {
      schemaVersion: 1,
      objective: 'Implement one file',
      nonGoals: [],
      baseCommit: 'a'.repeat(40),
      tasks: [
        {
          key: task.id,
          owner: 'worker',
          writePaths: ['src/one.ts'],
          dependsOn: [],
          acceptance: ['unit test'],
          escalateWhen: []
        }
      ]
    }
  })

  afterEach(() => {
    db.close()
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('defaults to native and persists a detached approved plan on the existing Run', () => {
    expect(run.kernel_config).toBeNull()
    expect(readKernelRunConfig(run)).toBeNull()
    const configured = configureKernelRun(db, run, { repoId: 'repo', plan })
    plan.tasks[0].writePaths.push('outside.ts')
    expect(readKernelRunConfig(configured)?.plan.tasks[0].writePaths).toEqual(['src/one.ts'])
    expect(db.getRun(run.id)?.kernel_config).toBe(configured.kernel_config)
    expect(configureKernelRun(db, configured, null).kernel_config).toBeNull()
  })

  it('persists approved task body bytes independently of mutable plan and native Task text', () => {
    const approvedBody =
      '  Add parsePort with range checks.\r\nKeep Unicode 示例 and trailing whitespace.\n '
    plan.tasks[0].spec = approvedBody
    const configured = configureKernelRun(db, run, { repoId: 'repo', plan })
    plan.tasks[0].spec = 'Unapproved local revision'
    db.db
      .prepare('UPDATE tasks SET spec = ? WHERE id = ?')
      .run('Unapproved native revision', plan.tasks[0].key)
    expect(readKernelRunConfig(configured)?.plan.tasks[0].spec).toBe(approvedBody)
    expect(readKernelRunConfig(db.getRun(run.id)!)?.plan.tasks[0].spec).toBe(approvedBody)
  })

  it.each([
    {},
    { repoId: 'repo', plan: {} },
    { repoId: 'repo', plan: null },
    { repoId: ' repo ', plan: {} },
    { repoId: 'repo', enabled: false, plan: {} }
  ])('rejects malformed input without changing Run policy: %j', (input) => {
    expect(() => configureKernelRun(db, run, input)).toThrow()
    expect(db.getRun(run.id)?.kernel_config).toBeNull()
  })

  it.each(['{', 'null', '{}', '{"repoId":"repo","plan":{"schemaVersion":2}}'])(
    'fails closed on persisted %s',
    (raw) => {
      db.db.prepare('UPDATE runs SET kernel_config = ? WHERE id = ?').run(raw, run.id)
      expect(() => readKernelRunConfig(db.getRun(run.id)!)).toThrow()
    }
  )

  it('rejects unknown and foreign Task IDs', () => {
    const other = db.createRun({
      objective: 'Other',
      coordinatorHandle: 'term_other',
      coordinatorPaneKey: 'pane_other'
    })
    const foreign = db.createTask({ spec: 'Foreign', runId: other.id })
    for (const key of ['task_missing', foreign.id]) {
      plan.tasks[0].key = key
      expect(() => configureKernelRun(db, run, { repoId: 'repo', plan })).toThrow(
        /Task in this Run/
      )
      expect(db.getRun(run.id)?.kernel_config).toBeNull()
    }
  })

  it('requires declared serial sharing to match native Task dependencies', () => {
    const next = db.createTask({ spec: 'Next', runId: run.id })
    plan.tasks.push({ ...plan.tasks[0], key: next.id, dependsOn: [plan.tasks[0].key] })
    expect(() => configureKernelRun(db, run, { repoId: 'repo', plan })).toThrow(
      /dependencies differ/
    )
    db.db
      .prepare('UPDATE tasks SET deps = ? WHERE id = ?')
      .run(JSON.stringify([plan.tasks[0].key]), next.id)
    expect(
      readKernelRunConfig(configureKernelRun(db, run, { repoId: 'repo', plan }))?.plan.tasks
    ).toHaveLength(2)
  })

  it('rejects configuration changes after coordinator generation changes', () => {
    db.db
      .prepare('UPDATE runs SET consumer_generation = consumer_generation + 1 WHERE id = ?')
      .run(run.id)
    expect(() => configureKernelRun(db, run, { repoId: 'repo', plan })).toThrow(
      /coordinator changed/
    )
  })

  it('refuses disabling or replacing policy while a Dispatch is starting', () => {
    const configured = configureKernelRun(db, run, { repoId: 'repo', plan })
    db.createStartingWorkerDispatch({
      taskId: plan.tasks[0].key,
      startOptions: {},
      expectedKernelConfig: configured.kernel_config
    })
    for (const input of [null, { repoId: 'another', plan }]) {
      expect(() => configureKernelRun(db, configured, input)).toThrow(/Stop or release/)
      expect(db.getRun(run.id)?.kernel_config).toBe(configured.kernel_config)
    }
  })

  it('counts retained terminal resources even after a Task reported completion', () => {
    const dispatch = db.createDispatchContext(plan.tasks[0].key, 'term_worker')
    db.settleWorkerReport({
      taskId: plan.tasks[0].key,
      dispatchId: dispatch.id,
      outcome: 'succeeded',
      result: '{}'
    })
    const configured = configureKernelRun(db, run, { repoId: 'repo', plan })
    db.db
      .prepare(`INSERT INTO worker_terminal_resources
      (id, origin_dispatch_id, owner_dispatch_id, terminal_handle, release_state)
      VALUES ('resource_test', ?, ?, 'term_worker', 'retained')`)
      .run(dispatch.id, dispatch.id)
    expect(() => configureKernelRun(db, configured, null)).toThrow(/Stop or release/)
  })

  it('rejects direct DB dispatch and missing supervised admission on a managed Run', () => {
    configureKernelRun(db, run, { repoId: 'repo', plan })
    expect(() => db.createDispatchContext(plan.tasks[0].key, 'term_worker')).toThrow(/supervised/)
    expect(() =>
      db.createStartingWorkerDispatch({ taskId: plan.tasks[0].key, startOptions: {} })
    ).toThrow(/admission/)
    expect(db.getDispatchContext(plan.tasks[0].key)).toBeUndefined()
  })

  it('checks stale policy inside the transaction across two SQLite connections without a receipt', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-kernel-race-'))
    directories.push(directory)
    const file = join(directory, 'orchestration.db')
    db.close()
    db = new OrchestrationDb(file)
    run = db.createRun({
      objective: 'Race',
      coordinatorHandle: 'term_coord',
      coordinatorPaneKey: 'pane_coord'
    })
    plan.tasks[0].key = db.createTask({ spec: 'Race', runId: run.id }).id
    const configured = configureKernelRun(db, run, { repoId: 'repo', plan })
    const concurrent = new OrchestrationDb(file)
    try {
      configureKernelRun(concurrent, concurrent.getRun(run.id)!, null)
      const receipt = {
        callerFingerprint: 'caller-test',
        requestId: 'request-test',
        method: 'orchestration.workerStart',
        payloadHash: 'payload-test'
      }
      expect(() =>
        db.createStartingWorkerDispatch({
          taskId: plan.tasks[0].key,
          startOptions: {},
          expectedKernelConfig: configured.kernel_config,
          mutationReceipt: receipt
        })
      ).toThrow(/admission/)
      expect(db.getMutationReceipt(receipt.callerFingerprint, receipt.requestId)).toBeUndefined()
      expect(db.getDispatchContext(plan.tasks[0].key)).toBeUndefined()
      expect(db.getTask(plan.tasks[0].key)?.status).toBe('ready')
    } finally {
      concurrent.close()
    }
  })

  it('migrates an existing v29 Run to nullable settings and survives reopening', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-kernel-db-'))
    directories.push(directory)
    const file = join(directory, 'orchestration.db')
    db.close()
    db = new OrchestrationDb(file)
    const original = db.createRun({
      objective: 'Before Kernel',
      coordinatorHandle: 'term_old',
      coordinatorPaneKey: 'pane_old'
    })
    const task = db.createTask({ spec: 'Persist', runId: original.id })
    db.db.exec(
      'DROP TRIGGER trg_kernel_acceptance_run_changed; ALTER TABLE runs DROP COLUMN kernel_config; ALTER TABLE runs DROP COLUMN kernel_default_max_attempts; PRAGMA user_version = 29'
    )
    db.close()
    db = new OrchestrationDb(file)
    expect(db.db.pragma('user_version', { simple: true })).toBe(32)
    const migrated = db.getRun(original.id)!
    expect(migrated).toMatchObject({ objective: 'Before Kernel', kernel_config: null })
    plan.tasks[0].key = task.id
    configureKernelRun(db, migrated, { repoId: 'repo', plan })
    db.close()
    db = new OrchestrationDb(file)
    expect(readKernelRunConfig(db.getRun(original.id)!)).toMatchObject({
      repoId: 'repo',
      plan,
      owner: { terminalHandle: 'term_old', paneKey: 'pane_old' }
    })
  })

  it('upgrades a v30 configured Run without losing attempts and persists its default anchor', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-kernel-v30-'))
    directories.push(directory)
    const file = join(directory, 'orchestration.db')
    db.close()
    db = new OrchestrationDb(file)
    run = db.createRun({
      objective: 'Old configured Run',
      coordinatorHandle: 'term_coord',
      coordinatorPaneKey: 'pane_coord'
    })
    plan.tasks[0].key = db.createTask({ spec: 'Prior attempt', runId: run.id }).id
    const prior = db.createStartingWorkerDispatch({ taskId: plan.tasks[0].key, startOptions: {} })
    db.failWorkerStart(prior.dispatch.id, 'setup', 'Prior failure')
    db.db
      .prepare('UPDATE runs SET kernel_config = ? WHERE id = ?')
      .run(JSON.stringify({ repoId: 'repo', plan }), run.id)
    db.db.exec('ALTER TABLE runs DROP COLUMN kernel_default_max_attempts; PRAGMA user_version = 30')
    db.close()
    db = new OrchestrationDb(file)
    expect(db.db.pragma('user_version', { simple: true })).toBe(32)
    expect(readKernelRunConfig(db.getRun(run.id)!)?.limits.maxAttempts).toBe(2)
    configureKernelRun(db, db.getRun(run.id)!, { repoId: 'repo', plan })
    db.close()
    db = new OrchestrationDb(file)
    expect(db.getRun(run.id)?.kernel_default_max_attempts).toBe(2)
    expect(db.getWorkerDispatch(prior.dispatch.id)?.state).toBe('failed')
  })
  it('migrates native v31 Tasks additively without changing worker results', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-kernel-v31-'))
    directories.push(directory)
    const file = join(directory, 'orchestration.db')
    db.close()
    db = new OrchestrationDb(file)
    const prior = db.createTask({ spec: 'Preserve native task' })
    db.updateTaskStatus(prior.id, 'completed', 'native result')
    db.db.exec(
      'DROP TRIGGER trg_kernel_acceptance_run_changed; DROP TRIGGER trg_kernel_acceptance_task_changed; ALTER TABLE tasks DROP COLUMN kernel_acceptance; PRAGMA user_version = 31'
    )
    db.close()
    db = new OrchestrationDb(file)
    expect(db.db.pragma('user_version', { simple: true })).toBe(32)
    expect(db.getTask(prior.id)).toMatchObject({
      status: 'completed',
      result: 'native result',
      kernel_acceptance: null
    })
  })
  it('does not permit acceptance policy injection through ordinary Run configuration', () => {
    expect(() =>
      configureKernelRun(db, run, { repoId: 'repo', plan, acceptancePolicy: {} })
    ).toThrow()
    expect(db.getRun(run.id)?.kernel_config).toBeNull()
  })
})
