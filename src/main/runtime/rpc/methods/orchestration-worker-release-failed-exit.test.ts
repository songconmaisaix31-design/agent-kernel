import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'
import { OrchestrationDb } from '../../orchestration/db'
import { ORCHESTRATION_WORKER_RELEASE_METHODS } from './orchestration-worker-release'

describe('failed worker exact-incarnation release', () => {
  let db: OrchestrationDb
  let runtime: OrcaRuntimeService
  let dispatchId: string
  let taskId: string
  let resourceId: string
  const processIncarnation = 'local-pty:inc-1'
  const hostScope = JSON.stringify({ kind: 'local', hostId: 'local' })
  const listProcesses = vi.fn()

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    runtime = new OrcaRuntimeService()
    runtime.setOrchestrationDb(db)
    listProcesses.mockReset().mockResolvedValue([])
    runtime.setPtyController({
      write: () => true,
      kill: () => true,
      getForegroundProcess: async () => null,
      listProcesses
    })
    vi.spyOn(runtime, 'showTerminal').mockRejectedValue(new Error('terminal_handle_stale'))
    vi.spyOn(runtime, 'getOrchestrationDispatchAuthority').mockReturnValue(null)
    vi.spyOn(runtime, 'inspectTerminalProcessIncarnationLiveness')
    vi.spyOn(runtime, 'notifyMessageArrived').mockImplementation(() => {})
    vi.spyOn(runtime, 'closeTerminal').mockRejectedValue(new Error('must not close a process'))
    taskId = db.createTask({ spec: 'failed exited worker release' }).id
    dispatchId = db.createStartingWorkerDispatch({ taskId, startOptions: {} }).dispatch.id
    db.prepareStartingWorkerAuthority({
      dispatchId,
      handle: 'term_worker',
      paneKey: 'tab_worker:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      processIncarnation,
      hostScope,
      worktreeId: 'folder:fixture',
      setupState: 'not_applicable',
      effects: [],
      terminalOwnership: 'created'
    })
    db.markWorkerDispatchReady(dispatchId)
    db.failDispatch(dispatchId, 'Worker process exited during operator close', {
      workerProcessExited: true,
      terminationReason: 'operator_close'
    })
    resourceId = db.getWorkerTerminalResourceByOwner(dispatchId)!.id
    db.requestWorkerTerminalRelease(dispatchId)
    db.revertWorkerTerminalReleaseToRetained(resourceId, 'identity_unproven')
  })

  afterEach(() => {
    db.close()
    vi.restoreAllMocks()
  })

  function release() {
    const method = ORCHESTRATION_WORKER_RELEASE_METHODS[0]!
    return method.handler(method.params!.parse({ dispatch: dispatchId }), { runtime })
  }

  it('releases a failed exited incarnation after completion returns retained', async () => {
    const dispatchBefore = db.getDispatchContextById(dispatchId)
    const workerBefore = db.getWorkerDispatch(dispatchId)
    const taskBefore = db.getTask(taskId)
    expect(workerBefore).toMatchObject({ state: 'failed', stage: 'process_exited' })
    expect(dispatchBefore?.capability_revoked_at).toBeTruthy()
    await expect(release()).resolves.toMatchObject({ state: 'released', processAction: 'none' })
    expect(runtime.inspectTerminalProcessIncarnationLiveness).toHaveBeenCalledWith(
      processIncarnation,
      hostScope
    )
    expect(listProcesses).toHaveBeenCalledExactlyOnceWith(null)
    expect(db.getWorkerTerminalResource(resourceId)).toMatchObject({
      ownership_state: 'released',
      release_state: 'released'
    })
    expect(db.getDispatchContextById(dispatchId)).toEqual(dispatchBefore)
    expect(db.getWorkerDispatch(dispatchId)).toEqual(workerBefore)
    expect(db.getTask(taskId)).toEqual(taskBefore)
    await expect(release()).resolves.toMatchObject({ state: 'already_released' })
    expect(runtime.closeTerminal).not.toHaveBeenCalled()
    expect(listProcesses).toHaveBeenCalledTimes(1)
  })

  it.each(['live', 'unavailable', 'missing incarnation', 'missing host'])(
    'retains missing-terminal metadata when inventory is %s',
    async (condition) => {
      if (condition === 'live') {
        listProcesses.mockResolvedValue([{ id: 'local-pty', incarnationId: 'inc-1' }])
      } else if (condition === 'unavailable') {
        listProcesses.mockRejectedValue(new Error('provider unavailable'))
      } else if (condition === 'missing incarnation') {
        listProcesses.mockResolvedValue([{ id: 'local-pty' }])
      } else {
        db.db
          .prepare('UPDATE worker_terminal_resources SET host_scope = NULL WHERE id = ?')
          .run(resourceId)
      }
      await expect(release()).resolves.toMatchObject({ state: 'retained', processAction: 'none' })
      expect(db.getWorkerTerminalResource(resourceId)?.release_state).toBe('retained')
      expect(runtime.closeTerminal).not.toHaveBeenCalled()
      expect(runtime.notifyMessageArrived).not.toHaveBeenCalled()
    }
  )

  it.each(['incarnation', 'host', 'history', 'active owner', 'release intent'])(
    'retains when %s changes while exact-exit observation is pending',
    async (changed) => {
      listProcesses.mockImplementationOnce(async () => {
        if (changed === 'incarnation') {
          db.db
            .prepare('UPDATE worker_terminal_resources SET process_incarnation = ? WHERE id = ?')
            .run('local-pty:inc-2', resourceId)
        } else if (changed === 'host') {
          db.db
            .prepare('UPDATE worker_terminal_resources SET host_scope = ? WHERE id = ?')
            .run(JSON.stringify({ kind: 'ssh', targetId: 'other-host' }), resourceId)
        } else if (changed === 'history') {
          db.db
            .prepare(
              'UPDATE worker_terminal_resources SET prior_owner_dispatch_ids = ? WHERE id = ?'
            )
            .run('malformed', resourceId)
        } else if (changed === 'active owner') {
          db.db
            .prepare("UPDATE worker_dispatches SET state = 'ready' WHERE dispatch_id = ?")
            .run(dispatchId)
        } else {
          db.requestWorkerTerminalRelease(dispatchId)
        }
        return []
      })
      await expect(release()).resolves.toMatchObject({ state: 'retained', processAction: 'none' })
      expect(db.getWorkerTerminalResource(resourceId)?.release_state).not.toBe('released')
      expect(listProcesses).toHaveBeenCalledTimes(1)
      expect(runtime.closeTerminal).not.toHaveBeenCalled()
    }
  )

  it.each([false, true])('protects a new owner during observation, settled=%s', async (settled) => {
    let successorId!: string
    listProcesses.mockImplementationOnce(async () => {
      const task = db.createTask({ spec: 'new resource owner' })
      successorId = db.createStartingWorkerDispatch({ taskId: task.id, startOptions: {} }).dispatch
        .id
      db.prepareStartingWorkerAuthority({
        dispatchId: successorId,
        handle: 'term_worker',
        paneKey: 'tab_worker:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        processIncarnation,
        hostScope,
        worktreeId: 'folder:fixture',
        setupState: 'not_applicable',
        effects: [],
        terminalOwnership: 'external'
      })
      expect(db.getWorkerTerminalResourceByOwner(successorId)?.id).toBe(resourceId)
      if (settled) {
        db.markWorkerDispatchReady(successorId)
        db.failDispatch(successorId, 'new owner exited', { workerProcessExited: true })
      }
      return []
    })
    await expect(release()).resolves.toMatchObject({ state: 'retained', processAction: 'none' })
    expect(db.getWorkerTerminalResource(resourceId)?.owner_dispatch_id).toBe(successorId)
    expect(db.getWorkerTerminalResource(resourceId)?.release_state).not.toBe('released')
    expect(runtime.closeTerminal).not.toHaveBeenCalled()
  })
})
