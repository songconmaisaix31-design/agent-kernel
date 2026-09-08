import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OrchestrationDb } from './db'

describe('failed startup stop database transitions', () => {
  let db: OrchestrationDb
  let taskId: string
  let dispatchId: string
  let capability: string
  const paneKey = 'tab:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const processIncarnation = 'runtime:pty:1'

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    taskId = db.createTask({ spec: 'stop state race' }).id
    dispatchId = db.createStartingWorkerDispatch({ taskId, startOptions: {} }).dispatch.id
    capability = db.prepareStartingWorkerAuthority({
      dispatchId,
      handle: 'term_worker',
      paneKey,
      processIncarnation,
      worktreeId: 'folder:fixture',
      effects: [],
      setupState: 'not_applicable',
      terminalOwnership: 'created',
      hostScope: JSON.stringify({ kind: 'local', hostId: 'local' })
    })
  })

  afterEach(() => db.close())

  it('changes the failed worker process state without reviving lifecycle authority or history', () => {
    db.failWorkerStart(dispatchId, 'dispatch_input', 'agent_prompt_stalled')
    const dispatchBefore = db.getDispatchContextById(dispatchId)
    const taskBefore = db.getTask(taskId)
    expect(db.beginWorkerStop(dispatchId, 'runtime').disposition).toBe('stopping')
    expect(
      db.verifyDispatchCapability({ dispatchId, capability, paneKey, processIncarnation })
    ).toMatchObject({ valid: false, reason: expect.stringContaining('revoked') })
    expect(() => db.mintDispatchCapability({ dispatchId, paneKey, processIncarnation })).toThrow(
      'not active'
    )
    expect(
      db.settleWorkerReport({ taskId, dispatchId, outcome: 'succeeded', result: 'late' }).action
    ).toBe('rejected')
    expect(db.settleWorkerStop(dispatchId)).toMatchObject({
      state: 'stopped',
      stage: 'dispatch_input',
      last_error: 'agent_prompt_stalled'
    })
    expect(db.getDispatchContextById(dispatchId)).toEqual(dispatchBefore)
    expect(db.getTask(taskId)).toEqual(taskBefore)
  })

  it('keeps unknown stops fenced without replacing startup failure evidence', () => {
    db.failWorkerStart(dispatchId, 'dispatch_input', 'agent_prompt_stalled')
    db.beginWorkerStop(dispatchId, 'runtime')
    expect(db.beginWorkerStop(dispatchId, 'runtime').disposition).toBe('in_progress')
    expect(db.markWorkerStopUnknown(dispatchId, 'host unreachable')).toMatchObject({
      state: 'stop_unknown',
      stage: 'dispatch_input',
      last_error: 'host unreachable'
    })
    expect(db.getDispatchContextById(dispatchId)?.last_failure).toBe('agent_prompt_stalled')
    expect(db.beginWorkerStop(dispatchId, 'runtime').disposition).toBe('in_progress')
    expect(db.getTask(taskId)?.status).toBe('failed')
  })

  it.each(['succeeded', 'failed'] as const)(
    'preserves %s completion when the report wins',
    (outcome) => {
      db.markWorkerDispatchReady(dispatchId)
      expect(
        db.settleWorkerReport({ taskId, dispatchId, outcome, result: 'original result' }).action
      ).toBe('settled')
      const dispatchBefore = db.getDispatchContextById(dispatchId)
      const taskBefore = db.getTask(taskId)
      expect(db.beginWorkerStop(dispatchId, 'runtime').disposition).toBe('already_settled')
      expect(db.getWorkerDispatch(dispatchId)?.state).toBe(outcome)
      expect(db.getDispatchContextById(dispatchId)).toEqual(dispatchBefore)
      expect(db.getTask(taskId)).toEqual(taskBefore)
    }
  )

  it.each(['succeeded', 'failed'] as const)(
    'rejects late %s completion when stop wins',
    (outcome) => {
      db.markWorkerDispatchReady(dispatchId)
      db.beginWorkerStop(dispatchId, 'runtime')
      expect(
        db.settleWorkerReport({ taskId, dispatchId, outcome, result: 'late result' }).action
      ).toBe('rejected')
      db.settleWorkerStop(dispatchId)
      expect(db.getWorkerDispatch(dispatchId)?.state).toBe('stopped')
      expect(db.getTask(taskId)?.status).toBe('blocked')
      expect(db.getDispatchContextById(dispatchId)?.last_failure).toBe('stopped')
    }
  )

  it('fences terminal transfer and user takeover after stop begins', () => {
    db.failWorkerStart(dispatchId, 'dispatch_input', 'agent_prompt_stalled')
    db.beginWorkerStop(dispatchId, 'runtime')
    expect(db.markWorkerTerminalUserOwned(paneKey)).toBe(0)
    expect(
      db.findTransferableWorkerTerminalResource({
        terminalHandle: 'term_worker',
        paneKey,
        processIncarnation,
        hostScope: JSON.stringify({ kind: 'local', hostId: 'local' })
      })
    ).toBeUndefined()
    expect(() =>
      db.createStartingWorkerDispatch({ taskId, retryOf: dispatchId, startOptions: {} })
    ).toThrow('cannot retry')
  })
})
