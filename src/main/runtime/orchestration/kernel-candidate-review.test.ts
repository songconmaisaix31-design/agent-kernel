import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reviewKernelCandidate, type KernelCandidateReviewInput } from './kernel-candidate-review'
import type { Plan } from './kernel-plan'

// Fixture writes stay in this test's fresh directory; review uses the real shared Git runner.
describe('Kernel candidate scope review with real Git', () => {
  let root: string, repo: string, base: string
  let plan: Plan
  async function git(args: string[], stdin?: string): Promise<string> {
    return new Promise((done, fail) => {
      const child = execFile(
        'git',
        ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args],
        {
          cwd: repo,
          maxBuffer: 8 * 1024 * 1024,
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: 'Kernel Test',
            GIT_AUTHOR_EMAIL: 'kernel@example.invalid',
            GIT_COMMITTER_NAME: 'Kernel Test',
            GIT_COMMITTER_EMAIL: 'kernel@example.invalid',
            GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
            GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z'
          }
        },
        (error, stdout) => (error ? fail(error) : done(stdout))
      )
      child.stdin!.end(stdin)
    })
  }
  async function blob(content: string) {
    return (await git(['hash-object', '-w', '--stdin'], content)).trim()
  }
  async function entry(path: string, content: string, mode = '100644') {
    const oid = mode === '160000' ? base : await blob(content)
    await git(['update-index', '-z', '--index-info'], `${mode} ${oid}\t${path}\0`)
  }
  async function remove(path: string) {
    await git(['update-index', '-z', '--index-info'], `0 ${'0'.repeat(40)}\t${path}\0`)
  }
  async function commit(parent?: string) {
    const tree = (await git(['write-tree'])).trim()
    return (
      await git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', 'fixed fixture'])
    ).trim()
  }
  function review(candidateCommit: string, overrides: Partial<KernelCandidateReviewInput> = {}) {
    return reviewKernelCandidate({
      plan,
      taskKey: 'one',
      repoPath: repo,
      baseCommit: base,
      candidateCommit,
      executionHost: 'native',
      ...overrides
    })
  }
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-candidate-review-'))
    repo = join(root, 'repo with spaces & punctuation')
    await mkdir(repo)
    await git(['init', '--quiet'])
    await entry('src/file.txt', 'original source\n')
    await entry('outside.txt', 'private source with unique bytes\n')
    base = await commit()
    plan = {
      schemaVersion: 1,
      objective: 'Scoped edit',
      nonGoals: [],
      baseCommit: base,
      tasks: [
        {
          key: 'one',
          owner: 'B',
          writePaths: ['src/'],
          dependsOn: [],
          acceptance: ['Not executed'],
          escalateWhen: []
        }
      ]
    }
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    // Only the mkdtemp root created by this test is removed.
    if (root) {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })

  it.each(['src/', 'src/file.txt'])(
    'checks a fixed commit with approved path %s without touching the index',
    async (allowed) => {
      plan.tasks[0].writePaths = [allowed]
      await entry('src/file.txt', 'approved implementation\n')
      const candidate = await commit(base)
      const index = await readFile(join(repo, '.git', 'index'))
      expect(await review(candidate)).toEqual({
        status: 'scope-checked',
        baseCommit: base,
        candidateCommit: candidate,
        paths: ['src/file.txt']
      })
      expect(await readFile(join(repo, '.git', 'index'))).toEqual(index)
    }
  )
  it('ignores uncommitted working files and uses the explicit commit rather than HEAD', async () => {
    await entry('src/file.txt', 'approved implementation\n')
    const candidate = await commit(base)
    await writeFile(join(repo, 'outside.txt'), 'uncommitted')
    expect(await review(candidate)).toMatchObject({ status: 'scope-checked' })
  })
  it.each(['src-other/file.txt', 'outside.txt', 'src/file.txt.bak'])(
    'rejects changed path outside exact directory/file boundaries: %s',
    async (path) => {
      plan.tasks[0].writePaths = path === 'src/file.txt.bak' ? ['src/file.txt'] : ['src/']
      await entry(path, 'out of scope content')
      expect(await review(await commit(base))).toMatchObject({
        status: 'rejected',
        code: 'out_of_scope'
      })
    }
  )
  it.each(['src/file.txt', 'outside.txt'])('checks deleted old path: %s', async (path) => {
    await remove(path)
    expect(await review(await commit(base))).toMatchObject({
      status: path.startsWith('src/') ? 'scope-checked' : 'rejected'
    })
  })
  it.each([
    ['src/file.txt', 'src/renamed.txt', true],
    ['outside.txt', 'src/moved.txt', false],
    ['src/file.txt', 'outside-moved.txt', false]
  ] as const)('checks both rename paths %s -> %s', async (from, to, allowed) => {
    const content =
      from === 'outside.txt' ? 'private source with unique bytes\n' : 'original source\n'
    await remove(from)
    await entry(to, content)
    const result = await review(await commit(base))
    expect(result.status).toBe(allowed ? 'scope-checked' : 'rejected')
    if (result.status === 'scope-checked') {
      expect(result.paths).toEqual([from, to].sort())
    }
  })
  it.each([
    ['src/file.txt', 'src/copied.txt', true],
    ['outside.txt', 'src/copied.txt', true],
    ['src/file.txt', 'outside-copy.txt', false]
  ] as const)('checks only the changed copy destination %s -> %s', async (from, to, allowed) => {
    await entry(
      to,
      from === 'outside.txt' ? 'private source with unique bytes\n' : 'original source\n'
    )
    expect(await review(await commit(base))).toMatchObject(
      allowed
        ? { status: 'scope-checked', paths: [to] }
        : { status: 'rejected', code: 'out_of_scope' }
    )
  })
  it.each(['none', 'repository', 'environment'])(
    'scope semantics: unchanged outside copy source needs no write grant with %s rename configuration',
    async (configuration) => {
      await entry('src/copied.txt', 'private source with unique bytes\n')
      const candidate = await commit(base)
      if (configuration === 'repository') {
        await git(['config', 'diff.renames', 'copies'])
      }
      if (configuration === 'environment') {
        vi.stubEnv('GIT_CONFIG_COUNT', '1')
        vi.stubEnv('GIT_CONFIG_KEY_0', 'diff.renames')
        vi.stubEnv('GIT_CONFIG_VALUE_0', 'copies')
      }
      const result = await review(candidate)
      expect(result, JSON.stringify(result)).toEqual({
        status: 'scope-checked',
        baseCommit: base,
        candidateCommit: candidate,
        paths: ['src/copied.txt']
      })
    }
  )
  it.each(['modify', 'delete'])(
    'scope semantics: copying still rejects an outside source that also changes: %s',
    async (operation) => {
      await entry('src/copied.txt', 'private source with unique bytes\n')
      await (operation === 'modify'
        ? entry('outside.txt', 'changed outside source')
        : remove('outside.txt'))
      expect(await review(await commit(base))).toMatchObject({
        status: 'rejected',
        code: 'out_of_scope'
      })
    }
  )
  it.each([
    ['src/node', 'src/node/child.txt', 'src/', true],
    ['src/node/child.txt', 'src/node', 'src/', true],
    ['outside', 'outside/child.txt', 'outside/', false],
    ['outside/child.txt', 'outside', 'outside/', false]
  ] as const)(
    'scope semantics: checks old and new tree shapes separately for %s -> %s',
    async (oldPath, newPath, allowedPath, allowed) => {
      await entry(oldPath, 'shape transition content')
      base = await commit(base)
      plan.baseCommit = base
      plan.tasks[0].writePaths = [allowedPath]
      await remove(oldPath)
      await entry(newPath, 'shape transition content')
      const candidate = await commit(base)
      const result = await review(candidate)
      expect(result, JSON.stringify(result)).toMatchObject(
        allowed
          ? { status: 'scope-checked', paths: [oldPath, newPath].sort() }
          : { status: 'rejected', code: 'out_of_scope' }
      )
    }
  )
  it.each(['120000', '160000', '100755'])('rejects new special mode %s', async (mode) => {
    await entry('src/special', '../outside.txt', mode)
    expect(await review(await commit(base))).toMatchObject({
      status: 'rejected',
      code: 'unsupported_mode'
    })
  })
  it.each(['120000', '160000', '100755'])(
    'rejects deletion of old special mode %s',
    async (mode) => {
      await entry('src/special', '../outside.txt', mode)
      base = await commit(base)
      plan.baseCommit = base
      await remove('src/special')
      expect(await review(await commit(base))).toMatchObject({
        status: 'rejected',
        code: 'unsupported_mode'
      })
    }
  )
  it.each(['100755', '120000', '160000'])(
    'rejects mode/type changes on an approved path: %s',
    async (mode) => {
      await entry('src/file.txt', 'original source\n', mode)
      expect(await review(await commit(base))).toMatchObject({ status: 'rejected' })
    }
  )
  it.each([
    'src/tab\tname',
    'src/new\nline',
    'src/back\\slash',
    'src/é.txt',
    'src/name.',
    'src/name ',
    'src/CON.txt',
    'src/a:b'
  ])('rejects special Git path %j without checking it out', async (path) => {
    // Windows update-index silently drops some uncheckoutable names; mktree preserves real Git bytes.
    const original = await blob('original source\n')
    const special = await blob('special path content')
    const srcTree = (
      await git(
        ['mktree', '-z'],
        `100644 blob ${original}\tfile.txt\0` + `100644 blob ${special}\t${path.slice(4)}\0`
      )
    ).trim()
    const outside = await blob('private source with unique bytes\n')
    const tree = (
      await git(
        ['mktree', '-z'],
        `040000 tree ${srcTree}\tsrc\0` + `100644 blob ${outside}\toutside.txt\0`
      )
    ).trim()
    const candidate = (await git(['commit-tree', tree, '-p', base, '-m', 'special path'])).trim()
    expect(await git(['ls-tree', '-r', '-z', candidate])).toContain(path)
    expect(await review(candidate)).toMatchObject({
      status: 'rejected',
      code: 'unsafe_path'
    })
  })
  it('rejects casing aliases against an unchanged tree path', async () => {
    await entry('src/FILE.txt', 'case alias')
    expect(await review(await commit(base))).toMatchObject({
      status: 'rejected',
      code: 'unsafe_path'
    })
  })
  it('rejects a case-only rename even when the directory is approved', async () => {
    await remove('src/file.txt')
    await entry('src/FILE.txt', 'original source\n')
    expect(await review(await commit(base))).toMatchObject({
      status: 'rejected',
      code: 'unsafe_path'
    })
  })
  it('rejects empty diffs including a new empty commit', async () => {
    expect(await review(base)).toMatchObject({ status: 'rejected', code: 'empty_diff' })
    expect(await review(await commit(base))).toMatchObject({
      status: 'rejected',
      code: 'empty_diff'
    })
  })
  it('rejects an unrelated branch root and a different approved baseline', async () => {
    await entry('src/file.txt', 'independent root')
    const candidate = await commit()
    expect(await review(candidate)).toMatchObject({ status: 'rejected', code: 'git_error' })
    expect(await review(candidate, { baseCommit: candidate })).toMatchObject({
      status: 'rejected',
      code: 'base_mismatch'
    })
  })
  it.each([
    'HEAD',
    'abcd',
    '--output=owned',
    'HEAD; echo owned',
    `${'a'.repeat(40)}\n`,
    '0'.repeat(40)
  ])('rejects non-fixed or injected commit argument %j', async (candidate) => {
    expect(await review(candidate)).toMatchObject({ status: 'rejected', code: 'invalid_commit' })
  })
  it('rejects missing objects and existing non-commit objects', async () => {
    expect(await review('f'.repeat(40))).toMatchObject({ status: 'rejected', code: 'git_error' })
    expect(await review(await blob('not a commit'))).toMatchObject({
      status: 'rejected',
      code: 'invalid_commit'
    })
  })
  it('rejects missing changed blobs rather than certifying a tree-only diff', async () => {
    await git(['update-index', '--add', '--cacheinfo', '100644', 'f'.repeat(40), 'src/missing'])
    const tree = (await git(['write-tree', '--missing-ok'])).trim()
    const candidate = (await git(['commit-tree', tree, '-p', base, '-m', 'missing blob'])).trim()
    expect(await review(candidate)).toMatchObject({ status: 'rejected' })
  })
  it('requires a valid Plan and a known independent task', async () => {
    const candidate = await commit(base)
    expect(
      await review(candidate, { plan: { ...plan, schemaVersion: 2 } as unknown as Plan })
    ).toMatchObject({ status: 'rejected', code: 'invalid_plan' })
    expect(await review(candidate, { taskKey: 'unknown' })).toMatchObject({
      status: 'rejected',
      code: 'unknown_task'
    })
    plan.tasks.push({ ...plan.tasks[0], key: 'dependency', writePaths: ['other/'] })
    plan.tasks[0].dependsOn = ['dependency']
    expect(await review(candidate)).toMatchObject({
      status: 'rejected',
      code: 'unsupported_dependency'
    })
  })
  it.each(['ssh', 'wsl'] as const)(
    'refuses %s without local fallback even for a valid local repo',
    async (executionHost) => {
      expect(await review(base, { executionHost })).toMatchObject({
        status: 'rejected',
        code: 'unsupported_host'
      })
    }
  )
  it.each([
    '//wsl.localhost/Ubuntu/repo',
    '\\\\wsl$\\Ubuntu\\repo',
    '//server/share/repo',
    'relative/repo',
    '-C another',
    '/tmp/repo\n'
  ])('rejects nonlocal, relative or control-containing repo path %j', async (repoPath) => {
    expect(await review(base, { repoPath })).toMatchObject({
      status: 'rejected',
      code: 'unsupported_host'
    })
  })
  it('rejects a native label in a WSL process', async () => {
    vi.stubEnv('WSL_DISTRO_NAME', 'fixture-only')
    expect(await review(base)).toMatchObject({ status: 'rejected', code: 'unsupported_host' })
  })
  it('rejects an ordinary directory without Git and an absent repository', async () => {
    expect(await review(base, { repoPath: root })).toMatchObject({
      status: 'rejected',
      code: 'git_error'
    })
    expect(await review(base, { repoPath: join(root, 'missing') })).toMatchObject({
      status: 'rejected',
      code: 'git_error'
    })
  })
  it.each(['shallow', 'info/grafts'])('refuses altered ancestry metadata %s', async (file) => {
    await writeFile(join(repo, '.git', file), `${base}\n`)
    expect(await review(base)).toMatchObject({ status: 'rejected', code: 'unsupported_repository' })
  })
  it('ignores replacement objects and inherited Git repository overrides', async () => {
    await entry('outside.txt', 'unauthorized')
    const candidate = await commit(base)
    await git(['read-tree', base])
    await entry('src/file.txt', 'approved substitute')
    const substitute = await commit(base)
    await git(['replace', candidate, substitute])
    vi.stubEnv('GIT_DIR', join(root, 'wrong-repository'))
    expect(await review(candidate)).toMatchObject({ status: 'rejected', code: 'out_of_scope' })
  })
  it('rejects partial clones before object reads could fetch', async () => {
    await git(['config', 'remote.origin.promisor', 'true'])
    await git(['config', 'remote.origin.url', 'ext::must-not-execute'])
    expect(await review(base)).toMatchObject({ status: 'rejected', code: 'unsupported_repository' })
  })
  it('does not execute configured diff, textconv or hooks', async () => {
    const marker = join(root, 'executed')
    const hook = join(root, 'untrusted-hook')
    await writeFile(hook, `#!/bin/sh\necho executed > '${marker.replace(/\\/g, '/')}'\nexit 1\n`)
    await git(['config', 'diff.external', hook])
    await git(['config', 'diff.evil.command', hook])
    await git(['config', 'diff.evil.textconv', hook])
    await git(['config', 'core.hooksPath', root])
    await writeFile(join(repo, '.git', 'info', 'attributes'), '* diff=evil\n')
    await entry('src/file.txt', 'approved implementation')
    expect(await review(await commit(base))).toMatchObject({ status: 'scope-checked' })
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('reviews a real native linked worktree without requiring its HEAD as the candidate', async () => {
    await entry('src/file.txt', 'linked worktree candidate')
    const candidate = await commit(base)
    const linked = join(root, 'linked worktree')
    await git(['worktree', 'add', '--detach', linked, base])
    expect(await review(candidate, { repoPath: linked })).toMatchObject({ status: 'scope-checked' })
  })
  it('rejects a linked-worktree pointer to a remote path before Git routing', async () => {
    const linked = join(root, 'remote pointer')
    await mkdir(linked)
    await writeFile(join(linked, '.git'), 'gitdir: //wsl.localhost/Ubuntu/gitdir\n')
    expect(await review(base, { repoPath: linked })).toMatchObject({
      status: 'rejected',
      code: 'unsupported_host'
    })
  })
  it('rejects malformed repository config as a Git error', async () => {
    await writeFile(join(repo, '.git', 'config'), '[invalid')
    expect(await review(base)).toMatchObject({ status: 'rejected', code: 'git_error' })
  })
  it('rejects oversized real tree output instead of a truncated successful diff', async () => {
    const oid = await blob('large tree fixture')
    const segment = 'x'.repeat(200)
    const records = Array.from(
      { length: 12000 },
      (_, i) => `100644 ${oid}\tsrc/${segment}${i}\0`
    ).join('')
    await git(['update-index', '-z', '--index-info'], records)
    expect(await review(await commit(base))).toMatchObject({
      status: 'rejected',
      code: 'git_error'
    })
  }, 30_000)
})
