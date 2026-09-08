import { describe, expect, it, vi } from 'vitest'
import { setupPtyIpcSuite } from './pty-ipc-test-harness'
import { registerPtyHandlers, getLocalPtyProvider } from './pty'
import { OrcaRuntimeService } from '../runtime/orca-runtime'
import { OrchestrationDb } from '../runtime/orchestration/db'
import { ORCHESTRATION_WORKER_STOP_METHODS } from '../runtime/rpc/methods/orchestration-worker-stop'

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
