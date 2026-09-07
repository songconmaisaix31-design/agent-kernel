import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe.skipIf(process.platform !== 'win32')('run-windows-managed-smoke', () => {
  it('passes only experiment paths to a real child process', () => {
    const result = spawnSync(
      process.execPath,
      ['config/scripts/run-windows-managed-smoke.mjs', '--print-config'],
      {
        cwd: resolve(import.meta.dirname, '..', '..'),
        encoding: 'utf8',
        env: {
          ...process.env,
          CODEX_HOME: 'C:\\daily\\codex',
          CODEX_SESSION_ID: 'daily-session',
          ELECTRON_RUN_AS_NODE: '1',
          ELECTRON_OVERRIDE_DIST_PATH: 'C:\\override',
          ORCA_DEV_REPO_ROOT: 'C:\\daily\\orca',
          PATH: 'C:\\daily\\path',
          Path: 'C:\\daily\\path-duplicate'
        }
      }
    )
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      systemHome: join(
        process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
        'OrcaKernelLab',
        'body-smoke-20260907',
        'native-run',
        'system-home'
      ),
      profile: join(
        process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
        'OrcaKernelLab',
        'body-smoke-20260907',
        'native-run',
        'profile'
      )
    })
    const child = spawnSync(
      process.execPath,
      ['config/scripts/run-windows-managed-smoke.mjs', '--print-child-env'],
      {
        cwd: resolve(import.meta.dirname, '..', '..'),
        encoding: 'utf8',
        env: {
          ...process.env,
          CODEX_HOME: 'C:\\daily\\codex',
          CODEX_SESSION_ID: 'daily-session',
          ELECTRON_RUN_AS_NODE: '1',
          ELECTRON_OVERRIDE_DIST_PATH: 'C:\\override',
          ORCA_DEV_REPO_ROOT: 'C:\\daily\\orca'
        }
      }
    )
    expect(child.status).toBe(0)
    const childEnv = JSON.parse(child.stdout)
    expect(childEnv.systemHome).toContain('native-run\\system-home')
    expect(childEnv.profile).toContain('native-run\\profile')
    expect(childEnv.hasCodexHome).toBe(false)
    expect(childEnv.hasCodexSessionId).toBe(false)
    expect(childEnv.hasElectronRunAsNode).toBe(false)
    expect(childEnv.hasElectronOverrideDistPath).toBe(false)
    expect(childEnv.candidateRepoRoot).toBe(resolve(import.meta.dirname, '..', '..'))
    expect(childEnv.candidateProfile).toContain('native-run\\profile')
    expect(childEnv.candidateRuntime).toContain('electron-43.1.0-win32-x64\\electron.exe')
    expect(childEnv.candidateCliCommand).toContain('native-run\\profile\\cli\\bin\\orca-dev.cmd')
    expect(childEnv.pathKeyCount).toBe(1)
  })
})
