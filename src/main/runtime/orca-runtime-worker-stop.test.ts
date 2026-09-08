import { describe, expect, it, vi } from 'vitest'
import type { RuntimeTerminalClose } from '../../shared/runtime-types'
import type { IPtyProvider } from '../providers/types'
import { OrcaRuntimeService } from './orca-runtime'
import { OrchestrationDb } from './orchestration/db'
import { ORCHESTRATION_WORKER_STOP_METHODS } from './rpc/methods/orchestration-worker-stop'

describe('native supervised terminal close fence', () => {
  function fixture(connectionId: string | null = null) {
    let provider: IPtyProvider | undefined = {
      hasPty: () => true,
      providerGeneration: 1
    } as unknown as IPtyProvider
    const runtime = new OrcaRuntimeService(null, undefined, {
      getLocalProvider: () => provider as IPtyProvider,
      getSshProvider: () => provider
    })
    const stopAndWait = vi.fn(async () => true)
    const kill = vi.fn(() => true)
    runtime.setPtyController({
      write: () => true,
      kill,
      stopAndWait,
      getForegroundProcess: async () => null
    })
    let finish!: () => void
    const closeTab = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const closePane = vi.fn()
    runtime.setNotifier({ closeTerminalTab: closeTab, closeTerminal: closePane } as never)
    const tabId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const leafId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    runtime.registerPreAllocatedHandleForPty('pty-target', 'term_target')
    runtime.registerPty('pty-target', 'folder:fixture', connectionId, {
      tabId,
      leafId,
      incarnationId: 'incarnation-first' as never
    })
    const isCurrent = vi.fn(() => true)
    const close = () =>
      Reflect.apply(runtime.closeTerminal, runtime, [
        'term_target',
        { isCurrent }
      ]) as Promise<RuntimeTerminalClose>
    return {
      runtime,
      stopAndWait,
      kill,
      closeTab,
      closePane,
      close,
      isCurrent,
      tabId,
      leafId,
      finish: () => finish(),
      setProvider: (next: IPtyProvider | undefined) => {
        provider = next
      },
      setGeneration: (generation: number | undefined) =>
        Object.assign(provider!, { providerGeneration: generation })
    }
  }

  it('does not signal a replacement incarnation after asynchronous tab teardown', async () => {
    const f = fixture()
    const closing = f.close()
    await vi.waitFor(() => expect(f.closeTab).toHaveBeenCalledTimes(1))
    f.runtime.onPtySpawned('pty-target', 'incarnation-replacement' as never)
    f.finish()
    await expect(closing).resolves.toMatchObject({
      ptyKilled: false,
      ptyStopVerdict: 'unverifiable'
    })
    expect(f.stopAndWait).not.toHaveBeenCalled()
    expect(f.kill).not.toHaveBeenCalled()
  })

  it('does not signal after the owning provider changes during teardown', async () => {
    const f = fixture()
    const closing = f.close()
    await vi.waitFor(() => expect(f.closeTab).toHaveBeenCalledTimes(1))
    f.setProvider({ hasPty: () => true } as unknown as IPtyProvider)
    f.finish()
    await expect(closing).resolves.toMatchObject({
      ptyKilled: false,
      ptyStopVerdict: 'unverifiable'
    })
    expect(f.stopAndWait).not.toHaveBeenCalled()
  })

  it('refuses supervised close without an owning provider identity', async () => {
    const f = fixture()
    f.setProvider(undefined)
    const closing = f.close()
    await Promise.resolve()
    if (f.closeTab.mock.calls.length) {
      f.finish()
    }
    await expect(closing).resolves.toMatchObject({
      ptyKilled: false,
      ptyStopVerdict: 'unverifiable'
    })
    expect(f.stopAndWait).not.toHaveBeenCalled()
  })

  it('confirms an exact owned native stop', async () => {
    const f = fixture()
    const closing = f.close()
    await vi.waitFor(() => expect(f.closeTab).toHaveBeenCalledTimes(1))
    f.finish()
    await expect(closing).resolves.toMatchObject({ ptyKilled: true })
    expect(f.stopAndWait).toHaveBeenCalledExactlyOnceWith('pty-target', expect.anything())
    expect(f.kill).not.toHaveBeenCalled()
  })

  it.each([
    { platform: 'darwin', host: 'local' },
    { platform: 'linux', host: 'local' },
    { platform: 'win32', host: 'ssh' },
    { platform: 'win32', host: 'wsl' }
  ])('preserves the existing close deadline for $platform/$host', async ({ platform, host }) => {
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { ...descriptor, value: platform })
    try {
      const f = fixture(host === 'ssh' ? 'ssh-host' : null)
      if (host === 'wsl') {
        f.runtime.registerPty(
          'pty-target',
          'folder:fixture',
          null,
          {
            tabId: f.tabId,
            leafId: f.leafId,
            incarnationId: 'incarnation-first' as never
          },
          true
        )
      }
      const stopBudgets: number[] = []
      f.stopAndWait.mockImplementation(async (...args: unknown[]) => {
        const opts = args[1] as { deadlineMs: number }
        stopBudgets.push(opts.deadlineMs - Date.now())
        return true
      })
      const closing = f.runtime.closeTerminal('term_target')
      await vi.waitFor(() => expect(f.closeTab).toHaveBeenCalledTimes(1))
      f.finish()
      await closing
      expect(stopBudgets).toHaveLength(1)
      expect(stopBudgets[0]).toBeGreaterThan(0)
      expect(stopBudgets[0]).toBeLessThanOrEqual(2_000)
    } finally {
      Object.defineProperty(process, 'platform', descriptor)
    }
  })

  it('does not signal another live resource hidden from the renderer in the same tab', async () => {
    const f = fixture()
    f.runtime.registerPty('pty-sentinel', 'folder:fixture', null, {
      tabId: f.tabId,
      leafId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      incarnationId: 'sentinel' as never
    })
    await expect(f.close()).resolves.toMatchObject({ ptyKilled: true })
    expect(f.closeTab).not.toHaveBeenCalled()
    expect(f.stopAndWait).toHaveBeenCalledExactlyOnceWith('pty-target', expect.anything())
  })

  it.each(['ownership', 'natural_exit', 'controller', 'pane', 'missing_incarnation'])(
    'revalidates %s after teardown',
    async (changed) => {
      const f = fixture()
      const closing = f.close()
      await vi.waitFor(() => expect(f.closeTab).toHaveBeenCalledTimes(1))
      if (changed === 'ownership') {
        f.isCurrent.mockReturnValue(false)
      }
      if (changed === 'natural_exit') {
        f.runtime.onPtyExit('pty-target', 0)
      }
      if (changed === 'controller') {
        f.runtime.setPtyController(null)
      }
      if (changed === 'pane') {
        f.runtime.registerPty('pty-target', 'folder:fixture', null, {
          tabId: f.tabId,
          leafId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          incarnationId: 'incarnation-first' as never
        })
      }
      if (changed === 'missing_incarnation') {
        vi.spyOn(f.runtime, 'getTerminalProcessIncarnation').mockReturnValue(null)
      }
      f.finish()
      await expect(closing).resolves.toMatchObject({
        ptyKilled: false,
        ptyStopVerdict: 'unverifiable'
      })
      expect(f.stopAndWait).not.toHaveBeenCalled()
      expect(f.kill).not.toHaveBeenCalled()
    }
  )

  it.each([2, undefined])(
    'refuses changed or missing SSH provider generation %s',
    async (generation) => {
      const f = fixture('ssh-host')
      const closing = f.close()
      await vi.waitFor(() => expect(f.closeTab).toHaveBeenCalledTimes(1))
      f.setGeneration(generation)
      f.finish()
      await expect(closing).resolves.toMatchObject({
        ptyKilled: false,
        ptyStopVerdict: 'unverifiable'
      })
      expect(f.stopAndWait).not.toHaveBeenCalled()
    }
  )

  it('does not issue a fallback kill after identity changes during stop acknowledgement', async () => {
    const f = fixture()
    f.stopAndWait.mockImplementationOnce(async () => {
      f.runtime.onPtySpawned('pty-target', 'replacement' as never)
      return false
    })
    const closing = f.close()
    await vi.waitFor(() => expect(f.closeTab).toHaveBeenCalledTimes(1))
    f.finish()
    await expect(closing).resolves.toMatchObject({
      ptyKilled: false,
      ptyStopVerdict: 'unverifiable'
    })
    expect(f.kill).not.toHaveBeenCalled()
  })

  it('leaves generic close callers on the existing native path', async () => {
    const f = fixture()
    f.setProvider(undefined)
    const closing = f.runtime.closeTerminal('term_target')
    await vi.waitFor(() => expect(f.closeTab).toHaveBeenCalledTimes(1))
    f.finish()
    await expect(closing).resolves.toMatchObject({ ptyKilled: true })
    expect(f.stopAndWait).toHaveBeenCalledTimes(1)
  })

  it('carries the pre-observation provider fence through the actual stop service', async () => {
    const f = fixture()
    const db = new OrchestrationDb(':memory:')
    f.runtime.setOrchestrationDb(db)
    try {
      const task = db.createTask({ spec: 'provider changes during observation' })
      const { dispatch } = db.createStartingWorkerDispatch({ taskId: task.id, startOptions: {} })
      const authority = f.runtime.getOrchestrationDispatchAuthority('term_target')!
      db.prepareStartingWorkerAuthority({
        dispatchId: dispatch.id,
        handle: 'term_target',
        paneKey: authority.paneKey!,
        processIncarnation: authority.processIncarnation!,
        worktreeId: 'folder:fixture',
        setupState: 'not_applicable',
        effects: [],
        terminalOwnership: 'created',
        hostScope: JSON.stringify(authority.hostScope)
      })
      db.failWorkerStart(dispatch.id, 'dispatch_input', 'agent_prompt_stalled')
      vi.spyOn(f.runtime, 'showTerminal').mockImplementationOnce(async () => {
        await Promise.resolve()
        f.setProvider({ hasPty: () => true } as unknown as IPtyProvider)
        return { handle: 'term_target', connected: true } as never
      })
      const method = ORCHESTRATION_WORKER_STOP_METHODS[0]!
      const close = vi.spyOn(f.runtime, 'closeTerminal')
      await expect(
        method.handler(method.params!.parse({ dispatch: dispatch.id }), { runtime: f.runtime })
      ).resolves.toMatchObject({
        state: 'stop_unknown',
        processAction: 'none',
        lastError: expect.stringContaining('provider, or ownership changed')
      })
      expect(close).not.toHaveBeenCalled()
      expect(f.closeTab).not.toHaveBeenCalled()
      expect(f.stopAndWait).not.toHaveBeenCalled()
      expect(db.getDispatchContextById(dispatch.id)?.last_failure).toBe('agent_prompt_stalled')
    } finally {
      db.close()
    }
  })

  it('does not fall into unguarded cleanup after a guarded stop changes ownership', async () => {
    const f = fixture()
    f.runtime.registerPty('pty-sentinel', 'folder:fixture', null, {
      tabId: f.tabId,
      leafId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      incarnationId: 'sentinel' as never
    })
    f.stopAndWait.mockImplementationOnce(async () => {
      f.isCurrent.mockReturnValue(false)
      return false
    })
    await expect(f.close()).resolves.toMatchObject({
      ptyKilled: false,
      ptyStopVerdict: 'unverifiable'
    })
    expect(f.kill).not.toHaveBeenCalled()
    expect(f.closeTab).not.toHaveBeenCalled()
    expect(f.closePane).not.toHaveBeenCalled()
    expect(f.stopAndWait).toHaveBeenCalledExactlyOnceWith('pty-target', expect.anything())
  })

  it('does not enter mobile retirement with its unguarded headless fallback', async () => {
    const f = fixture()
    const internal = f.runtime as unknown as {
      tabs: Map<string, unknown>
      findMobileTerminalSurface: () => unknown
    }
    internal.tabs.set(f.tabId, {})
    vi.spyOn(internal, 'findMobileTerminalSurface').mockReturnValue({
      tab: { parentTabId: f.tabId }
    })
    const mobileClose = vi.spyOn(f.runtime, 'closeMobileSessionTab')
    const closing = f.close()
    await vi.waitFor(() => expect(f.closeTab).toHaveBeenCalledTimes(1))
    f.runtime.onPtySpawned('pty-target', 'replacement' as never)
    f.finish()
    await expect(closing).resolves.toMatchObject({
      ptyKilled: false,
      ptyStopVerdict: 'unverifiable'
    })
    expect(mobileClose).not.toHaveBeenCalled()
    expect(f.stopAndWait).not.toHaveBeenCalled()
    expect(f.closePane).not.toHaveBeenCalled()
  })
})
