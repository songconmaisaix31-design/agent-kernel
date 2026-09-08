import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, readdir, lstat, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve, isAbsolute } from 'node:path'
import { gitExecFileAsync } from '../../git/runner'
import { validatePlan, type Plan } from './kernel-plan'
import { parseTree, nulRecords } from './kernel-candidate-review-paths'
import { OrchestrationError } from './orchestration-error'

const MAX_BYTES = 16 * 1024 * 1024
export function acceptanceEnvironment(): NodeJS.ProcessEnv {
  // A check never inherits Orca caller capabilities, Node preloads or Git routing overrides.
  const env: NodeJS.ProcessEnv = {}
  for (const name of [
    'SystemRoot',
    'WINDIR',
    'COMSPEC',
    'PATH',
    'PATHEXT',
    'TEMP',
    'TMP',
    'HOME',
    'USERPROFILE'
  ]) {
    if (process.env[name]) {
      env[name] = process.env[name]
    }
  }
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_NO_LAZY_FETCH: '1',
    GIT_TERMINAL_PROMPT: '0'
  }
}
function fail(message: string): never {
  throw new OrchestrationError('kernel_snapshot_unsupported', message)
}
export async function snapshotGit(repo: string, args: string[]) {
  const result = await gitExecFileAsync(
    [
      '--no-replace-objects',
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'protocol.allow=never',
      '-c',
      'submodule.recurse=false',
      ...args
    ],
    { cwd: repo, env: acceptanceEnvironment(), timeout: 15_000, maxBuffer: MAX_BYTES }
  )
  return result.stdout
}
export async function nativeAcceptancePath(path: string): Promise<string> {
  if (
    !isAbsolute(path) ||
    /^[\\/]{2}/.test(path) ||
    [...path].some((character) => character.charCodeAt(0) < 32) ||
    (process.platform === 'win32' && !/^[a-z]:[/\\]/i.test(path))
  ) {
    fail('Native local absolute paths only.')
  }
  const actual = await realpath(path)
  if (/^[\\/]{2}/.test(actual)) {
    fail('Remote filesystem paths are unsupported.')
  }
  return actual
}
export async function createCandidateSnapshot(repo: string, candidate: string, plan: Plan) {
  repo = await nativeAcceptancePath(repo)
  const config = nulRecords(await snapshotGit(repo, ['config', '--null', '--list']))
  if (
    config.some((entry) =>
      /^(filter\.|core\.sparsecheckout|extensions\.(partialclone|worktreeconfig)|remote\..*\.promisor)/i.test(
        entry
      )
    )
  ) {
    fail('Filters, sparse, partial and per-worktree configuration are unsupported.')
  }
  const tree = parseTree(
    await snapshotGit(repo, ['ls-tree', '-r', '-z', '--full-tree', candidate]),
    candidate.length
  )
  const paths = [...tree.keys()]
  const spellings = new Map<string, string>()
  for (const path of paths) {
    path.split('/').forEach((_, i, parts) => {
      const prefix = parts.slice(0, i + 1).join('/')
      const prior = spellings.get(prefix.toLowerCase())
      if (prior && prior !== prefix) {
        fail('Snapshot paths have ambiguous casing.')
      }
      spellings.set(prefix.toLowerCase(), prefix)
    })
  }
  const lexical = validatePlan({
    ...plan,
    tasks: [{ ...plan.tasks[0], dependsOn: [], writePaths: paths }]
  })
  if (
    !lexical.ok ||
    paths.length > 4096 ||
    [...tree.values()].some((entry) => entry.mode !== '100644') ||
    paths.some(
      (path) =>
        path.includes('\uFFFD') || path.split('/').some((part) => part.toLowerCase() === '.git')
    )
  ) {
    fail('The complete snapshot must contain at most 4096 safe regular non-executable files.')
  }
  // Read raw objects before allocating a worktree. No checkout/smudge or candidate hooks run.
  const contents = new Map<string, Buffer>()
  let total = 0
  for (const [path, entry] of tree) {
    const { stdout } = await gitExecFileAsync(
      [
        '--no-replace-objects',
        '-c',
        'protocol.allow=never',
        '-c',
        'core.hooksPath=/dev/null',
        'cat-file',
        'blob',
        entry.oid
      ],
      {
        cwd: repo,
        env: acceptanceEnvironment(),
        encoding: 'buffer',
        timeout: 15_000,
        maxBuffer: MAX_BYTES
      }
    )
    if (!Buffer.isBuffer(stdout)) {
      fail('Raw Git blob capture did not return bytes.')
    }
    const oid = createHash(entry.oid.length === 40 ? 'sha1' : 'sha256')
      .update(`blob ${stdout.length}\0`)
      .update(stdout)
      .digest('hex')
    if (oid !== entry.oid) {
      fail('Git blob bytes do not match the fixed object ID.')
    }
    total += stdout.length
    if (total > MAX_BYTES) {
      fail('The complete snapshot exceeds 16 MiB.')
    }
    contents.set(path, stdout)
  }
  const root = await realpath(await mkdtemp(join(tmpdir(), 'orca-kernel-acceptance-')))
  const path = join(root, 'candidate')
  let registered = false
  let marker: Buffer | undefined
  const cleanup = async () => {
    try {
      if (
        (await lstat(root)).isSymbolicLink() ||
        (await realpath(root)) !== root ||
        (registered &&
          ((await lstat(path)).isSymbolicLink() ||
            (marker && !(await readFile(join(path, '.git'))).equals(marker!))))
      ) {
        throw new Error('Snapshot ownership changed')
      }
      if (registered) {
        await snapshotGit(repo, ['worktree', 'remove', '--force', '--', path])
      }
      // root is the exact mkdtemp directory owned by this operation, never the source worktree.
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    } catch {
      throw new OrchestrationError(
        'kernel_cleanup_failed',
        `Snapshot retained for operator cleanup: ${root}`
      )
    }
  }
  try {
    await snapshotGit(repo, ['worktree', 'add', '--detach', '--no-checkout', '--', path, candidate])
    registered = true
    for (const [name, bytes] of contents) {
      const destination = resolve(path, name)
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, bytes, { flag: 'wx' })
    }
    marker = await readFile(join(path, '.git'))
    const verify = async () => {
      if (
        !(await readFile(join(path, '.git'))).equals(marker!) ||
        (await snapshotGit(path, ['rev-parse', '--verify', 'HEAD'])).trim() !== candidate
      ) {
        throw new OrchestrationError(
          'kernel_candidate_changed',
          'Snapshot metadata or HEAD changed.'
        )
      }
      const observed: string[] = []
      const walk = async (directory: string, prefix: string): Promise<void> => {
        for (const name of await readdir(directory)) {
          if (!prefix && name === '.git') {
            continue
          }
          const relative = prefix + name
          const full = join(directory, name)
          const stat = await lstat(full)
          if (stat.isSymbolicLink()) {
            throw new Error('Snapshot symlink')
          }
          if (stat.isDirectory()) {
            if (!paths.some((entry) => entry.startsWith(`${relative}/`))) {
              throw new Error('Unexpected directory')
            }
            await walk(full, `${relative}/`)
          } else if (
            stat.isFile() &&
            stat.size <= MAX_BYTES &&
            contents.has(relative) &&
            (await readFile(full)).equals(contents.get(relative)!)
          ) {
            observed.push(relative)
          } else {
            throw new Error('Snapshot bytes changed')
          }
        }
      }
      try {
        await walk(path, '')
        if (observed.length !== contents.size) {
          throw new Error('Missing snapshot file')
        }
      } catch {
        throw new OrchestrationError(
          'kernel_candidate_changed',
          'Snapshot bytes or paths changed during checks.'
        )
      }
    }
    await verify()
    return { path, verify, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}
