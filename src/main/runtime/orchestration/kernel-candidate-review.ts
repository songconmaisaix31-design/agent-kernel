import { lstat, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { gitExecFileAsync } from '../../git/runner'
import { validatePlan, type Plan } from './kernel-plan'
import {
  ReviewRejected,
  reject,
  nulRecords,
  parseTree,
  parseChanges,
  checkPaths
} from './kernel-candidate-review-paths'

export type KernelCandidateReviewInput = {
  /** Supplied by the trusted caller, never loaded from the candidate checkout. */
  plan: Plan
  taskKey: string
  repoPath: string
  baseCommit: string
  candidateCommit: string
  executionHost: 'native' | 'ssh' | 'wsl'
}
export type KernelCandidateReviewResult =
  | { status: 'scope-checked'; baseCommit: string; candidateCommit: string; paths: string[] }
  | { status: 'rejected'; code: string; message: string }

const fullOid = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i
const MAX_OUTPUT = 2 * 1024 * 1024

function nativePath(path: string): boolean {
  return (
    isAbsolute(path) &&
    ![...path].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    ) &&
    !path.startsWith('\\\\') &&
    !path.startsWith('//') &&
    (process.platform !== 'win32' || /^[a-z]:[/\\]/i.test(path))
  )
}
async function localRealpath(path: string): Promise<string> {
  if (!nativePath(path)) {
    reject('unsupported_host', 'A native local absolute path is required.')
  }
  const result = await realpath(path)
  if (!nativePath(result)) {
    reject('unsupported_host', 'Remote or device paths are unsupported.')
  }
  return result
}
async function optionalText(path: string): Promise<string | undefined> {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.size > MAX_OUTPUT) {
      reject('unsupported_repository', 'Repository metadata must be a bounded regular file.')
    }
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}
async function repositoryPaths(repoPath: string) {
  const repo = await localRealpath(repoPath)
  const marker = join(repo, '.git')
  const info = await lstat(marker)
  let gitDir = marker
  if (info.isFile()) {
    const pointer = await optionalText(marker)
    const match = pointer?.match(/^gitdir: ([^\r\n]+)\r?\n?$/)
    if (!match) {
      reject('unsupported_repository', 'Invalid linked worktree metadata.')
    }
    if (/^[\\/]{2}/.test(match[1])) {
      reject('unsupported_host', 'Remote worktree metadata is unsupported.')
    }
    gitDir = resolve(repo, match[1])
  } else if (!info.isDirectory()) {
    reject('unsupported_repository', 'A regular Git directory or worktree pointer is required.')
  }
  gitDir = await localRealpath(gitDir)
  const commonPointer = await optionalText(join(gitDir, 'commondir'))
  if (commonPointer && /^[\\/]{2}/.test(commonPointer)) {
    reject('unsupported_host', 'Remote common repository metadata is unsupported.')
  }
  const commonDir =
    commonPointer === undefined
      ? gitDir
      : await localRealpath(resolve(gitDir, commonPointer.trim()))
  for (const file of ['shallow', join('info', 'grafts')]) {
    if ((await optionalText(join(commonDir, file)))?.trim()) {
      reject('unsupported_repository', 'Shallow or grafted history cannot establish ancestry.')
    }
  }
  return { repo, gitDir }
}
function readEnvironment(): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)))
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_TERMINAL_PROMPT: '0'
  }
}
/** Read-only prerequisite; never executes acceptance, changes state or authorizes integration. */
export async function reviewKernelCandidate(
  input: KernelCandidateReviewInput
): Promise<KernelCandidateReviewResult> {
  try {
    if (
      input.executionHost !== 'native' ||
      process.env.WSL_DISTRO_NAME ||
      process.env.WSL_INTEROP
    ) {
      reject(
        'unsupported_host',
        'Only native local Git is supported; SSH/WSL never fall back locally.'
      )
    }
    const validation = validatePlan(input.plan)
    if (!validation.ok) {
      reject('invalid_plan', 'A validated trusted Plan is required.')
    }
    const plan = validation.plan
    const task = plan.tasks.find((entry) => entry.key === input.taskKey)
    if (!task) {
      reject('unknown_task', 'Task key is absent from the approved Plan.')
    }
    if (task.dependsOn.length) {
      reject(
        'unsupported_dependency',
        'Dependent tasks require trusted acceptance and are unsupported.'
      )
    }
    const base = input.baseCommit.toLowerCase(),
      candidate = input.candidateCommit.toLowerCase()
    if (
      ![base, candidate].every((oid) => fullOid.test(oid) && !/^0+$/.test(oid)) ||
      base.length !== candidate.length
    ) {
      reject('invalid_commit', 'Explicit full nonzero commit IDs are required.')
    }
    if (base !== plan.baseCommit.toLowerCase()) {
      reject('base_mismatch', 'Base differs from the approved Plan.')
    }
    const { repo, gitDir } = await repositoryPaths(input.repoPath)
    const env = readEnvironment()
    const git = async (args: string[], stdin?: string): Promise<string> => {
      const { stdout } = await gitExecFileAsync(
        [
          '--no-pager',
          '--no-replace-objects',
          `--git-dir=${gitDir}`,
          `--work-tree=${repo}`,
          '-c',
          'core.fsmonitor=false',
          '-c',
          'core.hooksPath=/dev/null',
          '-c',
          'protocol.allow=never',
          '-c',
          'submodule.recurse=false',
          ...args
        ],
        { cwd: repo, env, stdin, timeout: 15_000, maxBuffer: MAX_OUTPUT }
      )
      return stdout
    }
    const config = nulRecords(await git(['config', '--null', '--list']))
    if (config.some((entry) => /^(extensions\.partialclone|remote\..*\.promisor)\n/i.test(entry))) {
      reject(
        'unsupported_repository',
        'Partial clones may fetch missing objects and are unsupported.'
      )
    }
    for (const oid of [base, candidate]) {
      if ((await git(['cat-file', '-t', oid])).trim() !== 'commit') {
        reject('invalid_commit', 'Object is not a commit.')
      }
    }
    await git(['merge-base', '--is-ancestor', base, candidate])
    const before = parseTree(await git(['ls-tree', '-r', '-z', '--full-tree', base]), base.length)
    const after = parseTree(
      await git(['ls-tree', '-r', '-z', '--full-tree', candidate]),
      base.length
    )
    const changes = parseChanges(
      await git([
        'diff-tree',
        '-r',
        '--raw',
        '-z',
        '--no-abbrev',
        '--no-commit-id',
        '--no-ext-diff',
        '--no-textconv',
        '--ignore-submodules=none',
        '--no-renames',
        base,
        candidate,
        '--'
      ]),
      before,
      after,
      base.length
    )
    if (!changes.length) {
      reject('empty_diff', 'A nonempty complete candidate diff is required.')
    }
    const paths = [
      ...new Set(
        changes.flatMap((change) =>
          [change.oldPath, change.newPath].filter((path): path is string => path !== undefined)
        )
      )
    ].sort()
    checkPaths(plan, paths, before, after, task.key)
    const objects = [
      ...new Set(
        changes
          .flatMap((change) => [change.oldOid, change.newOid])
          .filter((oid) => !/^0+$/.test(oid))
      )
    ]
    const checked = (await git(['cat-file', '--batch-check'], `${objects.join('\n')}\n`))
      .trim()
      .split('\n')
    if (
      checked.length !== objects.length ||
      checked.some((line, i) => !new RegExp(`^${objects[i]} blob [0-9]+$`).test(line))
    ) {
      reject('invalid_git_output', 'Changed blobs are missing or cannot be read.')
    }
    return { status: 'scope-checked', baseCommit: base, candidateCommit: candidate, paths }
  } catch (error) {
    return error instanceof ReviewRejected
      ? { status: 'rejected', code: error.code, message: error.message }
      : {
          status: 'rejected',
          code: 'git_error',
          message: 'Git or repository reading failed; scope was not established.'
        }
  }
}
