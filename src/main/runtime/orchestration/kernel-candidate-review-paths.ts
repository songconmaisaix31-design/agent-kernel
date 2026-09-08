import { validatePlan, type Plan } from './kernel-plan'

export class ReviewRejected extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}
export function reject(code: string, message: string): never {
  throw new ReviewRejected(code, message)
}
export function nulRecords(text: string): string[] {
  if (!text) {
    return []
  }
  if (!text.endsWith('\0')) {
    reject('invalid_git_output', 'Truncated Git output.')
  }
  return text.slice(0, -1).split('\0')
}
type TreeEntry = { mode: string; oid: string }
export function parseTree(text: string, oidLength: number): Map<string, TreeEntry> {
  const result = new Map<string, TreeEntry>()
  for (const record of nulRecords(text)) {
    const match = record.match(/^([0-7]{6}) (blob|commit) ([0-9a-f]+)\t([\s\S]+)$/)
    if (!match || match[3].length !== oidLength || result.has(match[4])) {
      reject('invalid_git_output', 'Invalid or duplicate Git tree entry.')
    }
    result.set(match[4], { mode: match[1], oid: match[3] })
  }
  return result
}
type Change = { oldPath?: string; newPath?: string; oldOid: string; newOid: string }
export function parseChanges(
  text: string,
  before: Map<string, TreeEntry>,
  after: Map<string, TreeEntry>,
  length: number
): Change[] {
  const fields = nulRecords(text)
  const changes: Change[] = []
  for (let i = 0; i < fields.length; ) {
    const match = fields[i++].match(/^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]+) ([0-9a-f]+) ([AMD])$/)
    if (!match || match[3].length !== length || match[4].length !== length) {
      reject('invalid_git_output', 'Unrecognized raw diff record or file type change.')
    }
    const status = match[5][0]
    const first = fields[i++]
    if (!first) {
      reject('invalid_git_output', 'Missing raw diff path.')
    }
    const oldPath = status === 'A' ? undefined : first
    const newPath = status === 'D' ? undefined : first
    for (const [path, tree, mode, oid] of [
      [oldPath, before, match[1], match[3]],
      [newPath, after, match[2], match[4]]
    ] as const) {
      if (path === undefined) {
        if (mode !== '000000' || !/^0+$/.test(oid)) {
          reject('invalid_git_output', 'Invalid absent diff side.')
        }
      } else {
        if (mode !== '100644') {
          reject('unsupported_mode', 'Only regular non-executable file changes are supported.')
        }
        const entry = tree.get(path)
        if (!entry || entry.mode !== mode || entry.oid !== oid) {
          reject('invalid_git_output', 'Diff does not match the fixed trees.')
        }
      }
    }
    changes.push({ oldPath, newPath, oldOid: match[3], newOid: match[4] })
  }
  const covered = new Set(changes.flatMap((change) => [change.oldPath, change.newPath]))
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    const old = before.get(path),
      next = after.get(path)
    if ((old?.mode !== next?.mode || old?.oid !== next?.oid) && !covered.has(path)) {
      reject('invalid_git_output', 'Raw diff omitted a changed tree path.')
    }
  }
  return changes
}
export function checkPaths(
  plan: Plan,
  paths: string[],
  before: Map<string, TreeEntry>,
  after: Map<string, TreeEntry>,
  taskKey: string
) {
  const task = plan.tasks.find((entry) => entry.key === taskKey)!
  // Deleted files and newly created directories do not coexist in either endpoint tree.
  const invalidShape = [before, after].some((tree) => {
    const endpointPaths = paths.filter((path) => tree.has(path))
    return (
      endpointPaths.length > 0 &&
      !validatePlan({
        ...plan,
        tasks: [{ ...task, dependsOn: [], writePaths: endpointPaths }]
      }).ok
    )
  })
  if (
    invalidShape ||
    paths.some((path) => path.split('/').some((part) => part.toLowerCase() === '.git'))
  ) {
    reject(
      'unsafe_path',
      'Changed paths must satisfy the portable Plan path rules and exclude Git metadata.'
    )
  }
  const spellings = new Map<string, string>()
  const ambiguous = new Set<string>()
  for (const path of [...before.keys(), ...after.keys(), ...task.writePaths]) {
    const parts = path.replace(/\/$/, '').split('/')
    parts.forEach((_, i) => {
      const prefix = parts.slice(0, i + 1).join('/')
      const key = prefix.toLowerCase()
      if (spellings.has(key) && spellings.get(key) !== prefix) {
        ambiguous.add(key)
      }
      spellings.set(key, prefix)
    })
  }
  for (const path of paths) {
    if (
      path.split('/').some((_, i, parts) =>
        ambiguous.has(
          parts
            .slice(0, i + 1)
            .join('/')
            .toLowerCase()
        )
      )
    ) {
      reject(
        'unsafe_path',
        'Changed paths have ambiguous casing in the approved paths or fixed trees.'
      )
    }
    if (
      !task.writePaths.some((allowed) =>
        allowed.endsWith('/') ? path.startsWith(allowed) : path === allowed
      )
    ) {
      reject('out_of_scope', `Changed path is outside the approved task: ${path}`)
    }
  }
}
