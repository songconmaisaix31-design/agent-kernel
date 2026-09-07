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
          ORCA_DEV_REPO_ROOT: 'C:\\daily\\orca'
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
    expect(childEnv.ORCA_EXPERIMENT_CODEX_SYSTEM_HOME).toContain('native-run\\system-home')
    expect(childEnv.ORCA_USER_DATA_PATH).toContain('native-run\\profile')
    expect(childEnv.CODEX_HOME).toBeUndefined()
    expect(childEnv.CODEX_SESSION_ID).toBeUndefined()
    expect(childEnv.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(childEnv.ELECTRON_OVERRIDE_DIST_PATH).toBeUndefined()
    expect(childEnv.ORCA_DEV_REPO_ROOT).toBeUndefined()
  })
})
