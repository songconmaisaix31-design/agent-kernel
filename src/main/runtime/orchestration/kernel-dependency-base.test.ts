import { addWorktree } from '../../git/worktree'
import { prepareKernelWorkerStart } from '../rpc/methods/orchestration-kernel-admission'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../orca-runtime'
import { OrchestrationDb } from './db'
import { ORCHESTRATION_METHODS } from '../rpc/methods/orchestration'
import { revalidateKernelAcceptanceReply } from '../rpc/methods/orchestration-kernel-acceptance'
import type { RpcContext } from '../rpc/core'
import type { Plan } from './kernel-plan'
import { readKernelRunConfig } from './kernel-run-config'
import { kernelDependencyBase } from './kernel-dependency-base'

// Real handlers, SQLite, Orca addWorktree and verifier processes; runtime resource observations and terminal/Agent are substitutes.
describe('Kernel single accepted dependency execution base', () => {
  const pane = 'tab_coord:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const proof = { terminalHandle: 'term_coord', paneKey: pane, launchToken: 'dependency-proof' }
  let root: string, repo: string, run: string, parent: string, child: string
  let parentDispatch: string, parentCandidate: string, parentPath: string
  let db: OrchestrationDb, runtime: OrcaRuntimeService, ctx: RpcContext, plan: Plan
  const worktrees = new Map<string, { id: string; repoId: string; path: string }>()
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim()
  const call = async (name: string, input: Record<string, unknown>) => {
    const method = ORCHESTRATION_METHODS.find((entry) => entry.name === `orchestration.${name}`)!
    return method.handler(method.params!.parse({ run, from: proof.terminalHandle, ...input }), ctx)
  }
  const checks = () => ({
    [parent]: {
      source:
        "require('node:assert/strict').equal(require('node:fs').readFileSync('parent.txt','utf8'),'parent accepted')",
      timeoutMs: 3000
    },
    [child]: {
      source:
        "const fs=require('node:fs'),assert=require('node:assert/strict');assert.equal(fs.readFileSync('parent.txt','utf8'),'parent accepted');assert.equal(fs.readFileSync('child.txt','utf8'),'child accepted')",
      timeoutMs: 3000
    }
  })
  const start = (task = child, extra: Record<string, unknown> = {}) =>
    call('workerStart', {
      task,
      worktree: 'new-top-level',
      name: `worker-${task}`,
      agent: 'codex',
      setup: 'skip',
      ...extra
    }) as Promise<{ dispatchId: string; state: string; kernelBase?: { baseCommit: string } }>
  const settle = (task: string, dispatch: string) =>
    db.settleWorkerReport({
      taskId: task,
      dispatchId: dispatch,
      outcome: 'succeeded',
      result: 'native completed is not acceptance'
    })
  const accept = (task: string, dispatch: string, candidate: string) =>
    call('kernelAccept', { task, dispatch, candidate })
  const stored = (task = child) => JSON.parse(db.getTask(task)?.kernel_acceptance ?? 'null')
  const commit = async (path: string, file: string, body: string) => {
    await writeFile(join(path, file), body)
    git(path, 'add', '--', file)
    git(path, 'commit', '-qm', file)
    return git(path, 'rev-parse', 'HEAD')
  }
  async function childCandidate() {
    const started = await start()
    expect(started.state).toBe('ready')
    const worker = db.getWorkerDispatch(started.dispatchId)!
    const path = worktrees.get(worker.worktree_id!)!.path
    const candidate = await commit(path, 'child.txt', 'child accepted')
    settle(child, started.dispatchId)
    return { ...started, path, candidate }
  }
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-dependency-'))
    repo = join(root, 'repo')
    await mkdir(repo)
    git(repo, 'init', '-q')
    git(repo, 'config', 'user.email', 'test@example.invalid')
    git(repo, 'config', 'user.name', 'Test')
    const base = await commit(repo, 'seed.txt', 'base')
    db = new OrchestrationDb(join(root, 'orchestration.db'))
    runtime = new OrcaRuntimeService()
    runtime.setOrchestrationDb(db)
    run = db.createRun({
      objective: 'Dependency',
      coordinatorHandle: proof.terminalHandle,
      coordinatorPaneKey: pane
    }).id
    parent = db.createTask({ runId: run, spec: 'Parent' }).id
    child = db.createTask({ runId: run, spec: 'Child', deps: [parent] }).id
    plan = {
      schemaVersion: 1,
      objective: 'Dependency',
      nonGoals: [],
      baseCommit: base,
      tasks: [
        {
          key: parent,
          owner: 'parent',
          spec: 'Write parent.txt',
          writePaths: ['parent.txt'],
          dependsOn: [],
          acceptance: ['parent bytes'],
          escalateWhen: []
        },
        {
          key: child,
          owner: 'child',
          spec: 'Write child.txt using parent.txt',
          writePaths: ['child.txt'],
          dependsOn: [parent],
          acceptance: ['both bytes'],
          escalateWhen: []
        }
      ]
    }
    worktrees.clear()
    worktrees.set('coord', { id: 'coord', repoId: 'repo', path: repo })
    ctx = { runtime, orchestrationCompatibilityEvidence: proof }
    vi.spyOn(runtime, 'getTerminalPaneKey').mockImplementation((handle) =>
      handle === proof.terminalHandle ? pane : `tab_${handle}:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`
    )
    vi.spyOn(runtime, 'getOrchestrationDispatchAuthority').mockImplementation(
      (handle) =>
        ({
          terminalHandle: handle,
          paneKey: runtime.getTerminalPaneKey(handle),
          processIncarnation: `incarnation-${handle}`,
          ptyId: `pty-${handle}`,
          worktreeId: 'coord',
          hostScope: { kind: 'local' },
          launchTokenHash: createHash('sha256').update(proof.launchToken).digest('hex')
        }) as never
    )
    vi.spyOn(runtime, 'validateOrchestrationAgentLauncher').mockImplementation(() => {})
    vi.spyOn(runtime, 'showTerminal').mockResolvedValue({
      handle: proof.terminalHandle,
      worktreeId: 'coord'
    } as never)
    vi.spyOn(runtime, 'showRepo').mockResolvedValue({
      id: 'repo',
      kind: 'git',
      path: repo,
      executionHostId: 'local'
    } as never)
    vi.spyOn(runtime, 'showManagedWorktree').mockImplementation(async (selector) => {
      const item = worktrees.get(selector.replace(/^id:/, ''))
      if (!item) {
        throw new Error('Unknown test worktree')
      }
      return item as never
    })
    vi.spyOn(runtime, 'createManagedWorktree').mockImplementation(async (args) => {
      const id = `created-${worktrees.size}`,
        path = join(root, id)
      await addWorktree(repo, path, id, args.baseBranch)
      const worktree = { id, repoId: 'repo', path }
      worktrees.set(id, worktree)
      return { worktree, startupTerminal: { spawned: true, handle: `term_${id}` } } as never
    })
    vi.spyOn(runtime, 'listTerminals').mockImplementation(
      async (selector) =>
        ({
          terminals: [{ handle: `term_${selector!.replace(/^id:/, '')}` }],
          totalCount: 1,
          truncated: false
        }) as never
    )
    vi.spyOn(runtime, 'waitForTerminal').mockResolvedValue({
      satisfied: true,
      status: 'running'
    } as never)
    vi.spyOn(runtime, 'getTerminalOrchestrationCliCommand').mockReturnValue('orca')
    vi.spyOn(runtime, 'sendTerminalAgentPrompt').mockResolvedValue({ accepted: true } as never)
    await call('runUse', { id: run, kernel: { repoId: 'repo', plan } })
    await call('kernelApproveAcceptance', { checks: checks() })
    parentDispatch = (await start(parent)).dispatchId
    parentPath = worktrees.get(db.getWorkerDispatch(parentDispatch)!.worktree_id!)!.path
    parentCandidate = await commit(parentPath, 'parent.txt', 'parent accepted')
    settle(parent, parentDispatch)
    await accept(parent, parentDispatch, parentCandidate)
  })
  afterEach(async () => {
    db?.close()
    vi.restoreAllMocks()
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })
  it('starts at actual accepted parent SHA, accepts only own changes, and revalidates replay', async () => {
    const started = await start()
    expect(started.kernelBase?.baseCommit).toBe(parentCandidate)
    const worker = db.getWorkerDispatch(started.dispatchId)!,
      path = worktrees.get(worker.worktree_id!)!.path
    expect(git(path, 'rev-parse', 'HEAD')).toBe(parentCandidate)
    console.info(
      JSON.stringify({
        approvedBase: plan.baseCommit,
        parentCandidate,
        actualChildBase: git(path, 'rev-parse', 'HEAD')
      })
    )
    expect(await readFile(join(path, 'parent.txt'), 'utf8')).toBe('parent accepted')
    expect(JSON.parse(worker.start_options).kernelBase.dependency).toMatchObject({
      task: parent,
      dispatch: parentDispatch,
      candidate: parentCandidate,
      token: stored(parent).token
    })
    expect(vi.mocked(runtime.sendTerminalAgentPrompt).mock.calls.at(-1)![1]).toContain(
      `actual execution base (supersedes the Plan base for this Task checkout): ${parentCandidate}`
    )
    const candidate = await commit(path, 'child.txt', 'child accepted')
    settle(child, started.dispatchId)
    const reply = await accept(child, started.dispatchId, candidate)
    console.info(
      JSON.stringify({
        childCandidate: candidate,
        accepted: stored().status,
        paths: stored().paths
      })
    )
    expect(reply).toMatchObject({
      acceptance: {
        status: 'accepted',
        paths: ['child.txt'],
        kernelBase: { baseCommit: parentCandidate }
      }
    })
    await revalidateKernelAcceptanceReply(
      runtime,
      {
        method: 'orchestration.kernelAccept',
        params: {
          run,
          from: proof.terminalHandle,
          task: child,
          dispatch: started.dispatchId,
          candidate
        },
        orchestrationCompatibilityEvidence: proof
      } as never,
      reply
    )
    expect(await accept(child, started.dispatchId, candidate)).toMatchObject({ duplicate: true })
  })
  it.each([
    'completed',
    'scope-only',
    'wrong-task',
    'wrong-run',
    'wrong-dispatch',
    'stale-policy',
    'parent-head',
    'parent-start',
    'wrong-location',
    'wrong-owner'
  ])('rejects %s at entry without a child resource or attempt', async (kind) => {
    const receipt = stored(parent)
    if (kind === 'completed') {
      db.db.prepare('UPDATE tasks SET kernel_acceptance = NULL WHERE id = ?').run(parent)
    }
    if (kind === 'scope-only') {
      db.db
        .prepare('UPDATE tasks SET kernel_acceptance = ? WHERE id = ?')
        .run(JSON.stringify({ status: 'scope-checked' }), parent)
    }
    if (kind === 'wrong-task' || kind === 'wrong-dispatch' || kind === 'wrong-location') {
      receipt[
        kind === 'wrong-task' ? 'task' : kind === 'wrong-dispatch' ? 'dispatch' : 'location'
      ] = 'wrong'
      db.db
        .prepare('UPDATE tasks SET kernel_acceptance = ? WHERE id = ?')
        .run(JSON.stringify(receipt), parent)
    }
    if (kind === 'wrong-run') {
      db.db.prepare('UPDATE dispatch_contexts SET run_id = ? WHERE id = ?').run(
        db.createRun({
          objective: 'Other',
          coordinatorHandle: 'other',
          coordinatorPaneKey: 'other-pane'
        }).id,
        parentDispatch
      )
    }
    if (kind === 'stale-policy') {
      await call('kernelApproveAcceptance', { checks: checks() })
    }
    if (kind === 'parent-head') {
      await commit(parentPath, 'parent.txt', 'changed')
    }
    if (kind === 'parent-start') {
      db.db
        .prepare('UPDATE worker_dispatches SET start_options = ? WHERE dispatch_id = ?')
        .run('{}', parentDispatch)
    }
    if (kind === 'wrong-owner') {
      ctx.orchestrationCompatibilityEvidence = { ...proof, terminalHandle: 'term_forged' }
    }
    await expect(start()).rejects.toThrow()
    expect(runtime.createManagedWorktree).toHaveBeenCalledTimes(1)
    expect(runtime.sendTerminalAgentPrompt).toHaveBeenCalledTimes(1)
    expect(db.getDispatchContext(child)).toBeUndefined()
    expect(stored()).toBeNull()
  })
  it('refuses a request base instead of silently using a different checkout', async () => {
    await expect(start(child, { baseBranch: plan.baseCommit })).rejects.toMatchObject({
      code: 'kernel_start_mismatch'
    })
    expect(runtime.createManagedWorktree).toHaveBeenCalledTimes(1)
  })
  it('rechecks during asynchronous preparation before allocating a Dispatch', async () => {
    const original = vi.mocked(runtime.showTerminal).getMockImplementation()!
    vi.mocked(runtime.showTerminal).mockImplementation(async (...args) => {
      db.db.prepare('UPDATE tasks SET kernel_acceptance = NULL WHERE id = ?').run(parent)
      return original(...args)
    })
    await expect(start()).rejects.toThrow()
    expect(db.getDispatchContext(child)).toBeUndefined()
    expect(runtime.createManagedWorktree).toHaveBeenCalledTimes(1)
  })
  it('rechecks the selected receipt inside the native Dispatch transaction', async () => {
    const original = db.createStartingWorkerDispatch.bind(db)
    vi.spyOn(db, 'createStartingWorkerDispatch').mockImplementation((input) => {
      const receipt = stored(parent)
      receipt.token = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      db.db
        .prepare('UPDATE tasks SET kernel_acceptance = ? WHERE id = ?')
        .run(JSON.stringify(receipt), parent)
      return original(input)
    })
    await expect(start()).rejects.toMatchObject({ code: 'kernel_dependency_invalid' })
    expect(db.getDispatchContext(child)).toBeUndefined()
    expect(runtime.createManagedWorktree).toHaveBeenCalledTimes(1)
  })
  it.each(['parent-invalidated', 'wrong-created-base', 'final-parent-head', 'final-owner'])(
    'blocks body delivery after resource creation: %s',
    async (kind) => {
      if (kind === 'parent-invalidated' || kind === 'wrong-created-base') {
        const original = vi.mocked(runtime.createManagedWorktree).getMockImplementation()!
        vi.mocked(runtime.createManagedWorktree).mockImplementation(async (args) => {
          const result = await original(
            kind === 'wrong-created-base' ? { ...args, baseBranch: plan.baseCommit } : args
          )
          if (kind === 'parent-invalidated') {
            db.db.prepare('UPDATE tasks SET kernel_acceptance = NULL WHERE id = ?').run(parent)
          }
          return result
        })
      } else {
        vi.mocked(runtime.waitForTerminal).mockImplementation(async () => {
          if (kind === 'final-parent-head') {
            await commit(parentPath, 'parent.txt', 'changed')
          } else {
            ctx.orchestrationCompatibilityEvidence = { ...proof, terminalHandle: 'term_forged' }
          }
          if (kind === 'final-owner') {
            db.db
              .prepare('UPDATE runs SET consumer_generation = consumer_generation + 1 WHERE id = ?')
              .run(run)
          }
          return { satisfied: true, status: 'running' } as never
        })
      }
      const failed = await start()
      expect(failed.state).toBe('failed')
      expect(runtime.sendTerminalAgentPrompt).toHaveBeenCalledTimes(1)
      expect(runtime.createManagedWorktree).toHaveBeenCalledTimes(2)
      expect(db.getWorkerDispatch(failed.dispatchId)?.worktree_id).toBeTruthy()
      expect(db.db.prepare('SELECT COUNT(*) AS n FROM worker_dispatches').get()).toEqual({ n: 2 })
      expect(stored()).toBeNull()
    }
  )
  it('rejects genuine downstream modification of inherited parent paths', async () => {
    const next = await childCandidate()
    const candidate = await commit(next.path, 'parent.txt', 'unauthorized child edit')
    await expect(accept(child, next.dispatchId, candidate)).rejects.toMatchObject({
      code: 'out_of_scope'
    })
    expect(stored()?.status).not.toBe('accepted')
  })
  it.each(['policy', 'parent-receipt', 'parent-head'])(
    'invalidates downstream acceptance and cached success after %s changes',
    async (kind) => {
      const next = await childCandidate(),
        reply = await accept(child, next.dispatchId, next.candidate)
      if (kind === 'policy') {
        await call('kernelApproveAcceptance', { checks: checks() })
      }
      if (kind === 'parent-receipt') {
        db.db.prepare('UPDATE tasks SET kernel_acceptance = NULL WHERE id = ?').run(parent)
      }
      if (kind === 'parent-head') {
        await commit(parentPath, 'parent.txt', 'later')
      }
      await expect(accept(child, next.dispatchId, next.candidate)).rejects.toThrow()
      await expect(
        revalidateKernelAcceptanceReply(
          runtime,
          {
            method: 'orchestration.kernelAccept',
            params: {
              run,
              from: proof.terminalHandle,
              task: child,
              dispatch: next.dispatchId,
              candidate: next.candidate
            },
            orchestrationCompatibilityEvidence: proof
          } as never,
          reply
        )
      ).rejects.toThrow()
    }
  )
  it('requires a matching dependency snapshot in direct native DB admission', () => {
    expect(() =>
      db.createStartingWorkerDispatch({
        taskId: child,
        expectedKernelConfig: db.getRun(run)!.kernel_config,
        startOptions: { repo: 'id:repo', worktree: 'new-top-level', baseBranch: parentCandidate }
      })
    ).toThrow(/server-selected/)
    expect(db.getDispatchContext(child)).toBeUndefined()
  })
  it('retains a synchronous delivery check after the awaited Git boundary', async () => {
    const prepared = prepareKernelWorkerStart(
      runtime,
      run,
      {
        from: proof.terminalHandle,
        task: child,
        worktree: 'new-top-level',
        name: 'child',
        agent: 'codex'
      },
      'untrusted',
      proof
    )
    const finalCheck = await prepared.recheckBase()
    db.db.prepare('UPDATE tasks SET kernel_acceptance = NULL WHERE id = ?').run(parent)
    expect(finalCheck).toThrow(/accepted/)
    expect(runtime.sendTerminalAgentPrompt).toHaveBeenCalledTimes(1)
  })
  it('does not accept when parent binding changes during the real downstream verifier', async () => {
    const next = await childCandidate()
    const original = vi.mocked(runtime.showManagedWorktree).getMockImplementation()!
    let childReads = 0
    vi.mocked(runtime.showManagedWorktree).mockImplementation(async (selector) => {
      const result = await original(selector)
      if (result.path === next.path && ++childReads === 2) {
        db.db.prepare('UPDATE tasks SET kernel_acceptance = NULL WHERE id = ?').run(parent)
      }
      return result
    })
    await expect(accept(child, next.dispatchId, next.candidate)).rejects.toMatchObject({
      code: 'kernel_dependency_invalid'
    })
    expect(childReads).toBe(2)
    expect(stored()).toMatchObject({ status: 'rejected' })
  })
  it.each(['multiple', 'deep'])('explicitly rejects unsupported %s parent shape', (kind) => {
    const config = readKernelRunConfig(db.getRun(run)!)!
    if (kind === 'multiple') {
      config.plan.tasks[1].dependsOn.push(parent)
    } else {
      config.plan.tasks[0].dependsOn.push(child)
    }
    expect(() => kernelDependencyBase(db, db.getRun(run)!, config, child)).toThrow(/unsupported/)
  })
})
