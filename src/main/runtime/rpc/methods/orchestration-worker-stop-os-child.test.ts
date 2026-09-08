import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { OrchestrationDb } from '../../orchestration/db'
import { ORCHESTRATION_WORKER_STOP_METHODS } from './orchestration-worker-stop'

it('OS child fixture: stops only the exact active owned target through the actual stop service', async () => {
  const directory = await mkdtemp(
    join(process.env.ORCA_STOP_FIXTURE_EVIDENCE ?? tmpdir(), 'stop-child-')
  )
  const script = join(directory, 'owned-timer.cjs')
  await writeFile(script, 'setInterval(() => {}, 1000); process.send({ ready: true });\n')
  const children: ChildProcess[] = []
  const events: unknown[] = []
  const db = new OrchestrationDb(join(directory, 'fixture.sqlite'))
  const hostScope = { kind: 'local', hostId: 'fixture' }
  const paneKey = 'fixture:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  let active: ChildProcess
  let incarnation: string
  let expectedIncarnation: string
  let closeCount = 0

  async function launch(role: string) {
    const child = spawn(process.execPath, [script], {
      cwd: directory,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      windowsHide: true
    })
    children.push(child)
    const [ready] = await once(child, 'message', { signal: AbortSignal.timeout(10_000) })
    expect(ready).toEqual({ ready: true })
    events.push({ phase: 'ready', role, pid: child.pid, live: child.exitCode === null })
    return child
  }

  async function stopChild(child: ChildProcess, phase: string) {
    if (child.exitCode !== null || child.signalCode !== null) {
      return false
    }
    const exited = once(child, 'exit', { signal: AbortSignal.timeout(10_000) })
    const signalled = child.kill()
    const [code, signal] = await exited
    events.push({ phase, pid: child.pid, signalled, code, signal })
    return signalled
  }

  function createDispatch() {
    const taskId = db.createTask({ spec: 'owned fixture timer' }).id
    const dispatchId = db.createStartingWorkerDispatch({ taskId, startOptions: {} }).dispatch.id
    db.prepareStartingWorkerAuthority({
      dispatchId,
      handle: 'term_fixture',
      paneKey,
      processIncarnation: expectedIncarnation,
      worktreeId: `folder:${directory}`,
      effects: [],
      setupState: 'not_applicable',
      terminalOwnership: 'created',
      hostScope: JSON.stringify(hostScope)
    })
    db.failWorkerStart(dispatchId, 'dispatch_input', 'agent_prompt_stalled')
    return { taskId, dispatchId }
  }

  const runtime = {
    getOrchestrationDb: () => db,
    getRuntimeId: () => 'fixture',
    captureSupervisedTerminalCloseGuard: (_handle: string, isCurrent: () => boolean) => isCurrent,
    showTerminal: async () => ({ handle: 'term_fixture', connected: active.exitCode === null }),
    getTerminalPaneKey: () => paneKey,
    getTerminalProcessIncarnation: () => incarnation,
    getOrchestrationDispatchAuthority: () => ({
      terminalHandle: 'term_fixture',
      paneKey,
      processIncarnation: incarnation,
      hostScope
    }),
    getTerminalLivenessVerdict: () => ({ status: active.exitCode === null ? 'live' : 'exited' }),
    closeTerminal: async (handle: string, guard: { isCurrent: () => boolean }) => {
      expect(guard.isCurrent()).toBe(true)
      expect(handle).toBe('term_fixture')
      expect(incarnation).toBe(expectedIncarnation)
      closeCount += 1
      return { handle, ptyKilled: await stopChild(active, 'service-stop') }
    },
    notifyMessageArrived: () => {}
  } as unknown as OrcaRuntimeService

  const method = ORCHESTRATION_WORKER_STOP_METHODS[0]!
  const stop = (dispatchId: string) =>
    method.handler(method.params!.parse({ dispatch: dispatchId }), { runtime })
  try {
    const sentinel = await launch('unrelated-sentinel')
    active = await launch('owned-active-target')
    incarnation = expectedIncarnation = `fixture:${active.pid}:first`
    const first = createDispatch()
    const history = db.getDispatchContextById(first.dispatchId)
    const result = await stop(first.dispatchId)
    events.push({
      phase: 'active-result',
      result,
      targetExited: active.exitCode !== null || active.signalCode !== null,
      sentinelLive: sentinel.exitCode === null && sentinel.signalCode === null
    })
    expect(result).toMatchObject({
      state: 'stopped',
      alreadySettled: false,
      processAction: 'closed_agent_terminal'
    })
    expect(active.exitCode !== null || active.signalCode !== null).toBe(true)
    expect(sentinel.exitCode).toBeNull()
    expect(sentinel.signalCode).toBeNull()
    expect(closeCount).toBe(1)
    expect(db.getDispatchContextById(first.dispatchId)).toEqual(history)
    expect(db.getTask(first.taskId)?.status).toBe('failed')

    active = await launch('changed-identity-target')
    incarnation = expectedIncarnation = `fixture:${active.pid}:second`
    const second = createDispatch()
    incarnation = `fixture:${active.pid}:replacement`
    const changed = await stop(second.dispatchId)
    events.push({
      phase: 'changed-identity-result',
      result: changed,
      closeCount,
      targetLive: active.exitCode === null && active.signalCode === null,
      sentinelLive: sentinel.exitCode === null && sentinel.signalCode === null
    })
    expect(changed).toMatchObject({ state: 'stop_unknown', processAction: 'none' })
    expect(closeCount).toBe(1)
    expect(active.exitCode).toBeNull()
    expect(active.signalCode).toBeNull()
    expect(sentinel.exitCode).toBeNull()
    expect(sentinel.signalCode).toBeNull()
  } finally {
    for (const child of children) {
      await stopChild(child, 'fixture-cleanup')
    }
    db.close()
    await writeFile(
      join(directory, 'os-child-results.json'),
      JSON.stringify(
        {
          evidenceClass:
            'OS child with actual worker-stop service and minimal runtime adapter; no Codex calls',
          directory,
          events,
          allFixtureChildrenExited: children.every(
            (child) => child.exitCode !== null || child.signalCode !== null
          )
        },
        null,
        2
      )
    )
  }
}, 45_000)
