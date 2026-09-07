import {
  cpSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  readlinkSync,
  rmdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync
} from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import {
  clearCopiedResourceMarker,
  markCopiedResource,
  targetIsOwnedFallbackCopy
} from './codex-managed-home-resource-copy-marker'
import { observe, observeResolvedPathEntry } from './codex-path-observation'

const CODEX_GLOBAL_INSTRUCTIONS_ENTRY = 'AGENTS.md'
export const ORCA_EXPERIMENT_CODEX_SYSTEM_HOME_ENV = 'ORCA_EXPERIMENT_CODEX_SYSTEM_HOME'

const CODEX_SYSTEM_RESOURCE_ENTRIES = [
  'skills',
  'hooks',
  'plugins',
  'plugin-state',
  'profile-v2',
  'themes',
  'prompts',
  CODEX_GLOBAL_INSTRUCTIONS_ENTRY
] as const

export function getSystemCodexHomePath(): string {
  const experimentHome = resolveExperimentCodexHomePaths()
  if (experimentHome) {
    return experimentHome.systemHomePath
  }
  return join(homedir(), '.codex')
}

export function isExperimentCodexSystemHomeEnabled(): boolean {
  return process.env[ORCA_EXPERIMENT_CODEX_SYSTEM_HOME_ENV] !== undefined
}

export function getExperimentCodexHomePaths(): {
  systemHomePath: string
  userDataPath: string
  managedHomePath: string
} | null {
  return resolveExperimentCodexHomePaths()
}

/** Validates an enabled experiment before any runtime-home side effect. */
export function assertExperimentCodexHomeConfiguration(): void {
  const experiment = resolveExperimentCodexHomePaths()
  if (!experiment) {
    return
  }
  assertExperimentCodexHomeTree(experiment.systemHomePath)
  assertExperimentCodexHomeTree(experiment.managedHomePath)
}

/** Path only; use when a read-only caller must not materialize the mirror. */
export function resolveOrcaManagedCodexHomePath(): string {
  return join(getOrcaUserDataPath(), 'codex-runtime-home', 'home')
}

export function getOrcaManagedCodexHomePath(): string {
  const managedHomePath = resolveOrcaManagedCodexHomePath()
  mkdirSync(managedHomePath, { recursive: true })
  return managedHomePath
}

export function getCodexSessionBackfillStateDirPath(): string {
  return join(getOrcaUserDataPath(), 'codex-session-backfill')
}

export function getOrcaUserDataPath(): string {
  const userDataPath = getUnvalidatedOrcaUserDataPath()
  resolveExperimentCodexHomePaths(userDataPath)
  return userDataPath
}

function getUnvalidatedOrcaUserDataPath(): string {
  if (process.env.ORCA_USER_DATA_PATH) {
    return process.env.ORCA_USER_DATA_PATH
  }
  // Why: CLI hook commands import this module outside Electron. Mirror the CLI
  // runtime metadata path so offline hook status/on/off uses the same userData.
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'orca')
  }
  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'orca')
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'orca')
}

// Why: each managed home (the shared runtime mirror, or a per-account
// self-contained CODEX_HOME that the caller has already created) links the same
// system resources with its own ownership markers, so a per-account launch home
// is complete without ever symlinking into or mutating the user's real ~/.codex.
export function syncSystemCodexResourcesIntoManagedHome(managedHomePath?: string): void {
  const targetHome = managedHomePath ?? getOrcaManagedCodexHomePath()
  const systemHomePath = getSystemCodexHomePath()
  assertExperimentCodexHomeTree(systemHomePath)
  assertExperimentCodexHomeTree(targetHome)
  for (const entryName of CODEX_SYSTEM_RESOURCE_ENTRIES) {
    linkSystemCodexResource(systemHomePath, targetHome, entryName, {
      preferCopy: isExperimentCodexSystemHomeEnabled()
    })
  }
}

function resolveExperimentCodexHomePaths(
  unvalidatedUserDataPath = getUnvalidatedOrcaUserDataPath()
): {
  systemHomePath: string
  userDataPath: string
  managedHomePath: string
} | null {
  const rawSystemHome = process.env[ORCA_EXPERIMENT_CODEX_SYSTEM_HOME_ENV]
  if (rawSystemHome === undefined) {
    return null
  }
  const systemHome = rawSystemHome.trim()
  if (!systemHome || !isAbsolute(systemHome) || !isAbsolute(unvalidatedUserDataPath)) {
    throw new Error('Experimental Codex homes must be non-empty absolute paths.')
  }
  if (process.platform !== 'win32') {
    throw new Error('Experimental Codex system home is supported only on Windows.')
  }
  const experimentRoot = resolve(
    process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
    'OrcaKernelLab'
  )
  const systemHomePath = resolve(systemHome)
  const userDataPath = resolve(unvalidatedUserDataPath)
  const managedHomePath = join(userDataPath, 'codex-runtime-home', 'home')
  for (const candidate of [systemHomePath, userDataPath, managedHomePath]) {
    assertExperimentPath(candidate, experimentRoot)
  }
  return { systemHomePath, userDataPath, managedHomePath }
}

function assertExperimentCodexHomeTree(homePath: string): void {
  const experiment = resolveExperimentCodexHomePaths()
  if (!experiment) {
    return
  }
  const experimentRoot = resolve(process.env.LOCALAPPDATA!, 'OrcaKernelLab')
  assertExperimentPath(homePath, experimentRoot)
  if (isAbsentPath(homePath)) {
    return
  }
  const pending = [homePath]
  while (pending.length > 0) {
    const current = pending.pop()!
    const stats = lstatSync(current)
    if (stats.isSymbolicLink()) {
      throw new Error(`Experimental Codex home contains a link: ${current}`)
    }
    if (stats.isDirectory()) {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        pending.push(join(current, entry.name))
      }
    }
  }
}

function assertExperimentPath(candidatePath: string, experimentRoot: string): void {
  const relativePath = relative(experimentRoot, candidatePath)
  if (relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))) {
    let existingPath = candidatePath
    while (isAbsentPath(existingPath)) {
      const parent = resolve(existingPath, '..')
      if (parent === existingPath) {
        break
      }
      existingPath = parent
    }
    if (isPathInside(experimentRoot, realpathSync(existingPath))) {
      return
    }
  }
  throw new Error(`Experimental Codex path escapes OrcaKernelLab: ${candidatePath}`)
}

function isAbsentPath(path: string): boolean {
  try {
    lstatSync(path)
    return false
  } catch (error) {
    if (isMissingPathError(error)) {
      return true
    }
    throw error
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  )
}

function isPathInside(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate)
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

export function syncCodexGlobalInstructionsIntoManagedHome({
  systemHomePath,
  managedHomePath
}: {
  systemHomePath: string
  managedHomePath: string
}): void {
  mkdirSync(managedHomePath, { recursive: true })
  // Why: this only runs for WSL runtime homes, whose system + managed homes are
  // both \\wsl.localhost UNC paths. A host-side symlink there stores a Windows
  // UNC target the distro cannot resolve, so copy the file like the config
  // mirror does across the same boundary.
  linkSystemCodexResource(systemHomePath, managedHomePath, CODEX_GLOBAL_INSTRUCTIONS_ENTRY, {
    preferCopy: true
  })
}

function linkSystemCodexResource(
  systemHomePath: string,
  managedHomePath: string,
  entryName: string,
  { preferCopy = false }: { preferCopy?: boolean } = {}
): void {
  const sourcePath = join(systemHomePath, entryName)
  const targetPath = join(managedHomePath, entryName)
  // Why: both branches below DELETE Orca's mirrored copy because the system
  // resource "is not there". `existsSync` and the old `catch { return false }`
  // both reported that for a source we merely could not read, so one denied
  // read on ~/.codex/AGENTS.md removed the managed copy on the next launch.
  // One resolved stat now answers reachability and regular-file-ness together.
  const sourceObservation = observeResolvedPathEntry(sourcePath)
  if (sourceObservation.kind === 'indeterminate') {
    return
  }
  if (sourceObservation.kind === 'absent') {
    removeCopiedResourceIfOwned(targetPath, managedHomePath, entryName, sourcePath)
    return
  }
  if (entryName === CODEX_GLOBAL_INSTRUCTIONS_ENTRY && !sourceObservation.value.isFile()) {
    removeCopiedResourceIfOwned(targetPath, managedHomePath, entryName, sourcePath)
    console.warn('[codex-home] Ignoring non-file system Codex resource:', entryName)
    return
  }

  if (targetAlreadyPointsToSource(targetPath, sourcePath)) {
    clearCopiedResourceMarker(managedHomePath, entryName)
    if (!preferCopy || !removeSymlinkEntry(targetPath)) {
      return
    }
  }
  // Why: an unreadable target is not a missing target; do not let the fallback
  // copier remove it merely because existsSync/lstatSync collapsed the error.
  const targetObservation = observe(() => lstatSync(targetPath))
  if (targetObservation.kind === 'indeterminate') {
    return
  }
  const shouldRefreshFallbackCopy =
    targetObservation.kind === 'present' &&
    targetIsOwnedFallbackCopy(targetPath, managedHomePath, entryName, sourcePath)
  if (targetObservation.kind === 'present' && !shouldRefreshFallbackCopy) {
    return
  }
  if (shouldRefreshFallbackCopy) {
    // Why: WSL launch preparation runs before every Codex start. Avoid
    // rewriting an unchanged file across the UNC boundary on every launch.
    if (entryName === CODEX_GLOBAL_INSTRUCTIONS_ENTRY) {
      const contentsMatch = copiedFileContentsMatch(sourcePath, targetPath)
      if (contentsMatch === 'match' || contentsMatch === 'indeterminate') {
        // Why: a failed comparison is not permission to remove the only
        // readable copy; leave it in place for the next launch.
        return
      }
    }
    rmSync(targetPath, { recursive: true, force: true })
  }

  if (preferCopy) {
    copySystemCodexResourceAsOwnedFallback(sourcePath, targetPath, managedHomePath, entryName)
    return
  }

  try {
    const sourceStat = lstatSync(sourcePath)
    symlinkSync(
      sourcePath,
      targetPath,
      sourceStat.isDirectory() && process.platform === 'win32' ? 'junction' : undefined
    )
    clearCopiedResourceMarker(managedHomePath, entryName)
  } catch (error) {
    // Why: Windows can reject file symlinks outside developer mode. Copy is
    // a fallback for launch-time resources; mark ownership so later syncs can
    // refresh the copy without touching user-created runtime resources.
    copySystemCodexResourceAsOwnedFallback(
      sourcePath,
      targetPath,
      managedHomePath,
      entryName,
      error
    )
  }
}

function copySystemCodexResourceAsOwnedFallback(
  sourcePath: string,
  targetPath: string,
  managedHomePath: string,
  entryName: string,
  symlinkError?: unknown
): void {
  try {
    rmSync(targetPath, { recursive: true, force: true })
    cpSync(sourcePath, targetPath, {
      recursive: true,
      force: false,
      errorOnExist: true,
      // Why: dotfile managers commonly symlink AGENTS.md. WSL needs the file
      // contents because a copied host-side link is not usable in the distro.
      dereference: entryName === CODEX_GLOBAL_INSTRUCTIONS_ENTRY
    })
    markCopiedResource(managedHomePath, entryName, sourcePath)
  } catch (copyError) {
    // Why: an unmarked copy cannot be refreshed or safely removed later.
    // Roll it back instead of stranding stale instructions in the runtime home.
    try {
      rmSync(targetPath, { recursive: true, force: true })
    } catch (cleanupError) {
      console.warn(
        '[codex-home] Failed to remove incomplete resource copy:',
        entryName,
        cleanupError
      )
    }
    console.warn(
      '[codex-home] Failed to mirror system Codex resource:',
      entryName,
      symlinkError ?? copyError
    )
  }
}

function copiedFileContentsMatch(
  sourcePath: string,
  targetPath: string
): 'match' | 'different' | 'indeterminate' {
  try {
    // Why: reading a FIFO or device synchronously can block Codex launch.
    // Follow source symlinks, but only compare two regular files.
    if (!statSync(sourcePath).isFile() || !lstatSync(targetPath).isFile()) {
      return 'different'
    }
    return readFileSync(sourcePath).equals(readFileSync(targetPath)) ? 'match' : 'different'
  } catch {
    return 'indeterminate'
  }
}

function targetAlreadyPointsToSource(targetPath: string, sourcePath: string): boolean {
  try {
    return (
      lstatSync(targetPath).isSymbolicLink() &&
      linkTargetsMatch(readlinkSync(targetPath), sourcePath)
    )
  } catch {
    return false
  }
}

function linkTargetsMatch(actualTarget: string, expectedTarget: string): boolean {
  if (process.platform !== 'win32') {
    return actualTarget === expectedTarget
  }
  return normalizeWindowsLinkTarget(actualTarget) === normalizeWindowsLinkTarget(expectedTarget)
}

function normalizeWindowsLinkTarget(linkTarget: string): string {
  return linkTarget.replace(/^\\\\\?\\/, '').toLowerCase()
}

function removeCopiedResourceIfOwned(
  targetPath: string,
  managedHomePath: string,
  entryName: string,
  sourcePath: string
): void {
  if (removeSymlinkedResourceIfOwned(targetPath, sourcePath)) {
    clearCopiedResourceMarker(managedHomePath, entryName)
    return
  }
  if (!targetIsOwnedFallbackCopy(targetPath, managedHomePath, entryName, sourcePath)) {
    return
  }
  rmSync(targetPath, { recursive: true, force: true })
  clearCopiedResourceMarker(managedHomePath, entryName)
}

function removeSymlinkedResourceIfOwned(targetPath: string, sourcePath: string): boolean {
  try {
    if (!lstatSync(targetPath).isSymbolicLink()) {
      return false
    }
    if (!linkTargetsMatch(readlinkSync(targetPath), sourcePath)) {
      return false
    }
    return removeSymlinkEntry(targetPath)
  } catch {
    return false
  }
}

function removeSymlinkEntry(targetPath: string): boolean {
  try {
    // Why: recursive rm can leave a broken directory symlink behind; unlink the
    // link entry itself so deleted system resources do not linger in runtime home.
    unlinkSync(targetPath)
    return true
  } catch {
    if (process.platform !== 'win32') {
      return false
    }
  }

  try {
    rmdirSync(targetPath)
    return true
  } catch {
    return false
  }
}
