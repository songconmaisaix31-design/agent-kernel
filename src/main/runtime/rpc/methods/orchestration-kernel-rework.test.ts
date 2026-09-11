import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'
import { OrchestrationDb } from '../../orchestration/db'
import type { Plan } from '../../orchestration/kernel-plan'
import type { RpcContext } from '../core'
import { ORCHESTRATION_METHODS } from './orchestration'

describe('Kernel same-owner rework', () => {
  const pane = 'tab_coord:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const workerPane = 'tab_worker:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const proof = { terminalHandle: 'term_coord', paneKey: pane, launchToken: 'kernel-test-proof' }
  let db: OrchestrationDb
  let runtime: OrcaRuntimeService
  let context: RpcContext
  let runId: string
  let taskId: string
  let plan: Plan
  let currentRuntimeEpoch: string
  let currentWorkerHandle: string

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    runtime = new OrcaRuntimeService()
    currentRuntimeEpoch = 'runtime-before-restart'
    currentWorkerHandle = 'term_worker'
    vi.spyOn(runtime, 'getRuntimeId').mockImplementation(() => currentRuntimeEpoch)
    runtime.setOrchestrationDb(db)
    runId = db.createRun({
      objective: 'Kernel rework',
      coordinatorHandle: 'term_coord',
      coordinatorPaneKey: pane
    }).id
    taskId = db.createTask({ spec: 'Implement a file', runId }).id
    plan = {
      schemaVersion: 1,
      objective: 'Kernel rework',
      nonGoals: [],
      baseCommit: 'a'.repeat(40),
      tasks: [
        {
          key: taskId,
          owner: 'worker',
          spec: 'Implement the approved fix.',
          writePaths: ['src/one.ts'],
          dependsOn: [],
          acceptance: ['unit test'],
          escalateWhen: []
        }
      ]
    }
    context = { runtime, orchestrationCompatibilityEvidence: proof }
    vi.spyOn(runtime, 'getOrchestrationDispatchAuthority').mockImplementation((handle) => {
      if (handle !== 'term_coord' && handle !== currentWorkerHandle) {
        return null
      }
      const coordinator = handle === 'term_coord'
      return {
        runtimeId: currentRuntimeEpoch,
        ptyId: coordinator ? 'pty_coord' : 'pty_worker',
        worktreeId: coordinator ? 'repo::parent' : 'repo::created',
        terminalHandle: handle,
        paneKey: coordinator ? pane : workerPane,
        processIncarnation: coordinator ? 'kernel-test:term_coord:1' : 'kernel-test:pty_worker:1',
        hostScope: { kind: 'local', hostId: 'local' },
        launchTokenHash: createHash('sha256')
          .update(coordinator ? proof.launchToken : 'worker-proof')
          .digest('hex')
      } as never
    })
    vi.spyOn(runtime, 'getTerminalPaneKey').mockImplementation((handle) =>
      handle === 'term_coord' ? pane : workerPane
    )
    vi.spyOn(runtime, 'getTerminalProcessIncarnation').mockImplementation((handle) =>
      handle === 'term_coord' ? 'kernel-test:term_coord:1' : 'kernel-test:pty_worker:1'
    )
    vi.spyOn(runtime, 'validateOrchestrationAgentLauncher').mockImplementation(() => {})
    vi.spyOn(runtime, 'showTerminal').mockResolvedValue({
      handle: 'term_coord',
      worktreeId: 'repo::parent',
      orphaned: false
    } as never)
    vi.spyOn(runtime, 'showManagedWorktree').mockResolvedValue({
      id: 'repo::parent',
      repoId: 'repo'
    } as never)
    vi.spyOn(runtime, 'showManagedTerminalWorkspace').mockResolvedValue({
      id: 'repo::created',
      repoId: 'repo',
      branch: 'kernel-rework'
    } as never)
    vi.spyOn(runtime, 'showRepo').mockResolvedValue({
      id: 'repo',
      kind: 'git',
      path: '/test/repo'
    } as never)
    vi.spyOn(runtime, 'createManagedWorktree').mockResolvedValue({
      worktree: { id: 'repo::created', repoId: 'repo' },
      startupTerminal: { spawned: true, handle: 'term_worker' }
    } as never)
    vi.spyOn(runtime, 'listTerminals').mockResolvedValue({
      terminals: [{ handle: 'term_worker' }],
      totalCount: 1,
      truncated: false
    } as never)
    vi.spyOn(runtime, 'waitForTerminal').mockResolvedValue({
      handle: 'term_worker',
      condition: 'tui-idle',
      satisfied: true,
      status: 'running',
      exitCode: null
    })
    vi.spyOn(runtime, 'getTerminalOrchestrationCliCommand').mockReturnValue('orca')
    vi.spyOn(runtime, 'sendTerminalAgentPrompt').mockResolvedValue({
      handle: 'term_worker',
      accepted: true,
      bytesWritten: 1
    })
  })

  afterEach(() => {
    db.close()
    vi.restoreAllMocks()
  })

  async function call(name: string, input: Record<string, unknown>) {
    const method = ORCHESTRATION_METHODS.find((candidate) => candidate.name === name)!
    return method.handler(method.params!.parse(input), context)
  }

  function start(input: Record<string, unknown> = {}) {
    return call('orchestration.workerStart', {
      task: taskId,
      from: 'term_coord',
      worktree: 'new-top-level',
      name: 'worker',
      agent: 'codex',
      ...input
    })
  }

  async function retainSuccessfulWorker() {
    await call('orchestration.runUse', {
      id: runId,
      from: 'term_coord',
      kernel: { repoId: 'repo', plan }
    })
    const original = (await start()) as { dispatchId: string }
    db.settleWorkerReport({
      taskId,
      dispatchId: original.dispatchId,
      outcome: 'succeeded',
      result: '{}'
    })
    db.retainWorkerTerminalResource(original.dispatchId)
    vi.mocked(runtime.showTerminal).mockImplementation(
      async (handle) =>
        ({
          handle,
          worktreeId: handle === currentWorkerHandle ? 'repo::created' : 'repo::parent',
          orphaned: false
        }) as never
    )
    vi.spyOn(runtime, 'isTerminalRunningAgent').mockResolvedValue(true)
    return original
  }

  function rework(dispatchId: string) {
    return start({
      worktree: 'id:repo::created',
      terminal: currentWorkerHandle,
      retryOf: dispatchId,
      name: undefined,
      agent: undefined
    })
  }

  function updateLimits(limits: Record<string, number>) {
    const config = JSON.parse(db.getRun(runId)!.kernel_config!)
    config.limits = { ...config.limits, ...limits }
    db.db
      .prepare('UPDATE runs SET kernel_config = ? WHERE id = ?')
      .run(JSON.stringify(config), runId)
  }

  function settleAndRetain(dispatchId: string) {
    db.settleWorkerReport({ taskId, dispatchId, outcome: 'succeeded', result: '{}' })
    db.retainWorkerTerminalResource(dispatchId)
  }

  it('creates a fresh Dispatch and transfers only the exact retained original resource', async () => {
    const original = await retainSuccessfulWorker()
    const resourceId = db.getWorkerTerminalResourceByOwner(original.dispatchId)?.id

    const result = (await rework(original.dispatchId)) as { dispatchId: string; state: string }

    expect(result).toMatchObject({ state: 'ready' })
    expect(result.dispatchId).not.toBe(original.dispatchId)
    expect(db.getDispatchContextById(original.dispatchId)).toMatchObject({ status: 'completed' })
    expect(db.getWorkerTerminalResourceByOwner(result.dispatchId)).toMatchObject({
      id: resourceId,
      ownership_state: 'owned',
      release_state: 'not_requested'
    })
    expect(JSON.parse(db.getWorkerDispatch(result.dispatchId)!.start_options)).toMatchObject({
      worktree: 'id:repo::created',
      repo: 'id:repo',
      kernelRework: { priorDispatchId: original.dispatchId, terminalHandle: 'term_worker' }
    })
  })

  it.each([
    [
      'wrong worktree',
      () =>
        vi.mocked(runtime.showManagedTerminalWorkspace).mockResolvedValue({
          id: 'repo::other',
          repoId: 'repo',
          branch: 'kernel-rework'
        } as never)
    ],
    [
      'wrong repository',
      () =>
        vi
          .mocked(runtime.showRepo)
          .mockResolvedValue({ id: 'other', kind: 'git', path: '/test/repo' } as never)
    ],
    [
      'wrong terminal owner',
      () =>
        vi
          .mocked(runtime.getTerminalPaneKey)
          .mockImplementation((handle) =>
            handle === 'term_coord' ? pane : 'tab_other:cccccccc-cccc-4ccc-8ccc-cccccccccccc'
          )
    ],
    [
      'wrong terminal incarnation',
      () =>
        vi
          .mocked(runtime.getTerminalProcessIncarnation)
          .mockReturnValue('kernel-test:term_worker:2')
    ],
    ['inactive terminal', () => vi.mocked(runtime.isTerminalRunningAgent).mockResolvedValue(false)],
    [
      'release in progress',
      () =>
        db.db
          .prepare(
            "UPDATE worker_terminal_resources SET release_state = 'requested' WHERE owner_dispatch_id = ?"
          )
          .run(db.getDispatchContext(taskId)!.id)
    ]
  ])('rejects %s before a rework Dispatch is created', async (_label, mutate) => {
    const original = await retainSuccessfulWorker()
    mutate()

    await expect(rework(original.dispatchId)).rejects.toMatchObject({
      code: 'kernel_rework_invalid'
    })
    expect(db.getDispatchContext(taskId)?.id).toBe(original.dispatchId)
  })

  it('rejects branch drift and changed policy before dispatch mutation', async () => {
    const original = await retainSuccessfulWorker()
    let observations = 0
    vi.mocked(runtime.showManagedTerminalWorkspace).mockImplementation(async () => {
      observations += 1
      return {
        id: 'repo::created',
        repoId: 'repo',
        branch: observations === 1 ? 'kernel-rework' : 'changed-branch'
      } as never
    })

    await expect(rework(original.dispatchId)).rejects.toMatchObject({
      code: 'kernel_rework_invalid'
    })
    expect(db.getDispatchContext(taskId)?.id).toBe(original.dispatchId)
  })

  it('rejects accepted predecessors, active downstream Tasks, and generation races transactionally', async () => {
    const original = await retainSuccessfulWorker()
    const downstream = db.createTask({ spec: 'Downstream', runId, deps: [taskId] })
    plan.tasks.push({ ...plan.tasks[0], key: downstream.id, dependsOn: [taskId] })
    const config = JSON.parse(db.getRun(runId)!.kernel_config!)
    config.plan = plan
    db.db
      .prepare('UPDATE runs SET kernel_config = ? WHERE id = ?')
      .run(JSON.stringify(config), runId)
    db.db.prepare("UPDATE tasks SET status = 'dispatched' WHERE id = ?").run(downstream.id)

    await expect(rework(original.dispatchId)).rejects.toMatchObject({
      code: 'kernel_rework_invalid'
    })
    expect(db.getDispatchContext(taskId)?.id).toBe(original.dispatchId)
  })

  it('rejects a Kernel-accepted predecessor without replacing its completed Dispatch', async () => {
    const original = await retainSuccessfulWorker()
    db.db.prepare('UPDATE tasks SET kernel_acceptance = ? WHERE id = ?').run(
      JSON.stringify({
        status: 'accepted',
        task: taskId,
        dispatch: original.dispatchId,
        candidate: 'b'.repeat(40),
        approvalId: '11111111-1111-4111-8111-111111111111',
        token: '22222222-2222-4222-8222-222222222222',
        binding: 'binding',
        location: 'location',
        paths: [],
        check: { exitCode: 0, stdout: '', stderr: '' }
      }),
      taskId
    )

    await expect(rework(original.dispatchId)).rejects.toMatchObject({
      code: 'kernel_rework_invalid'
    })
    expect(db.getDispatchContext(taskId)?.id).toBe(original.dispatchId)
  })

  it('rejects a Kernel candidate that is still checking', async () => {
    const original = await retainSuccessfulWorker()
    db.db
      .prepare('UPDATE tasks SET kernel_acceptance = ? WHERE id = ?')
      .run(JSON.stringify({ status: 'checking' }), taskId)

    await expect(rework(original.dispatchId)).rejects.toMatchObject({
      code: 'kernel_rework_invalid'
    })
    expect(db.getDispatchContext(taskId)?.id).toBe(original.dispatchId)
  })

  it('rejects a generation change between admission and transaction commit', async () => {
    const original = await retainSuccessfulWorker()
    let observed = false
    vi.mocked(runtime.showManagedTerminalWorkspace).mockImplementation(async () => {
      if (observed) {
        db.db
          .prepare('UPDATE runs SET consumer_generation = consumer_generation + 1 WHERE id = ?')
          .run(runId)
      }
      observed = true
      return { id: 'repo::created', repoId: 'repo', branch: 'kernel-rework' } as never
    })

    await expect(rework(original.dispatchId)).rejects.toMatchObject({ code: 'consumer_fenced' })
    expect(db.getDispatchContext(taskId)?.id).toBe(original.dispatchId)
  })

  it('rejects an approved-plan policy change during rework preparation', async () => {
    const original = await retainSuccessfulWorker()
    let observed = false
    vi.mocked(runtime.showManagedTerminalWorkspace).mockImplementation(async () => {
      if (observed) {
        const config = JSON.parse(db.getRun(runId)!.kernel_config!)
        config.limits.maxAttempts = 3
        db.db
          .prepare('UPDATE runs SET kernel_config = ? WHERE id = ?')
          .run(JSON.stringify(config), runId)
      }
      observed = true
      return { id: 'repo::created', repoId: 'repo', branch: 'kernel-rework' } as never
    })

    await expect(rework(original.dispatchId)).rejects.toMatchObject({
      code: 'kernel_config_changed'
    })
    expect(db.getDispatchContext(taskId)?.id).toBe(original.dispatchId)
  })

  it('preserves the persisted concurrent Worker limit for a rework', async () => {
    const original = await retainSuccessfulWorker()
    const config = JSON.parse(db.getRun(runId)!.kernel_config!)
    config.limits.maxConcurrentWorkers = 1
    db.db
      .prepare('UPDATE runs SET kernel_config = ? WHERE id = ?')
      .run(JSON.stringify(config), runId)

    await expect(rework(original.dispatchId)).rejects.toMatchObject({
      code: 'kernel_concurrency_limit'
    })
    expect(db.getDispatchContext(taskId)?.id).toBe(original.dispatchId)
  })

  it('allows a second rework only when the persisted attempt limits permit its resource lineage', async () => {
    const original = await retainSuccessfulWorker()
    updateLimits({ maxAttemptsPerTask: 3, maxAttempts: 3, maxConcurrentWorkers: 3 })

    const firstRework = (await rework(original.dispatchId)) as { dispatchId: string }
    settleAndRetain(firstRework.dispatchId)
    const secondRework = (await rework(firstRework.dispatchId)) as { dispatchId: string }

    const resource = db.getWorkerTerminalResourceByOwner(secondRework.dispatchId)!
    expect(resource.origin_dispatch_id).toBe(original.dispatchId)
    expect(JSON.parse(resource.prior_owner_dispatch_ids)).toEqual([
      original.dispatchId,
      firstRework.dispatchId
    ])
  })

  it('rejects a repeated rework when the persisted task attempt limit is exhausted', async () => {
    const original = await retainSuccessfulWorker()
    const firstRework = (await rework(original.dispatchId)) as { dispatchId: string }
    settleAndRetain(firstRework.dispatchId)

    await expect(rework(firstRework.dispatchId)).rejects.toMatchObject({
      code: 'kernel_task_attempt_limit'
    })
    expect(db.getDispatchContext(taskId)?.id).toBe(firstRework.dispatchId)
  })

  it('accepts an exact current managed terminal proof across a runtime epoch change', async () => {
    const original = await retainSuccessfulWorker()
    currentRuntimeEpoch = 'runtime-after-restart'
    currentWorkerHandle = 'term_worker_after_restart'

    const result = (await rework(original.dispatchId)) as { dispatchId: string }
    const worker = db.getWorkerDispatch(result.dispatchId)!
    const binding = JSON.parse(worker.start_options).kernelRework
    expect(worker.runtime_epoch).toBe('runtime-after-restart')
    expect(binding).toMatchObject({
      runtimeEpoch: 'runtime-before-restart',
      currentRuntimeEpoch: 'runtime-after-restart',
      terminalHandle: 'term_worker_after_restart',
      historicalTerminalHandle: 'term_worker'
    })
  })

  it.each([
    [
      'an orphaned pane',
      () =>
        vi.mocked(runtime.showTerminal).mockResolvedValue({
          handle: 'term_worker',
          worktreeId: 'repo::created',
          orphaned: true
        } as never)
    ],
    [
      'a missing current authority',
      () =>
        vi.mocked(runtime.getOrchestrationDispatchAuthority).mockImplementation((handle) =>
          handle === 'term_coord'
            ? ({
                runtimeId: currentRuntimeEpoch,
                terminalHandle: 'term_coord',
                ptyId: 'pty_term_coord',
                worktreeId: 'repo::parent',
                paneKey: pane,
                processIncarnation: 'kernel-test:term_coord:1',
                hostScope: { kind: 'local', hostId: 'local' },
                launchTokenHash: createHash('sha256').update(proof.launchToken).digest('hex')
              } as never)
            : null
        )
    ],
    [
      'a replacement process incarnation',
      () =>
        vi
          .mocked(runtime.getTerminalProcessIncarnation)
          .mockImplementation((handle) =>
            handle === 'term_coord' ? 'kernel-test:term_coord:1' : 'kernel-test:term_worker:2'
          )
    ]
  ])('rejects %s after an app epoch change', async (_label, mutate) => {
    const original = await retainSuccessfulWorker()
    currentRuntimeEpoch = 'runtime-after-restart'
    currentWorkerHandle = 'term_worker_after_restart'
    mutate()

    await expect(rework(original.dispatchId)).rejects.toMatchObject({
      code: 'kernel_rework_invalid'
    })
    expect(db.getDispatchContext(taskId)?.id).toBe(original.dispatchId)
  })

  it('rejects client-supplied rework overrides and a non-coordinator caller', async () => {
    const original = await retainSuccessfulWorker()
    await expect(
      start({
        worktree: 'id:repo::created',
        terminal: 'term_worker',
        retryOf: original.dispatchId,
        repo: 'id:repo',
        name: undefined,
        agent: undefined
      })
    ).rejects.toMatchObject({ code: 'kernel_unsupported_path' })
    await expect(
      call('orchestration.workerStart', {
        task: taskId,
        from: 'term_worker',
        worktree: 'id:repo::created',
        terminal: 'term_worker',
        retryOf: original.dispatchId
      })
    ).rejects.toMatchObject({ code: 'consumer_fenced' })
  })
})
