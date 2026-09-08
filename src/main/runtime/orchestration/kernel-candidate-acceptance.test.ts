import { deflateSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import {
  chmod,
  mkdtemp,
  mkdir,
  symlink,
  realpath,
  writeFile,
  rm,
  access,
  readFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCandidateSnapshot } from './kernel-candidate-snapshot'
import { AcceptanceChecks } from './kernel-acceptance-policy'
import type { Plan } from './kernel-plan'

describe('Kernel acceptance real Git materialization', () => {
  let root: string, candidate: string, plan: Plan
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-acceptance-git-'))
    git('init', '-q')
    git('config', 'user.name', 'Test')
    git('config', 'user.email', 'test@example.invalid')
    await writeFile(join(root, 'file.txt'), Buffer.from([0, 13, 10, 255]))
    git('add', '.')
    git('commit', '-qm', 'candidate')
    candidate = git('rev-parse', 'HEAD')
    plan = {
      schemaVersion: 1,
      objective: 'Test',
      nonGoals: [],
      baseCommit: candidate,
      tasks: [
        {
          key: 'task',
          owner: 'worker',
          spec: 'Check bytes',
          writePaths: ['file.txt'],
          dependsOn: [],
          acceptance: ['bytes'],
          escalateWhen: []
        }
      ]
    }
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })
  it('materializes exact raw bytes without checkout hooks and removes only its own detached worktree', async () => {
    const marker = join(root, 'hook-ran')
    await writeFile(
      join(root, '.git', 'hooks', 'post-checkout'),
      `#!/bin/sh\necho bad > '${marker.replaceAll('\\', '/')}'\n`,
      { mode: 0o755 }
    )
    const snapshot = await createCandidateSnapshot(root, candidate, plan)
    try {
      expect(snapshot.path).not.toBe(root)
      expect(await readFile(join(snapshot.path, 'file.txt'))).toEqual(Buffer.from([0, 13, 10, 255]))
      await snapshot.verify()
      await expect(access(marker)).rejects.toThrow()
    } finally {
      await snapshot.cleanup()
    }
    expect(git('rev-parse', 'HEAD')).toBe(candidate)
    expect(git('worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1)
  })

  it('canonicalizes a real system-temp directory alias before ownership cleanup', async () => {
    const target = join(root, 'real-temp'),
      alias = join(root, 'temp-alias')
    await mkdir(target)
    await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir')
    vi.stubEnv('TEMP', alias)
    vi.stubEnv('TMP', alias)
    vi.stubEnv('TMPDIR', alias)
    const snapshot = await createCandidateSnapshot(root, candidate, plan)
    expect(snapshot.path.startsWith(await realpath(target))).toBe(true)
    await snapshot.verify()
    await snapshot.cleanup()
    expect(git('rev-parse', 'HEAD')).toBe(candidate)
  })

  it('refuses loose blob bytes that no longer match the fixed Git object ID', async () => {
    const oid = git('rev-parse', `${candidate}:file.txt`)
    const object = join(root, '.git', 'objects', oid.slice(0, 2), oid.slice(2))
    await chmod(object, 0o644)
    await writeFile(object, deflateSync(Buffer.from('blob 6\0forged')))
    expect(git('cat-file', 'blob', oid)).toBe('forged')
    await expect(createCandidateSnapshot(root, candidate, plan)).rejects.toMatchObject({
      code: 'kernel_snapshot_unsupported'
    })
  })
  it.each(['smudge', 'process'])(
    'rejects configured %s filter before invoking it',
    async (kind) => {
      const marker = join(root, 'filter-ran')
      git('config', `filter.evil.${kind}`, `echo bad > "${marker}"`)
      await expect(createCandidateSnapshot(root, candidate, plan)).rejects.toMatchObject({
        code: 'kernel_snapshot_unsupported'
      })
      await expect(access(marker)).rejects.toThrow()
      expect(git('worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1)
    }
  )
  it.each(['core.sparseCheckout', 'extensions.worktreeConfig'])(
    'rejects %s before allocation',
    async (key) => {
      git('config', key, 'true')
      await expect(createCandidateSnapshot(root, candidate, plan)).rejects.toThrow()
    }
  )
  it('rejects an unchanged executable file in the complete tree', async () => {
    git('update-index', '--chmod=+x', 'file.txt')
    git('commit', '-qm', 'mode')
    candidate = git('rev-parse', 'HEAD')
    await expect(createCandidateSnapshot(root, candidate, plan)).rejects.toMatchObject({
      code: 'kernel_snapshot_unsupported'
    })
  })
  it.each(['modify', 'delete', 'add'])('detects actual snapshot %s', async (operation) => {
    const snapshot = await createCandidateSnapshot(root, candidate, plan)
    try {
      await (operation === 'delete'
        ? rm(join(snapshot.path, 'file.txt'))
        : writeFile(join(snapshot.path, operation === 'add' ? 'extra' : 'file.txt'), 'changed'))
      await expect(snapshot.verify()).rejects.toMatchObject({ code: 'kernel_candidate_changed' })
    } finally {
      await snapshot.cleanup()
    }
  })
})
describe('Kernel trusted policy bounds', () => {
  it.each([
    {},
    { task: { source: '', timeoutMs: 100 } },
    { task: { source: 'x', timeoutMs: 0 } },
    { task: { source: 'x', timeoutMs: 30_001 } },
    { task: { source: 'x'.repeat(32_769), timeoutMs: 10 } },
    { task: { source: 'x', timeoutMs: 10, shell: true } },
    Object.fromEntries(
      Array.from({ length: 17 }, (_, i) => [`t${i}`, { source: 'x', timeoutMs: 10 }])
    ),
    {
      a: { source: 'x', timeoutMs: 30_000 },
      b: { source: 'x', timeoutMs: 30_000 },
      c: { source: 'x', timeoutMs: 1 }
    }
  ])('rejects malformed or unbounded policy %#', (value) => {
    expect(AcceptanceChecks.safeParse(value).success).toBe(false)
  })
  it('preserves approved source bytes', () => {
    const input = { task: { source: '  process.exit(0)\r\n', timeoutMs: 100 } }
    expect(AcceptanceChecks.parse(input)).toEqual(input)
  })
})
