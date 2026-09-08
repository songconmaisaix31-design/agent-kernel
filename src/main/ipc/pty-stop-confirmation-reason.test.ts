import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupPtyIpcSuite } from './pty-ipc-test-harness'
import { registerPtyHandlers, getLocalPtyProvider } from './pty'
import { OrcaRuntimeService } from '../runtime/orca-runtime'
import { OrchestrationDb } from '../runtime/orchestration/db'
import { ORCHESTRATION_WORKER_STOP_METHODS } from '../runtime/rpc/methods/orchestration-worker-stop'
import {
  SessionTerminationController,
  IMMEDIATE_KILL_PHYSICAL_EXIT_TIMEOUT_MS
} from '../daemon/session-termination-controller'
import type { SubprocessHandle } from '../daemon/session-subprocess-handle'

vi.mock('electron', () => import('./pty-ipc-mock-registry').then((m) => m.electronModuleMock()))
vi.mock('fs', () => import('./pty-ipc-mock-registry').then((m) => m.fsModuleMock()))
vi.mock('node-pty', () => import('./pty-ipc-mock-registry').then((m) => m.nodePtyModuleMock()))
vi.mock('node:child_process', async (importOriginal) =>
  (await import('./pty-ipc-mock-registry')).childProcessModuleMock(await importOriginal())
)
vi.mock('../opencode/hook-service', () =>
  import('./pty-ipc-mock-registry').then((m) => m.openCodeHookServiceModuleMock())
)
vi.mock('../mimo/hook-service', () =>
  import('./pty-ipc-mock-registry').then((m) => m.mimoHookServiceModuleMock())
)
vi.mock('../agent-hooks/server', () =>
  import('./pty-ipc-mock-registry').then((m) => m.agentHookServerModuleMock())
)
vi.mock('../pi/titlebar-extension-service', () =>
  import('./pty-ipc-mock-registry').then((m) => m.piTitlebarExtensionModuleMock())
)
vi.mock('../pwsh', () => import('./pty-ipc-mock-registry').then((m) => m.pwshModuleMock()))
vi.mock('../wsl', async (importOriginal) =>
  (await import('./pty-ipc-mock-registry')).wslModuleMock(await importOriginal())
)
vi.mock('../telemetry/client', () =>
  import('./pty-ipc-mock-registry').then((m) => m.telemetryClientModuleMock())
)
vi.mock('../telemetry/classify-error', () =>
  import('./pty-ipc-mock-registry').then((m) => m.classifyErrorModuleMock())
)
vi.mock('../cli/linux-terminal-orca-cli-shim', () =>
  import('./pty-ipc-mock-registry').then((m) => m.linuxCliShimModuleMock())
)
vi.mock('../memory/pty-registry', () =>
  import('./pty-ipc-mock-registry').then((m) => m.ptyRegistryModuleMock())
)
vi.mock('../agent-hooks/migration-unsupported-pty-state', () =>
  import('./pty-ipc-mock-registry').then((m) => m.migrationUnsupportedPtyModuleMock())
)
vi.mock('../codex/codex-pane-account-registry', () =>
  import('./pty-ipc-mock-registry').then((m) => m.codexPaneAccountRegistryModuleMock())
)
vi.mock('../codex/codex-state-db-backfill-recovery', () =>
  import('./pty-ipc-mock-registry').then((m) => m.codexBackfillRecoveryModuleMock())
)

describe('local stop confirmation failure reason', () => {
  const { handlers, mainWindow, installDaemonTestProvider } = setupPtyIpcSuite()
  afterEach(() => vi.useRealTimers())

  function closeAfterNativeExit(supervised: boolean, exitDelay: number | null) {
    vi.useFakeTimers()
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    let exited = false
    const forceKill = vi.fn(() => {
      if (exitDelay !== null) {
        setTimeout(() => {
          exited = true
          termination.markPhysicalExit()
        }, exitDelay)
      }
    })
    const termination = new SessionTerminationController({
      sessionId: 'deadline-pty',
      subprocess: { forceKill } as unknown as SubprocessHandle,
      launchAgent: null,
      isExited: () => exited,
      releaseProducerPause: () => {}
    })
    const shutdown = vi.fn(async (_id: string, opts: { deadlineMs?: number }) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          termination.forceKillAndWaitForExit(),
          new Promise<never>((_resolve, reject) => {
            const remaining = Math.max(1, (opts.deadlineMs ?? Date.now() + 30_000) - Date.now())
            timer = setTimeout(
              () => reject(new Error(`Request kill timed out after ${remaining}ms`)),
              remaining
            )
          })
        ])
      } finally {
        clearTimeout(timer)
      }
    })
    const listProcesses = vi.fn(async () => (exited ? [] : [{ id: 'deadline-pty' }]))
    installDaemonTestProvider({ shutdown, listProcesses, hasPty: () => !exited })
    const runtime = new OrcaRuntimeService(null, undefined, {
      getLocalProvider: () => getLocalPtyProvider()
    })
    handlers.clear()
    registerPtyHandlers(mainWindow as never, runtime)
    runtime.registerPreAllocatedHandleForPty('deadline-pty', 'term_deadline')
    runtime.registerPty('deadline-pty', 'folder:fixture', null, {
      tabId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      leafId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      incarnationId: 'incarnation-deadline' as never
    })
    const closing = runtime.closeTerminal(
      'term_deadline',
      supervised ? { isCurrent: () => true } : undefined
    )
    return { closing, shutdown, forceKill, listProcesses }
  }

  it.each([false, true])(
    'allows native physical exit past two seconds for supervised=%s',
    async (supervised) => {
      const { closing, shutdown, forceKill, listProcesses } = closeAfterNativeExit(
        supervised,
        3_000
      )
      await vi.advanceTimersByTimeAsync(3_001)
      await expect(closing).resolves.toMatchObject({ ptyKilled: true })
      expect(shutdown).toHaveBeenCalledTimes(1)
      expect(forceKill).toHaveBeenCalledTimes(1)
      expect(listProcesses).toHaveBeenCalledTimes(1)
    }
  )

  it.each([false, true])(
    'preserves native physical-exit timeout for supervised=%s',
    async (supervised) => {
      const { closing, forceKill, listProcesses } = closeAfterNativeExit(supervised, null)
      let settled = false
      void closing.then(() => {
        settled = true
      })
      await vi.advanceTimersByTimeAsync(IMMEDIATE_KILL_PHYSICAL_EXIT_TIMEOUT_MS - 1)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(2)
      await expect(closing).resolves.toMatchObject({
        ptyKilled: false,
        ptyStopVerdict: 'unverifiable',
        ptyStopReason: 'Timed out waiting for PTY process exit: deadline-pty'
      })
      expect(forceKill).toHaveBeenCalledTimes(1)
      expect(listProcesses).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(IMMEDIATE_KILL_PHYSICAL_EXIT_TIMEOUT_MS)
    }
  )

  it.each(['shutdown', 'inventory'])(
    'preserves the local %s exception while returning false',
    async (stage) => {
      const reason = `${stage} acknowledgement unavailable`
      const shutdown = vi.fn(async () => {})
      const listProcesses = vi.fn(async () => [])
      if (stage === 'shutdown') {
        shutdown.mockRejectedValue(new Error(reason))
      } else {
        listProcesses.mockRejectedValue(new Error(reason))
      }
      installDaemonTestProvider({ shutdown, listProcesses })
      const runtime = {
        setPtyController: vi.fn(),
        onPtyExit: vi.fn(),
        markPtyLivenessUnverifiable: vi.fn(),
        markPtyLivenessLive: vi.fn()
      }
      handlers.clear()
      registerPtyHandlers(mainWindow as never, runtime as never)
      const controller = runtime.setPtyController.mock.calls[0][0] as {
        stopAndWait(id: string, opts: { deadlineMs: number }): Promise<boolean>
      }
      const deadlineMs = Date.now() + 2_000
      await expect(controller.stopAndWait('local-pty', { deadlineMs })).resolves.toBe(false)
      expect(runtime.markPtyLivenessUnverifiable).toHaveBeenCalledExactlyOnceWith(
        'local-pty',
        reason
      )
      expect(runtime.onPtyExit).not.toHaveBeenCalled()
      expect(runtime.markPtyLivenessLive).not.toHaveBeenCalled()
      expect(shutdown).toHaveBeenCalledExactlyOnceWith('local-pty', {
        immediate: true,
        keepHistory: false,
        deadlineMs
      })
      if (stage === 'shutdown') {
        expect(listProcesses).not.toHaveBeenCalled()
      } else {
        expect(listProcesses).toHaveBeenCalledExactlyOnceWith({ deadlineMs })
      }
    }
  )

  it.each(['shutdown', 'inventory'])(
    'carries the %s reason through the real worker-stop receipt and preserves failure history',
    async (stage) => {
      const reason = `${stage} acknowledgement unavailable`
      const shutdown = vi.fn(async () => {})
      const listProcesses = vi.fn(async () => [])
      if (stage === 'shutdown') {
        shutdown.mockRejectedValueOnce(new Error(reason))
      } else {
        listProcesses.mockRejectedValue(new Error(reason))
      }
      installDaemonTestProvider({ shutdown, listProcesses, hasPty: () => true })
      const runtime = new OrcaRuntimeService(null, undefined, {
        getLocalProvider: () => getLocalPtyProvider()
      })
      handlers.clear()
      registerPtyHandlers(mainWindow as never, runtime)
      runtime.registerPreAllocatedHandleForPty('local-pty', 'term_worker')
      runtime.registerPty('local-pty', 'folder:fixture', null, {
        tabId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        leafId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        incarnationId: 'incarnation-first' as never
      })
      const db = new OrchestrationDb(':memory:')
      runtime.setOrchestrationDb(db)
      try {
        const task = db.createTask({ spec: 'preserve stop confirmation reason' })
        const { dispatch } = db.createStartingWorkerDispatch({ taskId: task.id, startOptions: {} })
        const authority = runtime.getOrchestrationDispatchAuthority('term_worker')!
        db.prepareStartingWorkerAuthority({
          dispatchId: dispatch.id,
          handle: 'term_worker',
          paneKey: authority.paneKey!,
          processIncarnation: authority.processIncarnation!,
          worktreeId: 'folder:fixture',
          setupState: 'not_applicable',
          effects: [],
          terminalOwnership: 'created',
          hostScope: JSON.stringify(authority.hostScope)
        })
        db.failWorkerStart(dispatch.id, 'dispatch_input', 'agent_prompt_stalled')
        const dispatchBefore = db.getDispatchContextById(dispatch.id)
        const taskBefore = db.getTask(task.id)
        const resourceBefore = db.getWorkerTerminalResourceByOwner(dispatch.id)
        vi.spyOn(runtime, 'showTerminal').mockResolvedValue({
          handle: 'term_worker',
          connected: true
        } as never)
        const method = ORCHESTRATION_WORKER_STOP_METHODS[0]!
        await expect(
          method.handler(method.params!.parse({ dispatch: dispatch.id }), { runtime })
        ).resolves.toMatchObject({
          state: 'stop_unknown',
          processAction: 'closed_agent_terminal',
          lastError: expect.stringContaining(reason)
        })
        expect(db.getWorkerDispatch(dispatch.id)).toMatchObject({
          state: 'stop_unknown',
          last_error: expect.stringContaining(reason)
        })
        expect(db.getDispatchContextById(dispatch.id)).toEqual(dispatchBefore)
        expect(dispatchBefore?.last_failure).toBe('agent_prompt_stalled')
        expect(dispatchBefore?.capability_revoked_at).toBeTruthy()
        expect(db.getTask(task.id)).toEqual(taskBefore)
        expect(db.getWorkerTerminalResourceByOwner(dispatch.id)).toEqual(resourceBefore)
      } finally {
        db.close()
      }
    }
  )

  it.each([true, false])(
    'keeps the provider-observed live=%s stop result unchanged',
    async (live) => {
      installDaemonTestProvider({
        listProcesses: vi.fn(async () => (live ? [{ id: 'local-pty' }] : []))
      })
      const runtime = {
        setPtyController: vi.fn(),
        onPtyExit: vi.fn(),
        markPtyLivenessUnverifiable: vi.fn(),
        markPtyLivenessLive: vi.fn()
      }
      handlers.clear()
      registerPtyHandlers(mainWindow as never, runtime as never)
      const controller = runtime.setPtyController.mock.calls[0][0] as {
        stopAndWait(id: string): Promise<boolean>
      }
      await expect(controller.stopAndWait('local-pty')).resolves.toBe(!live)
      expect(runtime.markPtyLivenessUnverifiable).not.toHaveBeenCalled()
    }
  )
})
