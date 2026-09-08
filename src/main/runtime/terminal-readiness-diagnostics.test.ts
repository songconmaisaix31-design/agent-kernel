import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  TerminalReadinessDiagnostics,
  type ReadinessDiagnosticSnapshot
} from './terminal-readiness-diagnostics'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function setup(config: unknown = { terminal: 'term-test', maxSnapshots: 1 }) {
  const root = mkdtempSync(join(tmpdir(), 'orca-readiness-'))
  roots.push(root)
  const directory = join(root, 'private-readiness')
  mkdirSync(directory)
  writeFileSync(join(directory, 'capture.json'), JSON.stringify(config))
  const env = {
    ORCA_EXPERIMENT_READINESS_DIAGNOSTICS: '1',
    ORCA_EXPERIMENT_CODEX_SYSTEM_HOME: root,
    ORCA_DEV_REPO_ROOT: root,
    ORCA_USER_DATA_PATH: root
  }
  return { directory, env }
}

function snapshot(): ReadinessDiagnosticSnapshot {
  return {
    runtimeId: 'runtime-test',
    capturedAt: 123,
    phase: 'waitForTerminal',
    identity: { handle: 'term-test', ptyId: 'pty-test', bindingAfter: 'pty-test' },
    inputs: {
      tailBuffer: ['line one', 'line two'],
      tailPartialLine: 'partial',
      preview: 'preview',
      waitText: 'line one\nline two\npartial'
    },
    state: { lifecycle: null },
    result: { satisfied: false, blockedReason: 'codex-interactive-prompt' }
  }
}

describe('private terminal readiness diagnostics', () => {
  it('does no state reads while disabled or outside the experiment', () => {
    const read = vi.fn(snapshot)
    new TerminalReadinessDiagnostics({}).record('term-test', read)
    new TerminalReadinessDiagnostics({ ORCA_EXPERIMENT_READINESS_DIAGNOSTICS: '1' }).record(
      'term-test',
      read
    )
    expect(read).not.toHaveBeenCalled()
  })

  it('captures only the configured terminal, once, preserving real newlines and order', () => {
    const { directory, env } = setup({ terminal: 'term_test', maxSnapshots: 1 })
    const recorder = new TerminalReadinessDiagnostics(env)
    const read = vi.fn(snapshot)
    recorder.record('term_other', read)
    recorder.record('term_test', read)
    recorder.record('term_test', read)
    expect(read).toHaveBeenCalledTimes(1)
    const saved = JSON.parse(readFileSync(join(directory, 'runtime-test-1.json'), 'utf8'))
    expect(saved.inputs).toEqual(snapshot().inputs)
    expect(saved.redactionChangedInputs).toBe(false)
    expect(saved.source).toContain('not a screen capture')
  })

  it.each([0, -1, 6, 1.5, '1'])('rejects invalid capture budget %s', (maxSnapshots) => {
    const { env } = setup({ terminal: 'term_test', maxSnapshots })
    const read = vi.fn(snapshot)
    new TerminalReadinessDiagnostics(env).record('term_test', read)
    expect(read).not.toHaveBeenCalled()
  })

  it('redacts secret text before writing and flags non-byte-exact replay', () => {
    const { directory, env } = setup({ terminal: 'term_test', maxSnapshots: 1 })
    const input = snapshot()
    input.inputs.tailBuffer = [
      'API_KEY=private-test-value',
      'Authorization: Bearer private-bearer',
      '{"access_token":"private-json-value"}',
      "$env:ORCA_LAUNCH_TOKEN='private-shell-value'"
    ]
    new TerminalReadinessDiagnostics(env).record('term_test', () => input)
    const saved = readFileSync(join(directory, 'runtime-test-1.json'), 'utf8')
    expect(saved).not.toContain('private-test-value')
    expect(saved).not.toContain('private-bearer')
    expect(saved).not.toContain('private-json-value')
    expect(saved).not.toContain('private-shell-value')
    expect(JSON.parse(saved).redactionChangedInputs).toBe(true)
    expect(input.inputs.tailBuffer[0]).toBe('API_KEY=private-test-value')
  })

  it('contains stale identity/read exceptions and spends the attempt without retrying', () => {
    const { directory, env } = setup({ terminal: 'term_test', maxSnapshots: 1 })
    const read = vi.fn(() => {
      throw new Error('terminal_handle_stale')
    })
    const recorder = new TerminalReadinessDiagnostics(env)
    expect(() => recorder.record('term_test', read)).not.toThrow()
    recorder.record('term_test', read)
    expect(read).toHaveBeenCalledTimes(1)
    expect(readdirSync(directory)).toEqual(['capture.json'])
  })

  it('never replaces existing evidence or propagates a sink error', () => {
    const { directory, env } = setup({ terminal: 'term_test', maxSnapshots: 1 })
    const file = join(directory, 'runtime-test-1.json')
    writeFileSync(file, 'preserved')
    expect(() => new TerminalReadinessDiagnostics(env).record('term_test', snapshot)).not.toThrow()
    expect(readFileSync(file, 'utf8')).toBe('preserved')
  })
})
