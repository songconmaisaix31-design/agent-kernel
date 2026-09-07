import { lstatSync, readdirSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'

export const ORCA_EXPERIMENT_CODEX_SYSTEM_HOME_ENV = 'ORCA_EXPERIMENT_CODEX_SYSTEM_HOME'

export type ExperimentCodexHomePaths = {
  systemHomePath: string
  userDataPath: string
  managedHomePath: string
}

export function isExperimentCodexSystemHomeEnabled(): boolean {
  return process.env[ORCA_EXPERIMENT_CODEX_SYSTEM_HOME_ENV] !== undefined
}

export function getExperimentCodexHomePaths(): ExperimentCodexHomePaths | null {
  return resolveExperimentCodexHomePaths()
}

export function assertExperimentCodexHomeConfiguration(): void {
  const experiment = resolveExperimentCodexHomePaths()
  if (!experiment) {
    return
  }
  assertExperimentCodexHomeTree(experiment.systemHomePath)
  assertExperimentCodexHomeTree(experiment.userDataPath)
  assertExperimentCodexHomeTree(experiment.managedHomePath)
}

export function getUnvalidatedOrcaUserDataPath(): string {
  if (process.env.ORCA_USER_DATA_PATH) {
    return process.env.ORCA_USER_DATA_PATH
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'orca')
  }
  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'orca')
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'orca')
}

export function assertExperimentCodexHomeTree(homePath: string): void {
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

function resolveExperimentCodexHomePaths(): ExperimentCodexHomePaths | null {
  const rawSystemHome = process.env[ORCA_EXPERIMENT_CODEX_SYSTEM_HOME_ENV]
  if (rawSystemHome === undefined) {
    return null
  }
  const systemHome = rawSystemHome.trim()
  const unvalidatedUserDataPath = getUnvalidatedOrcaUserDataPath()
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
