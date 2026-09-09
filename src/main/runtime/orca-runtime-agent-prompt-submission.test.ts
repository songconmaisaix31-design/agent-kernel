import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentHookServer } from '../agent-hooks/server'
import { buildBody, postHookEvent, type Body } from '../agent-hooks/server.test-fixtures'
import type { AgentHookEventPayload } from '../../shared/agent-hook-listener'
import type { WithAgentStatusObservation } from '../../shared/agent-status-observation'
import { createHookStatusSessionTabsInvalidator } from '../agent-hooks/hook-status-session-tabs-invalidation'
import type { AgentPromptActivity } from './agent-prompt-submission-verification'
import { OrcaRuntimeService } from './orca-runtime'
import { makeStore } from './runtime-rpc-worktree-store-fixtures'
import { OrchestrationDb } from './orchestration/db'

vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../telemetry/cohort-classifier', () => ({ getCohortAtEmit: () => ({}) }))
vi.mock('../git/worktree', () => {
  const list = vi.fn().mockResolvedValue([
    {
      path: '/tmp/worktree-a',
      head: 'abc',
      branch: 'prompt',
      isBare: false,
      isMainWorktree: false
    }
  ])
  return { listWorktrees: list, listWorktreesStrict: list }
})

const PTY = 'pty-hook-prompt'
const TAB = 'tab-hook-prompt'
const LEAF = '11111111-1111-4111-8111-111111111111'
const servers: AgentHookServer[] = []
type PromptEvent = AgentHookEventPayload & WithAgentStatusObservation

async function createHookPromptRuntime(
  options: {
    transformEvent?: (event: PromptEvent) => PromptEvent
    scope?: 'folder' | 'ssh'
  } = {}
) {
  const server = new AgentHookServer()
  servers.push(server)
  await server.start({ env: 'production' })
  let subscriptions = 0
  const deps = {
    getAgentStatusSnapshot: () =>
      server.getStatusSnapshot().filter((row) => !row.providerSessionOnly),
    subscribeAgentPromptStatus: (listener: (event: PromptEvent) => void) => {
      subscriptions++
      const unsubscribe = server.subscribeEnrichedStatus((event) => {
        listener(options.transformEvent?.(event) ?? event)
      })
      return () => {
        subscriptions--
        unsubscribe()
      }
    }
  }
  const runtime = new OrcaRuntimeService(makeStore() as never, undefined, deps)
  if (options.scope) {
    vi.spyOn(
      runtime as unknown as {
        resolveTerminalWorkspaceLaunchScope: () => Promise<unknown>
      },
      'resolveTerminalWorkspaceLaunchScope'
    ).mockResolvedValue({
      id: 'repo-1::/tmp/worktree-a',
      path: '/tmp/worktree-a',
      connectionId: options.scope === 'ssh' ? 'ssh-prompt' : null,
      repo: null,
      folderWorkspace:
        options.scope === 'folder' ? { id: 'folder-a', path: '/tmp/worktree-a' } : null
    })
  }
  const changed = createHookStatusSessionTabsInvalidator()
  server.subscribeEnrichedStatus((event) => {
    if (changed(event)) {
      runtime.touchMobileSessionTabsForPane(event.paneKey, event.worktreeId)
    }
  })
  const writes: string[] = []
  let launchToken: string | undefined
  runtime.setPtyController({
    spawn: vi.fn().mockImplementation(async (options) => {
      launchToken = options.env?.ORCA_AGENT_LAUNCH_TOKEN
      return { id: PTY, incarnationId: 'hook-process-1' }
    }),
    write: (_ptyId, data) => {
      writes.push(data)
      if (data.includes('\x1b[201~')) {
        runtime.onPtyData(PTY, '\x1b[?25h', Date.now())
      }
      return true
    },
    kill: () => true,
    getForegroundProcess: async () => null
  })
  const terminal = await runtime.createTerminal('path:/tmp/worktree-a', {
    launchAgent: 'codex',
    launchConfig: { agentCommand: 'codex', agentArgs: '', agentEnv: {} },
    tabId: TAB,
    leafId: LEAF
  })
  expect(launchToken).toBeTruthy()
  const paneKey = runtime.getTerminalPaneKey(terminal.handle)!
  const activity = () =>
    (
      runtime as unknown as {
        getAgentPromptActivity: (handle: string, ptyId: string) => AgentPromptActivity
      }
    ).getAgentPromptActivity(terminal.handle, PTY)
  const events: {
    state: string
    paneMatches: boolean
    launchMatches: boolean
    activity: AgentPromptActivity
  }[] = []
  server.subscribeEnrichedStatus((event) => {
    events.push({
      state: event.payload.state,
      paneMatches: event.paneKey === paneKey,
      launchMatches: event.launchToken === launchToken,
      activity: activity()
    })
  })
  const hook = async (hookEventName: string, overrides: Partial<Body> = {}, source = 'codex') => {
    const response = await postHookEvent(
      server,
      buildBody(
        {
          hook_event_name: hookEventName,
          prompt: 'controlled prompt',
          ...(hookEventName === 'Stop' ? { last_assistant_message: 'controlled done' } : {})
        },
        { paneKey, tabId: TAB, worktreeId: 'repo-1::/tmp/worktree-a', launchToken, ...overrides }
      ),
      `/hook/${source}`
    )
    expect(response.status).toBe(204)
  }
  const relay = (
    overrides: Partial<Parameters<AgentHookServer['ingestRemote']>[0]> = {},
    connection = 'ssh-prompt'
  ) => {
    server.ingestRemote(
      {
        paneKey,
        tabId: TAB,
        worktreeId: 'repo-1::/tmp/worktree-a',
        launchToken,
        source: 'codex',
        hookEventName: 'UserPromptSubmit',
        hasExplicitPrompt: true,
        payload: { state: 'working', prompt: 'controlled prompt', agentType: 'codex' },
        ...overrides
      },
      connection
    )
  }
  return {
    runtime,
    handle: terminal.handle,
    paneKey,
    writes,
    activity,
    events,
    hook,
    relay,
    subscriptions: () => subscriptions
  }
}

type Fixture = Awaited<ReturnType<typeof createHookPromptRuntime>>

async function beginSubmission(
  fixture: Fixture,
  options: Parameters<OrcaRuntimeService['sendTerminalAgentPrompt']>[2] = {}
) {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  const result = fixture.runtime
    .sendTerminalAgentPrompt(fixture.handle, 'controlled prompt', options)
    .then(
      () => 'accepted',
      (error: Error) => error.message
    )
  await vi.advanceTimersByTimeAsync(1_500)
  return { result }
}

async function finishSubmission(fixture: Fixture, result: Promise<string>, verdict: string) {
  await vi.advanceTimersByTimeAsync(5_000)
  expect(await result).toBe(verdict)
  expect(fixture.writes).toHaveLength(2)
  expect(fixture.writes.filter((data) => data === '\r')).toHaveLength(1)
  expect(fixture.subscriptions()).toBe(0)
}

describe('HTTP hook to runtime prompt confirmation', () => {
  afterEach(() => {
    for (const server of servers.splice(0)) {
      server.stop()
    }
    vi.useRealTimers()
  })

  it('confirms a hook-only turn that finishes between confirmation polls', async () => {
    const fixture = await createHookPromptRuntime()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    const baseline = fixture.activity()
    const submission = fixture.runtime
      .sendTerminalAgentPrompt(fixture.handle, 'controlled prompt')
      .then(
        () => 'accepted',
        (error: Error) => error.message
      )
    await vi.advanceTimersByTimeAsync(1_500)
    expect(fixture.writes.filter((data) => data === '\r')).toHaveLength(1)
    await fixture.hook('UserPromptSubmit')
    await fixture.hook('Stop')
    await vi.advanceTimersByTimeAsync(5_000)
    const verdict = await submission
    console.info(
      'CONTROLLED_HOOK_TRACE',
      JSON.stringify({
        ptyId: PTY,
        baseline,
        events: fixture.events,
        final: fixture.activity(),
        verdict
      })
    )
    expect(verdict).toBe('accepted')
    expect(fixture.activity().workingSequence).toBeGreaterThan(baseline.workingSequence)
    expect(fixture.writes).toHaveLength(2)
  })

  it('confirms working without requiring a completion event', async () => {
    const fixture = await createHookPromptRuntime()
    const { result } = await beginSubmission(fixture)
    await fixture.hook('UserPromptSubmit')
    await finishSubmission(fixture, result, 'accepted')
  })

  it.each(['silence', 'redraw', 'done-only'])(
    'times out on %s without resending body or Enter',
    async (signal) => {
      const fixture = await createHookPromptRuntime()
      const { result } = await beginSubmission(fixture)
      if (signal === 'redraw') {
        fixture.runtime.onPtyData(PTY, 'unrelated output', Date.now())
      }
      if (signal === 'done-only') {
        await fixture.hook('Stop')
      }
      await finishSubmission(fixture, result, 'agent_prompt_stalled')
      expect(fixture.activity().workingSequence).toBe(0)
    }
  )

  it.each([
    { paneKey: `${TAB}:22222222-2222-4222-8222-222222222222` },
    { launchToken: 'other-process-launch' },
    { launchToken: undefined },
    { worktreeId: 'another-workspace' }
  ])('does not count a hook with mismatched ownership %j', async (overrides) => {
    const fixture = await createHookPromptRuntime()
    const { result } = await beginSubmission(fixture)
    await fixture.hook('UserPromptSubmit', overrides)
    expect(fixture.events).toHaveLength(1)
    await finishSubmission(fixture, result, 'agent_prompt_stalled')
    expect(fixture.activity().workingSequence).toBe(0)
  })

  it('does not count a different agent in the same pane', async () => {
    const fixture = await createHookPromptRuntime()
    const { result } = await beginSubmission(fixture)
    await fixture.hook('UserPromptSubmit', {}, 'claude')
    expect(fixture.events).toHaveLength(1)
    await finishSubmission(fixture, result, 'agent_prompt_stalled')
  })

  it('does not count a remote event for a local PTY', async () => {
    const fixture = await createHookPromptRuntime()
    const { result } = await beginSubmission(fixture)
    fixture.relay()
    expect(fixture.events).toHaveLength(1)
    await finishSubmission(fixture, result, 'agent_prompt_stalled')
  })

  it.each(['isReplay', 'restoredUnconfirmed', 'providerSessionOnly'] as const)(
    'ignores %s at the subscription boundary',
    async (flag) => {
      const fixture = await createHookPromptRuntime({
        transformEvent: (event) => ({ ...event, [flag]: true })
      })
      const { result } = await beginSubmission(fixture)
      await fixture.hook('UserPromptSubmit')
      await finishSubmission(fixture, result, 'agent_prompt_stalled')
      expect(fixture.activity().workingSequence).toBe(0)
    }
  )

  it('does not reuse old working even after another working hook arrives', async () => {
    const fixture = await createHookPromptRuntime()
    await fixture.hook('UserPromptSubmit')
    const { result } = await beginSubmission(fixture)
    const baseline = fixture.activity().workingSequence
    await fixture.hook('UserPromptSubmit')
    await finishSubmission(fixture, result, 'agent_prompt_stalled')
    expect(fixture.activity().workingSequence).toBe(baseline)
  })

  it('does not confirm new input from a previous turn late tool-progress hook', async () => {
    const fixture = await createHookPromptRuntime()
    await fixture.hook('UserPromptSubmit')
    await fixture.hook('Stop')
    const { result } = await beginSubmission(fixture)
    const baseline = fixture.activity()
    await fixture.hook('PreToolUse')
    expect(fixture.events.at(-1)).toMatchObject({
      state: 'working',
      paneMatches: true,
      launchMatches: true
    })
    await finishSubmission(fixture, result, 'agent_prompt_stalled')
    expect(fixture.activity().workingSequence).toBe(baseline.workingSequence)
  })

  it.each(['missing-observation', 'no-boundary', 'snapshot', 'other-origin', 'cached-prompt'])(
    'does not confirm a working hook with %s evidence',
    async (evidence) => {
      const fixture = await createHookPromptRuntime({
        transformEvent: (event) => {
          if (evidence === 'missing-observation') {
            return { ...event, observation: undefined }
          }
          if (evidence === 'cached-prompt') {
            return { ...event, hasExplicitPrompt: false }
          }
          if (!event.observation) {
            throw new Error('fixture hook observation missing')
          }
          return {
            ...event,
            observation: {
              ...event.observation,
              ...(evidence === 'no-boundary' ? { boundary: undefined } : {}),
              ...(evidence === 'snapshot' ? { kind: 'snapshot' as const } : {}),
              ...(evidence === 'other-origin' ? { origin: 'osc' as const } : {})
            }
          }
        }
      })
      const { result } = await beginSubmission(fixture)
      await fixture.hook('UserPromptSubmit')
      await finishSubmission(fixture, result, 'agent_prompt_stalled')
      expect(fixture.activity().workingSequence).toBe(0)
    }
  )

  it('does not reuse a complete hook cycle observed before Enter', async () => {
    const fixture = await createHookPromptRuntime()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    const result = fixture.runtime
      .sendTerminalAgentPrompt(fixture.handle, 'controlled prompt')
      .then(
        () => 'accepted',
        (error: Error) => error.message
      )
    await vi.advanceTimersByTimeAsync(0)
    expect(fixture.writes).toHaveLength(1)
    await fixture.hook('UserPromptSubmit')
    await fixture.hook('Stop')
    await vi.advanceTimersByTimeAsync(1_500)
    await finishSubmission(fixture, result, 'agent_prompt_stalled')
    expect(fixture.activity().workingSequence).toBe(1)
  })

  it('preserves a transient permission hook even when done arrives before polling', async () => {
    const fixture = await createHookPromptRuntime()
    const { result } = await beginSubmission(fixture)
    await fixture.hook('PermissionRequest')
    await fixture.hook('Stop')
    await finishSubmission(fixture, result, 'agent_prompt_blocked')
    expect(fixture.activity().permissionSequence).toBeGreaterThan(0)
  })

  it('refuses Enter when permission changes during paste settlement', async () => {
    const fixture = await createHookPromptRuntime()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    const result = fixture.runtime
      .sendTerminalAgentPrompt(fixture.handle, 'controlled prompt')
      .then(
        () => 'accepted',
        (error: Error) => error.message
      )
    await vi.advanceTimersByTimeAsync(0)
    await fixture.hook('PermissionRequest')
    await fixture.hook('Stop')
    await vi.advanceTimersByTimeAsync(1_500)
    expect(await result).toBe('agent_prompt_blocked')
    expect(fixture.writes).toHaveLength(1)
    expect(fixture.subscriptions()).toBe(0)
  })

  it('rejects a replaced process generation and releases its subscription', async () => {
    const fixture = await createHookPromptRuntime()
    const { result } = await beginSubmission(fixture)
    const generation = fixture.activity().generation
    fixture.runtime.synchronizePtyOutputSequenceFromProvider(
      PTY,
      { value: 0, generation: 'reset' },
      fixture.runtime.getPtyOutputSequence(PTY)
    )
    expect(fixture.activity().generation).not.toBe(generation)
    await fixture.hook('UserPromptSubmit')
    await finishSubmission(fixture, result, 'terminal_handle_stale')
    expect(fixture.activity().workingSequence).toBe(0)
  })

  it('preserves write authorization errors and cancels the hook subscription', async () => {
    const fixture = await createHookPromptRuntime()
    const { result } = await beginSubmission(fixture, {
      beforeWrite: () => {
        throw new Error('dispatch_inactive')
      }
    })
    expect(await result).toBe('dispatch_inactive')
    expect(fixture.writes).toHaveLength(0)
    expect(fixture.subscriptions()).toBe(0)
  })

  it('aborts confirmation without resending and ignores later hooks', async () => {
    const fixture = await createHookPromptRuntime()
    const controller = new AbortController()
    const { result } = await beginSubmission(fixture, { signal: controller.signal })
    controller.abort()
    await finishSubmission(fixture, result, 'request_aborted')
    await fixture.hook('UserPromptSubmit')
    expect(fixture.activity().workingSequence).toBe(0)
  })

  it.each(['folder', 'ssh'] as const)(
    'retains exact attribution for a substituted %s scope',
    async (scope) => {
      const fixture = await createHookPromptRuntime({ scope })
      const { result } = await beginSubmission(fixture)
      if (scope === 'ssh') {
        fixture.relay()
      } else {
        await fixture.hook('UserPromptSubmit')
      }
      await finishSubmission(fixture, result, 'accepted')
    }
  )

  it('does not confirm a relay replay for its matching SSH scope', async () => {
    const fixture = await createHookPromptRuntime({ scope: 'ssh' })
    const { result } = await beginSubmission(fixture)
    fixture.relay({ isReplay: true })
    await finishSubmission(fixture, result, 'agent_prompt_stalled')
  })

  it('serializes two submissions and gives each its own hook baseline', async () => {
    const fixture = await createHookPromptRuntime()
    const first = await beginSubmission(fixture)
    const second = fixture.runtime.sendTerminalAgentPrompt(fixture.handle, 'second prompt').then(
      () => 'accepted',
      (error: Error) => error.message
    )
    expect(fixture.subscriptions()).toBe(1)
    await fixture.hook('UserPromptSubmit')
    await fixture.hook('Stop')
    await vi.advanceTimersByTimeAsync(1_550)
    expect(await first.result).toBe('accepted')
    expect(fixture.writes).toHaveLength(4)
    expect(fixture.subscriptions()).toBe(1)
    await fixture.hook('UserPromptSubmit')
    await fixture.hook('Stop')
    await vi.advanceTimersByTimeAsync(50)
    expect(await second).toBe('accepted')
    expect(fixture.activity().workingSequence).toBe(2)
    expect(fixture.subscriptions()).toBe(0)
    expect(fixture.writes.filter((data) => data === '\r')).toHaveLength(2)
  })

  it.each([true, false])(
    'keeps completion reporting separate from hook evidence (working=%s)',
    async (working) => {
      const fixture = await createHookPromptRuntime()
      const db = new OrchestrationDb(':memory:')
      try {
        const task = db.createTask({ spec: 'controlled completion interleaving' })
        const dispatch = db.createDispatchContext(task.id, fixture.handle)
        const { result } = await beginSubmission(fixture)
        if (working) {
          await fixture.hook('UserPromptSubmit')
        }
        expect(
          db.settleWorkerReport({
            taskId: task.id,
            dispatchId: dispatch.id,
            outcome: 'succeeded',
            result: 'controlled done'
          })
        ).toMatchObject({ action: 'settled' })
        await fixture.hook('Stop')
        await finishSubmission(fixture, result, working ? 'accepted' : 'agent_prompt_stalled')
        if (!working) {
          db.failDispatch(dispatch.id, 'agent_prompt_stalled')
        }
        expect(db.getDispatchContextById(dispatch.id)?.status).toBe('completed')
        expect(db.getTask(task.id)?.status).toBe('completed')
      } finally {
        db.close()
      }
    }
  )
})
