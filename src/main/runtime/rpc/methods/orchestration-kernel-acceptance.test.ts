import { revalidateKernelAcceptanceReply } from './orchestration-kernel-acceptance'
import { ORCHESTRATION_CONTRACT_VERSION } from '../../../../shared/protocol-version'
import { RpcDispatcher } from '../dispatcher'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'
import { OrchestrationDb } from '../../orchestration/db'
import { configureKernelRun } from '../../orchestration/kernel-run-config'
import { ORCHESTRATION_METHODS } from './orchestration'
import type { RpcContext } from '../core'
import type { Plan } from '../../orchestration/kernel-plan'

// Real registered RPC handlers, SQLite, Git commits and Node checks. Only runtime identity/workspace lookup is substituted.
describe('Kernel acceptance registered service', () => {
  const pane = 'tab_coord:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const proof = {
    terminalHandle: 'term_coord',
    paneKey: pane,
    launchToken: 'acceptance-test-proof'
  }
  let root: string, repo: string, candidate: string, run: string, task: string, dispatch: string
  let db: OrchestrationDb, runtime: OrcaRuntimeService, ctx: RpcContext, plan: Plan
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true }).trim()
  const call = async (name: string, params: Record<string, unknown>) => {
    const method = ORCHESTRATION_METHODS.find((entry) => entry.name === `orchestration.${name}`)!
    return (await method.handler(
      method.params!.parse({ run, from: proof.terminalHandle, ...params }),
      ctx
    )) as unknown
  }
  const approve = (
    source = "require('node:assert/strict').equal(require('node:fs').readFileSync('answer.txt','utf8'),'42')",
    timeoutMs = 3000
  ) => call('kernelApproveAcceptance', { checks: { [task]: { source, timeoutMs } } })
  const accept = (extra: Record<string, unknown> = {}) =>
    call('kernelAccept', { task, dispatch, candidate, ...extra })
  const stored = () => JSON.parse(db.getTask(task)?.kernel_acceptance ?? 'null')
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-acceptance-service-'))
    repo = join(root, 'repo')
    await mkdir(repo)
    git('init', '-q')
    git('config', 'user.email', 'test@example.invalid')
    git('config', 'user.name', 'Test')
    await writeFile(join(repo, 'answer.txt'), '0')
    git('add', '.')
    git('commit', '-qm', 'base')
    const base = git('rev-parse', 'HEAD')
    await writeFile(join(repo, 'answer.txt'), '42')
    git('add', '.')
    git('commit', '-qm', 'candidate')
    candidate = git('rev-parse', 'HEAD')
    db = new OrchestrationDb(join(root, 'orchestration.db'))
    runtime = new OrcaRuntimeService()
    runtime.setOrchestrationDb(db)
    run = db.createRun({
      objective: 'Accept',
      coordinatorHandle: proof.terminalHandle,
      coordinatorPaneKey: pane
    }).id
    task = db.createTask({ runId: run, spec: 'Mutable native body' }).id
    plan = {
      schemaVersion: 1,
      objective: 'Return 42',
      nonGoals: [],
      baseCommit: base,
      tasks: [
        {
          key: task,
          owner: 'worker',
          spec: 'Write answer.txt with 42',
          writePaths: ['answer.txt'],
          dependsOn: [],
          acceptance: ['descriptive only'],
          escalateWhen: []
        }
      ]
    }
    configureKernelRun(db, db.getRun(run)!, { repoId: 'repo', plan })
    dispatch = db.createStartingWorkerDispatch({
      taskId: task,
      expectedKernelConfig: db.getRun(run)!.kernel_config,
      startOptions: { repo: 'id:repo', baseBranch: base, worktree: 'new-top-level' }
    }).dispatch.id
    db.db
      .prepare('UPDATE worker_dispatches SET worktree_id = ? WHERE dispatch_id = ?')
      .run('worktree', dispatch)
    db.markWorkerDispatchReady(dispatch)
    db.settleWorkerReport({
      taskId: task,
      dispatchId: dispatch,
      outcome: 'succeeded',
      result: 'Worker claims done'
    })
    vi.spyOn(runtime, 'getOrchestrationDispatchAuthority').mockImplementation((handle) =>
      handle === proof.terminalHandle
        ? ({
            ptyId: 'test-pty',
            worktreeId: 'coord-worktree',
            terminalHandle: handle,
            paneKey: pane,
            processIncarnation: 'test-incarnation',
            hostScope: { kind: 'local' },
            launchTokenHash: createHash('sha256').update(proof.launchToken).digest('hex')
          } as never)
        : null
    )
    vi.spyOn(runtime, 'getTerminalPaneKey').mockReturnValue(pane)
    vi.spyOn(runtime, 'showRepo').mockResolvedValue({
      id: 'repo',
      path: repo,
      kind: 'git',
      executionHostId: 'local'
    } as never)
    vi.spyOn(runtime, 'showManagedWorktree').mockResolvedValue({
      id: 'worktree',
      repoId: 'repo',
      path: repo
    } as never)
    ctx = { runtime, orchestrationCompatibilityEvidence: proof }
  })
  afterEach(async () => {
    db?.close()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })
  it('executes approved Node against fixed bytes, persists accepted and revalidates duplicates', async () => {
    await approve()
    const result = await accept()
    expect(result).toMatchObject({
      duplicate: false,
      acceptance: {
        status: 'accepted',
        candidate,
        dispatch,
        task,
        paths: ['answer.txt'],
        check: { exitCode: 0 }
      }
    })
    expect(stored().status).toBe('accepted')
    expect(db.getTask(task)?.result).toBe('Worker claims done')
    expect(await accept()).toMatchObject({ duplicate: true, acceptance: { status: 'accepted' } })
    expect(git('worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1)
  })
  it.each([
    'no-policy',
    'worker',
    'forged-result',
    'wrong-dispatch',
    'wrong-candidate',
    'not-supervised'
  ])('rejects %s without accepting', async (kind) => {
    if (kind !== 'no-policy' && kind !== 'forged-result') {
      await approve()
    }
    if (kind === 'worker') {
      ctx.orchestrationCompatibilityEvidence = { ...proof, terminalHandle: 'term_worker' }
    }
    if (kind === 'forged-result') {
      db.updateTaskStatus(task, 'completed', '{"status":"accepted","testsPassed":true}')
    }
    if (kind === 'not-supervised') {
      db.db.prepare('DELETE FROM worker_dispatches WHERE dispatch_id = ?').run(dispatch)
    }
    await expect(
      accept(
        kind === 'wrong-dispatch'
          ? { dispatch: 'ctx_wrong' }
          : kind === 'wrong-candidate'
            ? { candidate: plan.baseCommit }
            : {}
      )
    ).rejects.toThrow()
    expect(stored()?.status).not.toBe('accepted')
  })
  it('rejects request-supplied strategy, repo and testsPassed', async () => {
    await approve()
    await expect(accept({ testsPassed: true, repoPath: repo })).rejects.toThrow()
  })
  it.each(['nonzero', 'timeout', 'modify-snapshot'])(
    'fails the actual process check: %s',
    async (kind) => {
      await approve(
        kind === 'nonzero'
          ? 'process.exit(7)'
          : kind === 'timeout'
            ? 'setInterval(()=>{},1000)'
            : "require('node:fs').writeFileSync('answer.txt','forged')",
        kind === 'timeout' ? 50 : 3000
      )
      await expect(accept()).rejects.toThrow()
      expect(stored()).toMatchObject({ status: 'rejected' })
    }
  )
  it('does not take the check from candidate content or native Task.spec', async () => {
    await approve()
    db.db.prepare('UPDATE tasks SET spec = ? WHERE id = ?').run('process.exit(0)', task)
    await writeFile(join(repo, 'answer.txt'), 'wrong')
    git('add', '.')
    git('commit', '-qm', 'wrong')
    candidate = git('rev-parse', 'HEAD')
    await expect(accept()).rejects.toThrow()
    expect(stored().status).toBe('rejected')
  })
  it('reapproval invalidates prior acceptance and actually executes the new check', async () => {
    await approve()
    await accept()
    const old = stored().approvalId
    await approve('process.exit(9)')
    expect(stored()).toBeNull()
    await expect(accept()).rejects.toThrow()
    expect(stored().approvalId).not.toBe(old)
  })
  it('late worker completion cannot overwrite accepted; native result cannot forge it', async () => {
    await approve()
    await accept()
    const before = stored()
    expect(
      db.settleWorkerReport({
        taskId: task,
        dispatchId: dispatch,
        outcome: 'succeeded',
        result: 'late'
      })
    ).toMatchObject({ duplicate: true })
    db.updateTaskStatus(task, 'completed', '{"status":"accepted"}')
    expect(stored()).toEqual(before)
    db.updateTaskStatus(task, 'failed')
    expect(stored()).toBeNull()
    await expect(accept()).rejects.toThrow()
  })
  it.each(['generation', 'policy', 'task', 'dispatch', 'source-head', 'concurrent'])(
    'cannot accept when %s changes while a real check runs',
    async (kind) => {
      const marker = join(root, 'running')
      await approve(
        `require('node:fs').writeFileSync(${JSON.stringify(marker)},'ready');setTimeout(()=>{},500)`
      )
      const pending = accept()
      const outcome = pending.then(
        (result) => ({ result }),
        (error) => ({ error })
      )
      for (let count = 0; count < 200; count++) {
        try {
          await access(marker)
          break
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
      }
      expect(await readFile(marker, 'utf8')).toBe('ready')
      if (kind === 'generation') {
        db.db
          .prepare('UPDATE runs SET consumer_generation = consumer_generation + 1 WHERE id = ?')
          .run(run)
      }
      if (kind === 'policy') {
        await approve('process.exit(0)')
      }
      if (kind === 'task') {
        db.updateTaskStatus(task, 'failed')
        db.updateTaskStatus(task, 'completed')
      }
      if (kind === 'dispatch') {
        db.db
          .prepare("UPDATE worker_dispatches SET stage = 'changed' WHERE dispatch_id = ?")
          .run(dispatch)
      }
      if (kind === 'source-head') {
        git('commit', '--allow-empty', '-qm', 'advance')
      }
      if (kind === 'concurrent') {
        await expect(accept()).rejects.toMatchObject({ code: 'kernel_acceptance_busy' })
      }
      const result = await outcome
      if (kind === 'concurrent') {
        expect(result).toHaveProperty('result.acceptance.status', 'accepted')
      } else {
        expect(result).toHaveProperty('error')
        expect(stored()?.status).not.toBe('accepted')
      }
    }
  )
  it('unresolved checking rejects restart recovery rather than guessing success', async () => {
    await approve()
    db.db
      .prepare('UPDATE tasks SET kernel_acceptance = ? WHERE id = ?')
      .run('{"status":"checking"}', task)
    await expect(accept()).rejects.toMatchObject({ code: 'kernel_acceptance_busy' })
  })
  it('rejects actual out-of-scope changes before any trusted code runs', async () => {
    const marker = join(root, 'should-not-run')
    await approve(`require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad')`)
    await writeFile(join(repo, 'outside.txt'), 'bad')
    git('add', '.')
    git('commit', '-qm', 'outside')
    candidate = git('rev-parse', 'HEAD')
    await expect(accept()).rejects.toMatchObject({ code: 'out_of_scope' })
    await expect(access(marker)).rejects.toThrow()
  })
  it('clears inherited Node injection and Orca credentials from the actual process', async () => {
    await approve(
      'if(process.env.NODE_OPTIONS||process.env.NODE_PATH||process.env.ORCA_AUTH_TOKEN||process.env.ORCA_DISPATCH_CAPABILITY)process.exit(8)'
    )
    vi.stubEnv('NODE_OPTIONS', '--require=does-not-exist')
    vi.stubEnv('NODE_PATH', repo)
    vi.stubEnv('ORCA_AUTH_TOKEN', 'fixture')
    vi.stubEnv('ORCA_DISPATCH_CAPABILITY', 'fixture')
    expect(await accept()).toHaveProperty('acceptance.status', 'accepted')
  })
  it('routes native CLI through the real RPC dispatcher and SQLite', async () => {
    const { ORCHESTRATION_HANDLERS } = await vi.importActual<{
      ORCHESTRATION_HANDLERS: Record<
        string,
        (input: {
          flags: Map<string, string | boolean>
          cwd: string
          client: {
            call: (method: string, params: Record<string, unknown>) => Promise<{ result: unknown }>
          }
          json: boolean
        }) => Promise<void>
      >
    }>('../../../../cli/handlers/orchestration')
    const dispatcher = new RpcDispatcher({ runtime, methods: ORCHESTRATION_METHODS })
    const client = {
      call: async (method: string, params: Record<string, unknown>) => {
        const response = await dispatcher.dispatch({
          id: 'request',
          authToken: '',
          method,
          params,
          orchestrationRequestId: method,
          orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION,
          orchestrationCompatibilityEvidence: proof
        })
        if (!response.ok) {
          throw new Error(JSON.stringify(response.error))
        }
        return { result: response.result }
      }
    }
    const checks = {
      [task]: {
        source:
          "require('node:assert/strict').equal(require('node:fs').readFileSync('answer.txt','utf8'),'42')",
        timeoutMs: 3000
      }
    }
    const file = join(root, 'checks.json')
    await writeFile(file, JSON.stringify(checks))
    const invoke = (command: string, flags: [string, string][]) =>
      ORCHESTRATION_HANDLERS[`orchestration ${command}`]({
        flags: new Map([['from', proof.terminalHandle], ['run', run], ...flags]),
        cwd: root,
        client,
        json: true
      } as never)
    await invoke('kernel-approve-acceptance', [['checks', file]])
    await invoke('kernel-accept', [
      ['task', task],
      ['dispatch', dispatch],
      ['candidate', candidate]
    ])
    expect(stored().status).toBe('accepted')
    expect(
      db.db.prepare('SELECT COUNT(*) AS n FROM mutation_receipts WHERE state = ?').get('completed')
    ).toEqual({ n: 2 })
  })
  it.each(['ssh', 'wsl', 'folder', 'wrong-repository', 'not-settled'])(
    'rejects unsupported or unproven binding %s',
    async (kind) => {
      await approve()
      if (kind === 'not-settled') {
        db.db
          .prepare("UPDATE worker_dispatches SET stage = 'input_accepted' WHERE dispatch_id = ?")
          .run(dispatch)
      } else {
        vi.mocked(runtime.showRepo).mockResolvedValue({
          id: kind === 'wrong-repository' ? 'other' : 'repo',
          path: repo,
          kind: kind === 'folder' ? 'folder' : 'git',
          connectionId: kind === 'ssh' ? 'ssh' : undefined,
          executionHostId: kind === 'wsl' ? 'wsl:Ubuntu' : 'local'
        } as never)
      }
      await expect(accept()).rejects.toThrow()
      expect(stored()?.status).not.toBe('accepted')
    }
  )
  it.each(['generation', 'policy', 'task', 'source-head', 'identity'])(
    'revalidates completed durable receipt after %s changes',
    async (kind) => {
      await approve()
      const dispatcher = new RpcDispatcher({ runtime, methods: ORCHESTRATION_METHODS })
      const request = {
        id: 'accept-request',
        authToken: '',
        method: 'orchestration.kernelAccept',
        params: { run, from: proof.terminalHandle, task, dispatch, candidate },
        orchestrationRequestId: 'fixed-acceptance-id',
        orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION,
        orchestrationCompatibilityEvidence: proof
      }
      expect(await dispatcher.dispatch(request)).toHaveProperty('ok', true)
      expect(await dispatcher.dispatch(request)).toHaveProperty('result.mutation.replayed', true)
      if (kind === 'generation') {
        db.db
          .prepare('UPDATE runs SET consumer_generation = consumer_generation + 1 WHERE id = ?')
          .run(run)
      }
      if (kind === 'policy') {
        await approve('process.exit(0)')
      }
      if (kind === 'task') {
        db.updateTaskStatus(task, 'failed')
      }
      if (kind === 'source-head') {
        git('commit', '--allow-empty', '-qm', 'advance')
      }
      if (kind === 'identity') {
        request.orchestrationCompatibilityEvidence = { ...proof, launchToken: 'invalid' }
      }
      expect(await dispatcher.dispatch(request)).toHaveProperty('ok', false)
    }
  )
  it('invalidated checking still occupies the Task until its real verifier exits', async () => {
    const marker = join(root, 'occupancy')
    await approve(
      `require('node:fs').writeFileSync(${JSON.stringify(marker)},'ready');setTimeout(()=>{},600)`
    )
    const dispatcher = new RpcDispatcher({ runtime, methods: ORCHESTRATION_METHODS })
    const request = {
      id: 'inflight',
      authToken: '',
      method: 'orchestration.kernelAccept',
      params: { run, from: proof.terminalHandle, task, dispatch, candidate },
      orchestrationRequestId: 'same-inflight',
      orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION,
      orchestrationCompatibilityEvidence: proof
    }
    const first = dispatcher.dispatch(request)
    for (let count = 0; count < 200; count++) {
      try {
        await access(marker)
        break
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }
    expect(await readFile(marker, 'utf8')).toBe('ready')
    const waiting = dispatcher.dispatch(request)
    await approve('process.exit(0)')
    expect(stored()).toMatchObject({ status: 'checking', invalidated: 1 })
    await expect(accept()).rejects.toMatchObject({ code: 'kernel_acceptance_busy' })
    expect(await first).toHaveProperty('ok', false)
    expect(await waiting).toHaveProperty('ok', false)
    expect(stored()).toMatchObject({ status: 'rejected' })
    expect(await accept()).toHaveProperty('acceptance.status', 'accepted')
  })
  it('does not reapprove or replay an obsolete approval receipt', async () => {
    const dispatcher = new RpcDispatcher({ runtime, methods: ORCHESTRATION_METHODS })
    const request = {
      id: 'approval',
      authToken: '',
      method: 'orchestration.kernelApproveAcceptance',
      params: {
        run,
        from: proof.terminalHandle,
        checks: { [task]: { source: 'process.exit(0)', timeoutMs: 1000 } }
      },
      orchestrationRequestId: 'same-approval',
      orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION,
      orchestrationCompatibilityEvidence: proof
    }
    const first = await dispatcher.dispatch(request)
    expect(first).toHaveProperty('ok', true)
    expect(await dispatcher.dispatch(request)).toHaveProperty('result.mutation.replayed', true)
    await approve('process.exit(8)')
    expect(await dispatcher.dispatch(request)).toHaveProperty('ok', false)
  })
  it('retains a distinct accepted record across SQLite close/reopen', async () => {
    await approve()
    await accept()
    const before = stored()
    db.close()
    db = new OrchestrationDb(join(root, 'orchestration.db'))
    runtime.setOrchestrationDb(db)
    expect(stored()).toEqual(before)
    expect(await accept()).toHaveProperty('duplicate', true)
  })
  it.each(['null', '[]', '1', '{}', '{"repo":1}', '{bad'])(
    'rejects malformed persisted start options %s with a domain error',
    async (options) => {
      await approve()
      db.db
        .prepare('UPDATE worker_dispatches SET start_options = ? WHERE dispatch_id = ?')
        .run(options, dispatch)
      await expect(accept()).rejects.toMatchObject({ code: 'kernel_dispatch_mismatch' })
    }
  )
  it.each([null, [], 1, {}, { acceptance: null }])(
    'parses malformed cached replies %#',
    async (reply) => {
      await approve()
      const request = {
        id: 'bad-replay',
        authToken: '',
        method: 'orchestration.kernelAccept',
        params: { run, from: proof.terminalHandle, task, dispatch, candidate },
        orchestrationCompatibilityEvidence: proof
      }
      await expect(revalidateKernelAcceptanceReply(runtime, request, reply)).rejects.toMatchObject({
        code: 'kernel_acceptance_invalid'
      })
    }
  )
  it('uses the exact request schema for both initial calls and cached reply validation', async () => {
    const params = { run, from: proof.terminalHandle, task, dispatch, candidate, testsPassed: true }
    const method = ORCHESTRATION_METHODS.find(
      (entry) => entry.name === 'orchestration.kernelAccept'
    )!
    expect(() => method.params!.parse(params)).toThrow()
    await expect(
      revalidateKernelAcceptanceReply(
        runtime,
        { id: 'bad', authToken: '', method: method.name, params },
        {}
      )
    ).rejects.toMatchObject({ code: 'kernel_acceptance_invalid' })
  })
})
