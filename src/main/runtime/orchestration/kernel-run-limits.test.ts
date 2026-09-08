import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OrchestrationDb } from './db'
import { configureKernelRun, readKernelRunConfig } from './kernel-run-config'
import type { Plan } from './kernel-plan'
import { kernelOccupiedSlots } from './kernel-run-limits'

describe('Kernel Run resource limits', () => {
  let db: OrchestrationDb
  let runId: string
  let plan: Plan

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    runId = db.createRun({
      objective: 'Bounded work',
      coordinatorHandle: 'term_coord',
      coordinatorPaneKey: 'pane_coord'
    }).id
    plan = {
      schemaVersion: 1,
      objective: 'Bounded work',
      nonGoals: [],
      baseCommit: 'a'.repeat(40),
      tasks: Array.from({ length: 3 }, (_, i) => ({
        key: db.createTask({ spec: `Task ${i}`, runId }).id,
        owner: `worker_${i}`,
        writePaths: [`src/${i}.ts`],
        dependsOn: [],
        acceptance: ['Test'],
        escalateWhen: []
      }))
    }
  })
  afterEach(() => db.close())

  function configure(limits?: unknown) {
    return configureKernelRun(db, db.getRun(runId)!, {
      repoId: 'repo',
      plan,
      ...(limits === undefined ? {} : { limits })
    })
  }

  function start(index: number, retryOf?: string) {
    return db.createStartingWorkerDispatch({
      taskId: plan.tasks[index].key,
      startOptions: {},
      expectedKernelConfig: db.getRun(runId)?.kernel_config,
      retryOf
    })
  }

  function releasedFailedStart() {
    configure({ maxConcurrentWorkers: 1 })
    const { dispatch } = start(0)
    const worktreeId = 'repo::/worktrees/failed-start'
    const effects = [
      { kind: 'worktree', action: 'created_top_level', id: worktreeId },
      {
        kind: 'terminal',
        role: 'agent',
        action: 'reused_agent_terminal',
        id: 'term_failed',
        tabId: 'tab_failed',
        leafId: 'leaf_failed'
      }
    ]
    db.prepareStartingWorkerAuthority({
      dispatchId: dispatch.id,
      handle: 'term_failed',
      paneKey: 'pane_failed',
      processIncarnation: 'process_failed',
      worktreeId,
      effects,
      setupState: 'skipped',
      hostScope: '{"kind":"local","hostId":"local"}',
      terminalOwnership: 'created'
    })
    db.failWorkerStart(dispatch.id, 'dispatch_input', 'agent_prompt_stalled')
    db.beginWorkerStop(dispatch.id, 'runtime_test')
    db.settleWorkerStop(dispatch.id)
    const resource = db.getWorkerTerminalResourceByOwner(dispatch.id)!
    expect(
      db.settleDeadWorkerTerminalRelease({
        requestingDispatchId: dispatch.id,
        resourceId: resource.id,
        processIncarnation: 'process_failed'
      }).disposition
    ).toBe('released')
    return { dispatchId: dispatch.id, resourceId: resource.id, effects, worktreeId }
  }

  it('reconfigures after exact native release of failed-start residuals', () => {
    const { dispatchId } = releasedFailedStart()
    const worker = db.getWorkerDispatch(dispatchId)
    const dispatch = db.getDispatchContextById(dispatchId)
    expect(dispatch?.capability_revoked_at).not.toBeNull()
    expect(() => configure({ maxConcurrentWorkers: 1, maxAttempts: 4 })).not.toThrow()
    expect(kernelOccupiedSlots(db, runId)).toBe(0)
    expect(db.getWorkerDispatch(dispatchId)).toEqual(worker)
    expect(db.getDispatchContextById(dispatchId)).toEqual(dispatch)
  })

  it('admits the next Task after exact release while preserving failed-start history', () => {
    const { dispatchId } = releasedFailedStart()
    expect(() => start(1)).not.toThrow()
    expect(db.getWorkerDispatch(dispatchId)).toMatchObject({
      state: 'stopped',
      stage: 'dispatch_input',
      last_error: 'agent_prompt_stalled'
    })
    expect(db.db.prepare('SELECT COUNT(*) AS n FROM dispatch_contexts').get()).toEqual({ n: 2 })
  })

  function expectResidualBlocked() {
    expect(kernelOccupiedSlots(db, runId)).toBe(1)
    expect(() => configure()).toThrow(/Stop or release existing Run resources/)
    expect(() => start(1)).toThrow(/concurrent Worker limit/)
    expect(db.getDispatchContext(plan.tasks[1].key)).toBeUndefined()
  }

  it.each([
    '{',
    'null',
    '{}',
    '"[]"',
    '[null]',
    '[[]]',
    '[1]',
    '[{}]',
    '[{"kind":"unknown","id":"term_failed"}]',
    '[{"kind":"worktree"}]',
    '[{"kind":"terminal"}]',
    '[{"kind":"terminal","id":"term_failed","action":"created"}]',
    '[{"kind":"terminal","id":"term_failed","role":"setup","action":"created"}]',
    '[{"kind":"terminal","id":"term_failed","role":"agent","action":["created"]}]',
    '[{"kind":"worktree","id":"repo::/worktrees/failed-start","action":1}]',
    '[{"kind":"worktree","id":"repo::/worktrees/failed-start","action":"unknown"}]'
  ])('blocks malformed or unknown residuals despite release: %s', (residuals) => {
    const { dispatchId } = releasedFailedStart()
    db.db
      .prepare('UPDATE worker_dispatches SET residual_resources = ? WHERE dispatch_id = ?')
      .run(residuals, dispatchId)
    expectResidualBlocked()
  })

  it.each(['terminal', 'worktree', 'unknown'])(
    'checks every residual including an additional unmapped %s',
    (kind) => {
      const { dispatchId, effects } = releasedFailedStart()
      db.db
        .prepare('UPDATE worker_dispatches SET residual_resources = ? WHERE dispatch_id = ?')
        .run(JSON.stringify([...effects, { ...effects[1], kind, id: 'unmapped' }]), dispatchId)
      expectResidualBlocked()
    }
  )

  it('allows repeated receipts for the same released terminal and preserves the parent artifact', () => {
    const { dispatchId, effects, worktreeId } = releasedFailedStart()
    const residuals = JSON.stringify([...effects, effects[1]])
    db.db
      .prepare('UPDATE worker_dispatches SET residual_resources = ? WHERE dispatch_id = ?')
      .run(residuals, dispatchId)
    configure()
    expect(() => start(1)).not.toThrow()
    expect(db.getWorkerDispatch(dispatchId)).toMatchObject({
      worktree_id: worktreeId,
      residual_resources: residuals
    })
  })

  it.each([
    ['ownership_state', 'owned'],
    ['ownership_state', 'external'],
    ['ownership_state', 'user_owned'],
    ['ownership_state', 'transferred'],
    ['release_state', 'retained'],
    ['release_state', 'unknown'],
    ['release_state', 'requested'],
    ['release_state', 'releasing'],
    ['release_state', 'not_requested'],
    ['terminal_handle', 'different_terminal'],
    ['worktree_id', 'repo::different'],
    ['worktree_id', null],
    ['pane_key', 'different_pane'],
    ['pane_key', null],
    ['process_incarnation', 'different_process'],
    ['process_incarnation', null],
    ['host_scope', 'ssh:other-host']
  ])('blocks released-resource inconsistency %s=%s', (column, value) => {
    const { resourceId } = releasedFailedStart()
    db.db
      .prepare(`UPDATE worker_terminal_resources SET ${column} = ? WHERE id = ?`)
      .run(value, resourceId)
    expectResidualBlocked()
  })

  it.each([
    null,
    '',
    '{',
    'null',
    '[]',
    '{}',
    '{"kind":"local"}',
    '{"kind":"local","hostId":"remote"}',
    '{"kind":"unknown","hostId":"local"}',
    '{"kind":"remote","hostId":"remote"}',
    '{"kind":"ssh","targetId":"remote"}',
    '{"kind":"wsl","hostId":"local","distro":"Ubuntu"}'
  ])('blocks residuals without proven local host scope: %s', (hostScope) => {
    const { resourceId } = releasedFailedStart()
    db.db
      .prepare('UPDATE worker_terminal_resources SET host_scope = ? WHERE id = ?')
      .run(hostScope, resourceId)
    expectResidualBlocked()
  })

  it.each(['owner_dispatch_id', 'origin_dispatch_id'])(
    'cannot use release associated with a different %s',
    (column) => {
      const { dispatchId, resourceId } = releasedFailedStart()
      const other = start(1)
      db.failWorkerStart(other.dispatch.id, 'worktree', 'No resources')
      db.db
        .prepare(`UPDATE worker_terminal_resources SET ${column} = ? WHERE id = ?`)
        .run(other.dispatch.id, resourceId)
      expect(kernelOccupiedSlots(db, runId)).toBe(1)
      expect(() => configure()).toThrow(/Stop or release existing Run resources/)
      expect(() => start(2)).toThrow(/concurrent Worker limit/)
      expect(db.getWorkerDispatch(dispatchId)?.residual_resources).not.toBe('[]')
    }
  )

  it('blocks residuals without a native resource mapping', () => {
    const { resourceId } = releasedFailedStart()
    db.db.prepare('DELETE FROM worker_terminal_resources WHERE id = ?').run(resourceId)
    expectResidualBlocked()
  })

  it.each(['starting', 'ready', 'stopping', 'start_unknown', 'stop_unknown'])(
    'released receipts cannot override Worker state %s',
    (state) => {
      const { dispatchId } = releasedFailedStart()
      db.db
        .prepare('UPDATE worker_dispatches SET state = ? WHERE dispatch_id = ?')
        .run(state, dispatchId)
      expectResidualBlocked()
    }
  )

  it.each(['pending', 'dispatched'])(
    'released receipts cannot override Dispatch status %s',
    (status) => {
      const { dispatchId } = releasedFailedStart()
      db.db.prepare('UPDATE dispatch_contexts SET status = ? WHERE id = ?').run(status, dispatchId)
      expectResidualBlocked()
    }
  )

  it.each(['folder:workspace', 'unproven-workspace'])(
    'does not discharge unsupported workspace residuals: %s',
    (worktreeId) => {
      const { dispatchId, resourceId, effects } = releasedFailedStart()
      db.db
        .prepare('UPDATE worker_terminal_resources SET worktree_id = ? WHERE id = ?')
        .run(worktreeId, resourceId)
      db.db
        .prepare(
          'UPDATE worker_dispatches SET worktree_id = ?, residual_resources = ? WHERE dispatch_id = ?'
        )
        .run(
          worktreeId,
          JSON.stringify([{ ...effects[0], id: worktreeId }, effects[1]]),
          dispatchId
        )
      expectResidualBlocked()
    }
  )

  it.each(['task', 'run'])('released failed starts still exhaust the %s attempt cap', (cap) => {
    const { dispatchId } = releasedFailedStart()
    configure(cap === 'task' ? { maxAttemptsPerTask: 1 } : { maxAttempts: 1 })
    expect(() => (cap === 'task' ? start(0, dispatchId) : start(1))).toThrow(
      cap === 'task'
        ? /Task has reached its attempt limit/
        : /Run has reached its cumulative attempt limit/
    )
    expect(db.db.prepare('SELECT COUNT(*) AS n FROM dispatch_contexts').get()).toEqual({ n: 1 })
  })

  it('defaults to two concurrent workers and rejects the third in the native transaction', () => {
    configure()
    start(0)
    start(1)
    expect(() => start(2)).toThrow(/concurrent/i)
    expect(db.getDispatchContext(plan.tasks[2].key)).toBeUndefined()
  })

  it('reads old configurations with finite defaults', () => {
    db.db
      .prepare('UPDATE runs SET kernel_config = ? WHERE id = ?')
      .run(JSON.stringify({ repoId: 'repo', plan }), runId)
    expect(readKernelRunConfig(db.getRun(runId)!)).toMatchObject({
      limits: { maxConcurrentWorkers: 2, maxAttemptsPerTask: 2, maxAttempts: 6 }
    })
  })

  for (const key of ['maxConcurrentWorkers', 'maxAttemptsPerTask', 'maxAttempts']) {
    it.each([0, -1, 1.5, Infinity, Number.NaN, Number.MAX_SAFE_INTEGER + 1, '2', null])(
      `rejects invalid ${key}: %s`,
      (value) => {
        expect(() => configure({ [key]: value })).toThrow(/finite positive integers/)
        expect(db.getRun(runId)?.kernel_config).toBeNull()
        expect(db.db.prepare('SELECT COUNT(*) AS n FROM dispatch_contexts').get()).toEqual({ n: 0 })
      }
    )
  }

  it.each([null, [], { unknown: 2 }])('rejects invalid limits objects: %j', (limits) => {
    expect(() => configure(limits)).toThrow()
  })

  it('counts failed starts against the per-Task limit after reconfiguration', () => {
    configure({ maxAttempts: 10 })
    const first = start(0)
    db.failWorkerStart(first.dispatch.id, 'worktree', 'First failure')
    const second = start(0, first.dispatch.id)
    db.failWorkerStart(second.dispatch.id, 'worktree', 'Second failure')
    configure({ maxAttempts: 20 })
    expect(() => start(0, second.dispatch.id)).toThrow(/Task has reached its attempt limit/)
    expect(db.db.prepare('SELECT COUNT(*) AS n FROM dispatch_contexts').get()).toEqual({ n: 2 })
  })

  it('keeps the original default and cumulative attempts across new keys, replacement plans and off/on', () => {
    plan.tasks = [plan.tasks[0]]
    configure()
    const first = start(0)
    db.failWorkerStart(first.dispatch.id, 'worktree', 'Failure')
    const second = start(0, first.dispatch.id)
    db.failWorkerStart(second.dispatch.id, 'worktree', 'Failure')
    plan.tasks = [0, 1].map((index) => ({
      ...plan.tasks[0],
      key: db.createTask({ spec: 'Replacement', runId }).id,
      writePaths: [`new/${index}.ts`]
    }))
    configure()
    expect(readKernelRunConfig(db.getRun(runId)!)?.limits.maxAttempts).toBe(2)
    expect(() => start(0)).toThrow(/Run has reached its cumulative attempt limit/)
    configureKernelRun(db, db.getRun(runId)!, null)
    configure()
    expect(readKernelRunConfig(db.getRun(runId)!)?.limits.maxAttempts).toBe(2)
    expect(() => start(1)).toThrow(/Run has reached its cumulative attempt limit/)
  })

  it('includes native low-level and Worker attempts predating management or the current plan', () => {
    const native = db.createDispatchContext(plan.tasks[0].key, 'term_native')
    db.settleWorkerReport({
      taskId: plan.tasks[0].key,
      dispatchId: native.id,
      outcome: 'failed',
      result: '{}'
    })
    const worker = start(1)
    db.failWorkerStart(worker.dispatch.id, 'setup', 'Native failure')
    plan.tasks = [plan.tasks[2]]
    configure()
    expect(() => start(0)).toThrow(/Run has reached its cumulative attempt limit/)
  })

  it.each([
    'starting',
    'ready',
    'stopping',
    'start_unknown',
    'stop_unknown',
    'pending-only',
    'succeeded-retained',
    'inconsistent-release',
    'failed-residual'
  ])('conservatively occupies a slot for %s', (state) => {
    configure({ maxConcurrentWorkers: 1 })
    const first = start(0)
    if (state === 'pending-only') {
      db.db.prepare('DELETE FROM worker_dispatches WHERE dispatch_id = ?').run(first.dispatch.id)
    } else {
      db.db
        .prepare("UPDATE dispatch_contexts SET status = 'completed' WHERE id = ?")
        .run(first.dispatch.id)
      const workerState =
        state === 'failed-residual'
          ? 'failed'
          : state.includes('release') || state === 'succeeded-retained'
            ? 'succeeded'
            : state
      db.db
        .prepare(
          'UPDATE worker_dispatches SET state = ?, residual_resources = ? WHERE dispatch_id = ?'
        )
        .run(
          workerState,
          state === 'failed-residual' ? '[{"kind":"worktree"}]' : '[]',
          first.dispatch.id
        )
      if (state === 'succeeded-retained' || state === 'inconsistent-release') {
        db.db
          .prepare(`INSERT INTO worker_terminal_resources (id, origin_dispatch_id, owner_dispatch_id, terminal_handle, ownership_state, release_state)
            VALUES ('resource', ?, ?, 'term_retained', ?, 'retained')`)
          .run(
            first.dispatch.id,
            first.dispatch.id,
            state === 'inconsistent-release' ? 'released' : 'owned'
          )
      }
    }
    expect(() => start(1)).toThrow(/concurrent Worker limit/)
    expect(db.getDispatchContext(plan.tasks[1].key)).toBeUndefined()
  })

  it('frees a completed slot only after native resource release, without resetting attempts', () => {
    configure({ maxConcurrentWorkers: 1 })
    const first = start(0)
    db.db
      .prepare("UPDATE dispatch_contexts SET status = 'completed' WHERE id = ?")
      .run(first.dispatch.id)
    db.db
      .prepare("UPDATE worker_dispatches SET state = 'succeeded' WHERE dispatch_id = ?")
      .run(first.dispatch.id)
    db.db
      .prepare(`INSERT INTO worker_terminal_resources (id, origin_dispatch_id, owner_dispatch_id, terminal_handle, ownership_state, release_state)
      VALUES ('resource', ?, ?, 'term_released', 'released', 'released')`)
      .run(first.dispatch.id, first.dispatch.id)
    expect(start(1).worker.state).toBe('starting')
    expect(db.db.prepare('SELECT COUNT(*) AS n FROM dispatch_contexts').get()).toEqual({ n: 2 })
  })

  it('counts pending Dispatch, Worker and resource records as one occupied slot', () => {
    configure()
    const first = start(0)
    db.db
      .prepare(`INSERT INTO worker_terminal_resources (id, origin_dispatch_id, owner_dispatch_id, terminal_handle)
      VALUES ('resource', ?, ?, 'term_retained')`)
      .run(first.dispatch.id, first.dispatch.id)
    expect(start(1).worker.state).toBe('starting')
    expect(() => start(2)).toThrow(/concurrent Worker limit/)
  })

  it('does not treat another Run as a shared billing or concurrency budget', () => {
    configure({ maxConcurrentWorkers: 1 })
    start(0)
    const other = db.createRun({
      objective: 'Other',
      coordinatorHandle: 'other',
      coordinatorPaneKey: 'other'
    })
    const task = db.createTask({ spec: 'Other task', runId: other.id })
    expect(
      db.createStartingWorkerDispatch({ taskId: task.id, startOptions: {} }).worker.state
    ).toBe('starting')
  })

  it.each(
    ['tasks', 'all'].flatMap((scope) =>
      ['managed', 'disabled', 'damaged'].map((mode) => ({ scope, mode }))
    )
  )(
    'preserves native attempt history against direct $scope reset for $mode policy',
    ({ scope, mode }) => {
      configure()
      const prior = start(0)
      db.failWorkerStart(prior.dispatch.id, 'setup', 'Prior failure')
      if (mode === 'disabled') {
        configureKernelRun(db, db.getRun(runId)!, null)
      }
      if (mode === 'damaged') {
        db.db
          .prepare(
            "UPDATE runs SET kernel_config = '{', kernel_default_max_attempts = NULL WHERE id = ?"
          )
          .run(runId)
      }
      expect(() => (scope === 'tasks' ? db.resetTasks() : db.resetAll())).toThrow(
        /Reset cannot erase/
      )
      expect(db.getDispatchContextById(prior.dispatch.id)).toBeDefined()
      expect(db.getTask(plan.tasks[0].key)).toBeDefined()
    }
  )

  it('allows message reset without losing managed Task or attempt state', () => {
    configure()
    const prior = start(0)
    db.insertMessage({ runId, from: 'worker', to: `run:${runId}`, subject: 'Progress' })
    db.resetMessages()
    expect(db.db.prepare('SELECT COUNT(*) AS n FROM messages').get()).toEqual({ n: 0 })
    expect(db.getDispatchContextById(prior.dispatch.id)).toBeDefined()
    expect(db.getRun(runId)?.kernel_config).not.toBeNull()
  })
})
