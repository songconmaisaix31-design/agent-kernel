import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { OrchestrationDb } from '../../orchestration/db'
import { ORCHESTRATION_WORKER_STOP_METHODS } from './orchestration-worker-stop'
import { OrchestrationMutationExecutor } from '../orchestration-mutation-executor'

describe('failed startup worker stop', () => {
  let db: OrchestrationDb
  let runtime: OrcaRuntimeService
  let dispatchId: string
  let taskId: string
  const paneKey = 'tab_worker:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const processIncarnation = 'runtime:pty:1'
  const hostScope = { kind: 'local', hostId: 'local' }
  const closeTerminal = vi.fn()

  function createWorker(failedStart: boolean) {
    taskId = db.createTask({ spec: 'failed startup timer' }).id
    dispatchId = db.createStartingWorkerDispatch({ taskId, startOptions: {} }).dispatch.id
    db.prepareStartingWorkerAuthority({
      dispatchId,
      handle: 'term_worker',
      paneKey,
      processIncarnation,
      worktreeId: 'folder:fixture',
      setupState: 'not_applicable',
      effects: [],
      terminalOwnership: 'created',
      hostScope: JSON.stringify(hostScope)
    })
    if (failedStart) {
      db.failWorkerStart(dispatchId, 'dispatch_input', 'agent_prompt_stalled')
    } else {
      db.markWorkerDispatchReady(dispatchId)
    }
  }

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    createWorker(true)
    closeTerminal.mockReset().mockResolvedValue({ handle: 'term_worker', ptyKilled: true })
    runtime = {
      getOrchestrationDb: () => db,
      getRuntimeId: () => 'runtime',
      captureSupervisedTerminalCloseGuard: (_handle: string, isCurrent: () => boolean) => isCurrent,
      showTerminal: vi.fn(async () => ({ handle: 'term_worker', connected: true })),
      getTerminalPaneKey: vi.fn(() => paneKey),
      getTerminalProcessIncarnation: vi.fn(() => processIncarnation),
      getOrchestrationDispatchAuthority: vi.fn(() => ({
        terminalHandle: 'term_worker',
        paneKey,
        processIncarnation,
        hostScope
      })),
      getTerminalLivenessVerdict: vi.fn(() => ({ status: 'live' })),
      closeTerminal,
      notifyMessageArrived: vi.fn()
    } as unknown as OrcaRuntimeService
  })

  afterEach(() => db.close())

  function stop() {
    const method = ORCHESTRATION_WORKER_STOP_METHODS[0]!
    return method.handler(method.params!.parse({ dispatch: dispatchId }), { runtime })
  }

  it.each([
    { failedStart: false, confirmed: true },
    { failedStart: false, confirmed: false },
    { failedStart: true, confirmed: true },
    { failedStart: true, confirmed: false }
  ])(
    'settles an in-flight close after process exit: failedStart=$failedStart confirmed=$confirmed',
    async ({ failedStart, confirmed }) => {
      if (!failedStart) {
        db.close()
        db = new OrchestrationDb(':memory:')
        createWorker(false)
      }
      const dispatchBefore = db.getDispatchContextById(dispatchId)!
      let finish!: (value: unknown) => void
      closeTerminal.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
      const pending = stop()
      await vi.waitFor(() => expect(closeTerminal).toHaveBeenCalledTimes(1))
      const revokedAt = db.getDispatchContextById(dispatchId)?.capability_revoked_at
      expect(revokedAt).toBeTruthy()
      await expect(stop()).resolves.toMatchObject({ state: 'stopping', processAction: 'none' })
      const exitCallback = () =>
        db.failDispatch(dispatchId, 'Worker process exited', {
          workerProcessExited: true,
          terminationReason: 'operator_close'
        })
      exitCallback()
      exitCallback()
      finish({
        handle: 'term_worker',
        ptyKilled: confirmed,
        ptyStopVerdict: confirmed ? 'exited' : 'unverifiable'
      })
      const state = confirmed ? 'stopped' : 'stop_unknown'
      await expect(pending).resolves.toMatchObject({
        state,
        processAction: 'closed_agent_terminal'
      })
      expect(db.getDispatchContextById(dispatchId)).toMatchObject({
        status: failedStart || confirmed ? 'failed' : 'dispatched',
        last_failure: failedStart || !confirmed ? dispatchBefore.last_failure : 'stopped',
        failure_count: dispatchBefore.failure_count,
        capability_revoked_at: revokedAt
      })
      if (failedStart) {
        expect(db.getDispatchContextById(dispatchId)).toEqual(dispatchBefore)
        expect(db.getWorkerDispatch(dispatchId)?.stage).toBe('dispatch_input')
      }
      const settledWorker = db.getWorkerDispatch(dispatchId)
      const settledDispatch = db.getDispatchContextById(dispatchId)
      const settledTask = db.getTask(taskId)
      exitCallback()
      await expect(stop()).resolves.toMatchObject({
        state,
        alreadySettled: confirmed,
        processAction: 'none'
      })
      expect(db.getWorkerDispatch(dispatchId)).toEqual(settledWorker)
      expect(db.getDispatchContextById(dispatchId)).toEqual(settledDispatch)
      expect(db.getTask(taskId)).toEqual(settledTask)
      expect(closeTerminal).toHaveBeenCalledTimes(1)
    }
  )

  it('actively stops an exact owned live failed-start resource and preserves failure history', async () => {
    const dispatchBefore = db.getDispatchContextById(dispatchId)
    const taskBefore = db.getTask(taskId)
    await expect(stop()).resolves.toMatchObject({
      state: 'stopped',
      alreadySettled: false,
      processAction: 'closed_agent_terminal'
    })
    expect(closeTerminal).toHaveBeenCalledExactlyOnceWith('term_worker', {
      isCurrent: expect.any(Function)
    })
    expect(db.getDispatchContextById(dispatchId)).toEqual(dispatchBefore)
    expect(db.getTask(taskId)).toEqual(taskBefore)
    expect(db.getWorkerDispatch(dispatchId)?.last_error).toBe('agent_prompt_stalled')
    expect(dispatchBefore?.capability_revoked_at).toBeTruthy()
  })

  it.each(['external', 'user_owned', 'transferred', 'released'] as const)(
    'does not close a %s resource',
    async (ownership) => {
      db.db.prepare('UPDATE worker_terminal_resources SET ownership_state = ?').run(ownership)
      await expect(stop()).resolves.toMatchObject({ state: 'stop_unknown', processAction: 'none' })
      expect(closeTerminal).not.toHaveBeenCalled()
      expect(db.getDispatchContextById(dispatchId)?.last_failure).toBe('agent_prompt_stalled')
    }
  )

  it.each(['resource', 'terminal', 'pane', 'incarnation', 'host'])(
    'does not close when %s identity is missing',
    async (missing) => {
      if (missing === 'resource') {
        db.db.prepare('DELETE FROM worker_terminal_resources').run()
      }
      if (missing === 'terminal') {
        vi.mocked(runtime.showTerminal).mockRejectedValue(new Error('missing'))
      }
      if (missing === 'pane') {
        vi.mocked(runtime.getTerminalPaneKey).mockReturnValue(null)
      }
      if (missing === 'incarnation') {
        vi.mocked(runtime.getTerminalProcessIncarnation).mockReturnValue(null)
      }
      if (missing === 'host') {
        vi.mocked(runtime.getOrchestrationDispatchAuthority).mockReturnValue(null)
      }
      await expect(stop()).resolves.toMatchObject({ state: 'stop_unknown', processAction: 'none' })
      expect(closeTerminal).not.toHaveBeenCalled()
    }
  )

  it.each(['pane', 'incarnation', 'host', 'resource', 'handle'])(
    'revalidates %s after asynchronous observation',
    async (changed) => {
      vi.mocked(runtime.showTerminal).mockImplementationOnce(async () => {
        await Promise.resolve()
        if (changed === 'pane') {
          vi.mocked(runtime.getTerminalPaneKey).mockReturnValue('tab:other')
        }
        if (changed === 'incarnation') {
          vi.mocked(runtime.getTerminalProcessIncarnation).mockReturnValue('pty:2')
        }
        if (changed === 'host') {
          vi.mocked(runtime.getOrchestrationDispatchAuthority).mockReturnValue({
            terminalHandle: 'term_worker',
            paneKey,
            processIncarnation,
            hostScope: { kind: 'ssh', targetId: 'replacement-host' }
          } as never)
        }
        if (changed === 'resource') {
          db.db
            .prepare("UPDATE worker_terminal_resources SET process_incarnation = 'pty:replacement'")
            .run()
        }
        if (changed === 'handle') {
          db.db
            .prepare("UPDATE worker_dispatches SET agent_terminal_handle = 'term_replacement'")
            .run()
        }
        return { handle: 'term_worker', connected: true } as never
      })
      await expect(stop()).resolves.toMatchObject({ state: 'stop_unknown', processAction: 'none' })
      expect(closeTerminal).not.toHaveBeenCalled()
    }
  )

  it('rechecks incarnation after the observer computed exactness', async () => {
    vi.mocked(runtime.getTerminalProcessIncarnation)
      .mockReturnValueOnce(processIncarnation)
      .mockReturnValue('runtime:pty:replacement')
    await expect(stop()).resolves.toMatchObject({ state: 'stop_unknown', processAction: 'none' })
    expect(closeTerminal).not.toHaveBeenCalled()
  })

  it('does not stop a resource transferred to another Task', async () => {
    const otherTask = db.createTask({ spec: 'new owner' })
    const other = db.createStartingWorkerDispatch({ taskId: otherTask.id, startOptions: {} })
    db.prepareStartingWorkerAuthority({
      dispatchId: other.dispatch.id,
      handle: 'term_worker',
      paneKey,
      processIncarnation,
      worktreeId: 'folder:fixture',
      setupState: 'not_applicable',
      effects: [],
      terminalOwnership: 'external',
      hostScope: JSON.stringify(hostScope)
    })
    expect(db.getWorkerTerminalResourceByOwner(dispatchId)).toBeUndefined()
    await expect(stop()).resolves.toMatchObject({ state: 'stop_unknown', processAction: 'none' })
    expect(closeTerminal).not.toHaveBeenCalled()
  })

  it('does not stop the old Dispatch after a newer Task attempt starts', async () => {
    const replacement = db.createStartingWorkerDispatch({
      taskId,
      retryOf: dispatchId,
      startOptions: {}
    })
    const before = db.getTask(taskId)
    await expect(stop()).resolves.toMatchObject({
      state: 'failed',
      alreadySettled: true,
      processAction: 'none'
    })
    expect(closeTerminal).not.toHaveBeenCalled()
    expect(db.getTask(taskId)).toEqual(before)
    expect(db.getWorkerDispatch(replacement.dispatch.id)?.state).toBe('starting')
  })

  it.each([false, 'unverifiable', 'exited'] as const)(
    'keeps an unconfirmed close %s unknown',
    async (verdict) => {
      closeTerminal.mockResolvedValue({
        handle: 'term_worker',
        ptyKilled: false,
        ...(verdict ? { ptyStopVerdict: verdict } : {})
      })
      await expect(stop()).resolves.toMatchObject({
        state: 'stop_unknown',
        processAction: 'closed_agent_terminal'
      })
      expect(db.getWorkerDispatch(dispatchId)).toMatchObject({
        stage: 'dispatch_input',
        last_error: expect.stringContaining('could not be confirmed stopped')
      })
      expect(db.getDispatchContextById(dispatchId)?.last_failure).toBe('agent_prompt_stalled')
      await expect(stop()).resolves.toMatchObject({
        state: 'stop_unknown',
        processAction: 'none',
        lastError: expect.stringContaining('could not be confirmed stopped')
      })
      expect(closeTerminal).toHaveBeenCalledTimes(1)
    }
  )

  it('does not treat a naturally exited process as an active stop', async () => {
    vi.mocked(runtime.showTerminal).mockResolvedValue({
      handle: 'term_worker',
      connected: false
    } as never)
    vi.mocked(runtime.getTerminalLivenessVerdict).mockReturnValue({ status: 'exited' } as never)
    await expect(stop()).resolves.toMatchObject({ state: 'stop_unknown', processAction: 'none' })
    expect(closeTerminal).not.toHaveBeenCalled()
  })

  it('does not close twice for overlapping or repeated stops', async () => {
    let finish!: (value: unknown) => void
    closeTerminal.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const first = stop()
    await vi.waitFor(() => expect(closeTerminal).toHaveBeenCalledTimes(1))
    await expect(stop()).resolves.toMatchObject({
      state: 'stopping',
      alreadySettled: false,
      processAction: 'none'
    })
    finish({ handle: 'term_worker', ptyKilled: true })
    await expect(first).resolves.toMatchObject({ state: 'stopped', alreadySettled: false })
    await expect(stop()).resolves.toMatchObject({
      state: 'stopped',
      alreadySettled: true,
      processAction: 'none'
    })
    expect(closeTerminal).toHaveBeenCalledTimes(1)
  })

  it('retains the stop failure reason on a repeated missing-terminal stop', async () => {
    db.db.prepare('UPDATE worker_dispatches SET agent_terminal_handle = NULL').run()
    const expected = {
      state: 'stop_unknown',
      processAction: 'none',
      lastError: 'The Dispatch has no recorded agent terminal.'
    }
    await expect(stop()).resolves.toMatchObject(expected)
    await expect(stop()).resolves.toMatchObject(expected)
    expect(db.getDispatchContextById(dispatchId)?.last_failure).toBe('agent_prompt_stalled')
    expect(closeTerminal).not.toHaveBeenCalled()
  })

  it('allows archive metadata changes without treating them as identity changes', async () => {
    vi.mocked(runtime.showTerminal).mockImplementationOnce(async () => {
      await Promise.resolve()
      db.db
        .prepare(
          "UPDATE worker_terminal_resources SET archive_status = 'captured', updated_at = 'later'"
        )
        .run()
      return { handle: 'term_worker', connected: true } as never
    })
    await expect(stop()).resolves.toMatchObject({ state: 'stopped' })
    expect(closeTerminal).toHaveBeenCalledTimes(1)
  })

  it('refuses a new conflicting Task resource created during observation', async () => {
    vi.mocked(runtime.showTerminal).mockImplementationOnce(async () => {
      await Promise.resolve()
      const task = db.createTask({ spec: 'new conflicting Task' })
      const next = db.createStartingWorkerDispatch({ taskId: task.id, startOptions: {} })
      db.prepareStartingWorkerAuthority({
        dispatchId: next.dispatch.id,
        handle: 'term_worker',
        paneKey,
        processIncarnation,
        worktreeId: 'folder:fixture',
        setupState: 'not_applicable',
        effects: [],
        terminalOwnership: 'external',
        hostScope: JSON.stringify(hostScope)
      })
      return { handle: 'term_worker', connected: true } as never
    })
    await expect(stop()).resolves.toMatchObject({ state: 'stop_unknown', processAction: 'none' })
    expect(closeTerminal).not.toHaveBeenCalled()
  })

  it('coalesces the same durable request and replays it without another close', async () => {
    const ledger = new OrchestrationMutationExecutor(runtime)
    const request = {
      id: 'rpc1',
      authToken: 'fixture-token',
      method: 'orchestration.workerStop',
      orchestrationRequestId: 'stop-once',
      params: { dispatch: dispatchId }
    }
    let finish!: (value: unknown) => void
    closeTerminal.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const first = ledger.run(request, request.params, stop)
    await vi.waitFor(() => expect(closeTerminal).toHaveBeenCalledTimes(1))
    const concurrent = ledger.run({ ...request, id: 'rpc2' }, request.params, stop)
    finish({ handle: 'term_worker', ptyKilled: true })
    await expect(first).resolves.toMatchObject({ state: 'stopped', mutation: { replayed: false } })
    await expect(concurrent).resolves.toMatchObject({
      state: 'stopped',
      mutation: { replayed: true }
    })
    const restartedLedger = new OrchestrationMutationExecutor(runtime)
    await expect(
      restartedLedger.run({ ...request, id: 'rpc3' }, request.params, stop)
    ).resolves.toMatchObject({ state: 'stopped', mutation: { replayed: true } })
    expect(closeTerminal).toHaveBeenCalledTimes(1)
  })
})
