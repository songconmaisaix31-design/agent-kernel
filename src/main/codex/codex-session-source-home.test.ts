import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ORCA_EXPERIMENT_CODEX_SYSTEM_HOME_ENV } from './codex-home-paths'
import {
  resolveHostCodexSessionSourceHome,
  resolveWslCodexSessionSourceHome
} from './codex-session-source-home'

describe('resolveHostCodexSessionSourceHome', () => {
  it('returns undefined when no override is configured', () => {
    expect(resolveHostCodexSessionSourceHome({})).toBeUndefined()
    expect(resolveHostCodexSessionSourceHome({ codexSessionSourceHome: {} })).toBeUndefined()
  })

  it('returns undefined for blank/whitespace overrides so the default is kept', () => {
    expect(
      resolveHostCodexSessionSourceHome({ codexSessionSourceHome: { host: '   ' } })
    ).toBeUndefined()
  })

  it('returns the trimmed host override path', () => {
    expect(
      resolveHostCodexSessionSourceHome({ codexSessionSourceHome: { host: '  /custom/codex  ' } })
    ).toBe('/custom/codex')
  })

  it.skipIf(process.platform !== 'win32')(
    'uses the validated experiment source instead of a configured daily history home',
    () => {
      const labRoot = join(
        process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
        'OrcaKernelLab'
      )
      const experimentRoot = mkdtempSync(join(labRoot, 'session-source-test-'))
      const systemHome = join(experimentRoot, 'system-home')
      const profile = join(experimentRoot, 'profile')
      const previousHome = process.env[ORCA_EXPERIMENT_CODEX_SYSTEM_HOME_ENV]
      const previousProfile = process.env.ORCA_USER_DATA_PATH
      mkdirSync(systemHome, { recursive: true })
      mkdirSync(profile, { recursive: true })
      try {
        process.env[ORCA_EXPERIMENT_CODEX_SYSTEM_HOME_ENV] = systemHome
        process.env.ORCA_USER_DATA_PATH = profile
        expect(
          resolveHostCodexSessionSourceHome({
            codexSessionSourceHome: { host: 'C:\\daily\\codex' }
          })
        ).toBe(systemHome)
      } finally {
        if (previousHome === undefined) delete process.env[ORCA_EXPERIMENT_CODEX_SYSTEM_HOME_ENV]
        else process.env[ORCA_EXPERIMENT_CODEX_SYSTEM_HOME_ENV] = previousHome
        if (previousProfile === undefined) delete process.env.ORCA_USER_DATA_PATH
        else process.env.ORCA_USER_DATA_PATH = previousProfile
        rmSync(experimentRoot, { recursive: true, force: true })
      }
    }
  )
})

describe('resolveWslCodexSessionSourceHome', () => {
  it('returns undefined when no per-distro override exists', () => {
    expect(resolveWslCodexSessionSourceHome({}, 'Ubuntu')).toBeUndefined()
    expect(
      resolveWslCodexSessionSourceHome(
        { codexSessionSourceHome: { wsl: { Debian: '/home/me/.codex' } } },
        'Ubuntu'
      )
    ).toBeUndefined()
  })

  it('resolves a per-distro override for the matching distro', () => {
    expect(
      resolveWslCodexSessionSourceHome(
        { codexSessionSourceHome: { wsl: { Ubuntu: '/home/me/.config/codex' } } },
        'Ubuntu'
      )
    ).toBe('/home/me/.config/codex')
  })

  it('matches distro names case-insensitively, mirroring WSL', () => {
    expect(
      resolveWslCodexSessionSourceHome(
        { codexSessionSourceHome: { wsl: { Ubuntu: '/home/me/.config/codex' } } },
        'ubuntu'
      )
    ).toBe('/home/me/.config/codex')
  })

  it('ignores blank per-distro overrides so the default is kept', () => {
    expect(
      resolveWslCodexSessionSourceHome(
        { codexSessionSourceHome: { wsl: { Ubuntu: '  ' } } },
        'Ubuntu'
      )
    ).toBeUndefined()
  })

  it('does not leak the host override into WSL resolution', () => {
    expect(
      resolveWslCodexSessionSourceHome(
        { codexSessionSourceHome: { host: '/custom/codex' } },
        'Ubuntu'
      )
    ).toBeUndefined()
  })
})
