#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { lstatSync, mkdirSync, readdirSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { prepareDevCliTerminalWrappers } from './dev-cli-terminal-wrapper.mjs'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const labRoot = resolve(
  process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
  'OrcaKernelLab'
)
const nativeRunRoot = join(labRoot, 'body-smoke-20260907', 'native-run')
const systemHome = join(nativeRunRoot, 'system-home')
const profile = join(nativeRunRoot, 'profile')

if (process.platform !== 'win32') {
  throw new Error('Windows managed smoke launcher is supported only on Windows.')
}
assertExperimentPath(systemHome)
assertExperimentPath(profile)
assertExperimentTree(systemHome)
assertExperimentTree(profile)

const electronPath = join(labRoot, 'runtime', 'electron-43.1.0-win32-x64', 'electron.exe')
const wrappers = prepareDevCliTerminalWrappers({
  repoRoot,
  userDataPath: profile,
  electronExecutable: electronPath
})
const childEnv = createChildEnvironment(wrappers.userDataBinDir)

if (process.argv.includes('--print-config')) {
  process.stdout.write(`${JSON.stringify({ systemHome, profile })}\n`)
  process.exit(0)
}

if (process.argv.includes('--print-child-env')) {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `process.stdout.write(JSON.stringify({
        systemHome: process.env.ORCA_EXPERIMENT_CODEX_SYSTEM_HOME,
        profile: process.env.ORCA_USER_DATA_PATH,
        hasCodexHome: Boolean(process.env.CODEX_HOME),
        hasCodexSessionId: Boolean(process.env.CODEX_SESSION_ID),
        hasElectronRunAsNode: Boolean(process.env.ELECTRON_RUN_AS_NODE),
        hasElectronOverrideDistPath: Boolean(process.env.ELECTRON_OVERRIDE_DIST_PATH),
        hasOrcaDevRepoRoot: Boolean(process.env.ORCA_DEV_REPO_ROOT),
        hasCandidateCliCommand: process.env.ORCA_CLI_COMMAND?.endsWith('orca-dev.cmd') ?? false
      }))`
    ],
    { encoding: 'utf8', env: childEnv }
  )
  process.stdout.write(result.stdout)
  process.exit(result.status ?? 1)
}

mkdirSync(systemHome, { recursive: true })
mkdirSync(profile, { recursive: true })
const result = spawnSync(electronPath, ['.'], {
  cwd: repoRoot,
  env: {
    ...childEnv
  },
  stdio: 'inherit'
})
process.exit(result.status ?? 1)

function createChildEnvironment(userDataBinDir) {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (
      /^(ANTHROPIC_|CLAUDE_|CODEX_|COPILOT_|CURSOR_|ELECTRON_|GEMINI_|OPENAI_|ORCA_|PI_)/.test(key)
    ) {
      delete env[key]
    }
  }
  return {
    ...env,
    ORCA_EXPERIMENT_CODEX_SYSTEM_HOME: systemHome,
    ORCA_USER_DATA_PATH: profile,
    ORCA_DEV_REPO_ROOT: repoRoot,
    ORCA_CLI_COMMAND: join(userDataBinDir, 'orca-dev.cmd'),
    Path: `${userDataBinDir}${process.platform === 'win32' ? ';' : ':'}${env.Path ?? env.PATH ?? ''}`
  }
}

function assertExperimentTree(homePath) {
  if (!exists(homePath)) {return}
  const pending = [homePath]
  while (pending.length > 0) {
    const current = pending.pop()
    const stats = lstatSync(current)
    if (stats.isSymbolicLink()) {
      throw new Error(`Experimental path contains a link: ${current}`)
    }
    if (stats.isDirectory()) {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        pending.push(join(current, entry.name))
      }
    }
  }
}

function assertExperimentPath(candidatePath) {
  if (!isAbsolute(candidatePath) || !isInside(labRoot, resolve(candidatePath))) {
    throw new Error(`Experimental path escapes OrcaKernelLab: ${candidatePath}`)
  }
  const existing = findExistingPath(resolve(candidatePath))
  if (!isInside(labRoot, realpathSync(existing))) {
    throw new Error(`Experimental path resolves outside OrcaKernelLab: ${candidatePath}`)
  }
}

function findExistingPath(candidatePath) {
  let current = candidatePath
  for (;;) {
    try {
      lstatSync(current)
      return current
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') {throw error}
      const parent = resolve(current, '..')
      if (parent === current) {throw error}
      current = parent
    }
  }
}

function exists(path) {
  try {
    lstatSync(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {return false}
    throw error
  }
}

function isInside(root, candidate) {
  const path = relative(root, candidate)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}
