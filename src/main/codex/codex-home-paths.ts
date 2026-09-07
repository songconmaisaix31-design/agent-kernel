import {
  cpSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  clearCopiedResourceMarker,
  markCopiedResource,
  targetIsOwnedFallbackCopy
} from './codex-managed-home-resource-copy-marker'
import { observe, observeResolvedPathEntry } from './codex-path-observation'
import {
  assertExperimentCodexHomeTree,
  getExperimentCodexHomePaths,
  getUnvalidatedOrcaUserDataPath,
  isExperimentCodexSystemHomeEnabled
} from './codex-experiment-home'

export {
  assertExperimentCodexHomeConfiguration,
  getExperimentCodexHomePaths,
  isExperimentCodexSystemHomeEnabled,
  ORCA_EXPERIMENT_CODEX_SYSTEM_HOME_ENV
} from './codex-experiment-home'

const CODEX_GLOBAL_INSTRUCTIONS_ENTRY = 'AGENTS.md'

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
  const experimentHome = getExperimentCodexHomePaths()
  if (experimentHome) {
    return experimentHome.systemHomePath
  }
  return join(homedir(), '.codex')
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
  getExperimentCodexHomePaths()
  return userDataPath
}

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

export function syncCodexGlobalInstructionsIntoManagedHome({
  systemHomePath,
  managedHomePath
}: {
  systemHomePath: string
  managedHomePath: string
}): void {
  mkdirSync(managedHomePath, { recursive: true })
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
    if (entryName === CODEX_GLOBAL_INSTRUCTIONS_ENTRY) {
      const contentsMatch = copiedFileContentsMatch(sourcePath, targetPath)
      if (contentsMatch === 'match' || contentsMatch === 'indeterminate') {
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
