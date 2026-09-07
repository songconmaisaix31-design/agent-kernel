import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs, validateCommandAndFlags } from '../args'
import { ORCHESTRATION_COMMAND_SPECS } from '../specs/orchestration'
import { assertKernelRunUseResponse } from './orchestration-kernel-config'

const callMock = vi.fn()
const getTerminalHandleMock = vi.hoisted(() => vi.fn())

vi.mock('../format', () => ({ printResult: vi.fn() }))
vi.mock('../selectors', () => ({ getTerminalHandle: getTerminalHandleMock }))

import { printResult } from '../format'
import { ORCHESTRATION_HANDLERS } from './orchestration'

describe('lightweight Run CLI handlers', () => {
  beforeEach(() => {
    callMock.mockReset()
    getTerminalHandleMock.mockReset()
    process.env.ORCA_TERMINAL_HANDLE = 'term_coord'
  })

  it('creates a Run with the resolved coordinator terminal', async () => {
    callMock.mockResolvedValue({
      result: { run: { id: 'run_1', objective: 'Coordinate work', consumer_generation: 1 } }
    })
    await ORCHESTRATION_HANDLERS['orchestration run-create']({
      flags: new Map<string, string | boolean>([
        ['objective', 'Coordinate work'],
        ['json', true]
      ]),
      client: { call: callMock },
      cwd: '/tmp/repo',
      json: true
    } as never)
    expect(callMock).toHaveBeenCalledWith('orchestration.runCreate', {
      objective: 'Coordinate work',
      from: 'term_coord'
    })
  })

  it('reuses the same explicit binding path for run-use and run-current', async () => {
    callMock
      .mockResolvedValueOnce({ result: { run: { id: 'run_1', objective: 'Work' } } })
      .mockResolvedValueOnce({ result: { run: { id: 'run_1', objective: 'Work' } } })
    await ORCHESTRATION_HANDLERS['orchestration run-use']({
      flags: new Map([
        ['id', 'run_1'],
        ['from', 'term_coord']
      ]),
      client: { call: callMock },
      cwd: '/tmp/repo',
      json: true
    } as never)
    await ORCHESTRATION_HANDLERS['orchestration run-current']({
      flags: new Map([['from', 'term_coord']]),
      client: { call: callMock },
      cwd: '/tmp/repo',
      json: true
    } as never)
    expect(callMock).toHaveBeenNthCalledWith(1, 'orchestration.runUse', {
      id: 'run_1',
      from: 'term_coord'
    })
    expect(callMock).toHaveBeenNthCalledWith(2, 'orchestration.runCurrent', {
      from: 'term_coord'
    })
  })

  it('passes Run pagination flags to the runtime', async () => {
    callMock.mockResolvedValue({
      result: { runs: [], nextCursor: null }
    })

    await ORCHESTRATION_HANDLERS['orchestration run-list']({
      flags: new Map([
        ['limit', '25'],
        ['cursor', 'next-page']
      ]),
      client: { call: callMock },
      json: true
    } as never)

    expect(callMock).toHaveBeenCalledWith('orchestration.runList', {
      limit: 25,
      cursor: 'next-page'
    })
  })

  it('opts into bounded Run pagination by default', async () => {
    callMock.mockResolvedValue({ result: { runs: [], nextCursor: null } })

    await ORCHESTRATION_HANDLERS['orchestration run-list']({
      flags: new Map(),
      client: { call: callMock },
      json: true
    } as never)

    expect(callMock).toHaveBeenCalledWith('orchestration.runList', {
      limit: 100,
      cursor: undefined
    })
  })

  it('passes explicit legacy takeover only when requested', async () => {
    callMock.mockResolvedValue({
      result: { run: { id: 'run_adopted', objective: 'Recovered work' } }
    })
    await ORCHESTRATION_HANDLERS['orchestration run-use']({
      flags: new Map<string, string | boolean>([
        ['id', 'run_adopted'],
        ['from', 'term_current'],
        ['takeover-legacy', true]
      ]),
      client: { call: callMock },
      cwd: '/tmp/repo',
      json: true
    } as never)

    expect(callMock).toHaveBeenCalledWith('orchestration.runUse', {
      id: 'run_adopted',
      from: 'term_current',
      takeoverLegacy: true
    })
  })

  it('accepts server owner and default limits while preserving requested Kernel values', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'orca-kernel-config-'))
    const kernel = {
      repoId: 'repo_1',
      limits: { maxConcurrent: 2 },
      plan: {
        schemaVersion: 1,
        objective: 'Test Kernel CLI',
        nonGoals: [],
        baseCommit: 'a'.repeat(40),
        tasks: [
          {
            key: 'task_1',
            owner: 'worker',
            writePaths: ['src/cli/handlers/orchestration.ts'],
            dependsOn: [],
            acceptance: ['test'],
            escalateWhen: []
          }
        ]
      }
    }
    const path = join(directory, 'kernel.json')
    await writeFile(path, JSON.stringify(kernel))
    callMock.mockResolvedValue({
      result: {
        run: {
          id: 'run_1',
          objective: 'Work',
          kernel_config: JSON.stringify({
            ...kernel,
            owner: 'runtime',
            limits: { ...kernel.limits, maxRetries: 3 }
          })
        }
      }
    })

    await ORCHESTRATION_HANDLERS['orchestration run-use']({
      flags: new Map<string, string | boolean>([
        ['id', 'run_1'],
        ['from', 'term_coord'],
        ['kernel-config', path]
      ]),
      client: { call: callMock },
      cwd: '/tmp/repo',
      json: true
    } as never)

    expect(callMock).toHaveBeenCalledWith('orchestration.runUse', {
      id: 'run_1',
      from: 'term_coord',
      kernel
    })
  })

  it.each([
    ['repoId', { repoId: 'repo_other', plan: { version: 1 }, limits: { maxConcurrent: 2 } }],
    ['plan', { repoId: 'repo_1', plan: { version: 2 }, limits: { maxConcurrent: 2 } }],
    ['requested limit', { repoId: 'repo_1', plan: { version: 1 }, limits: { maxConcurrent: 3 } }]
  ])('rejects a changed %s in persisted Kernel configuration', (_field, persisted) => {
    expect(() =>
      assertKernelRunUseResponse(
        { kernel_config: JSON.stringify(persisted) },
        { repoId: 'repo_1', plan: { version: 1 }, limits: { maxConcurrent: 2 } }
      )
    ).toThrow(/different persisted kernel_config/)
  })

  it('registers Kernel flags with the real run-use parser and command spec', () => {
    const configured = parseArgs([
      'orchestration',
      'run-use',
      '--id',
      'run_1',
      '--kernel-config',
      'kernel.json'
    ])
    const disabled = parseArgs(['orchestration', 'run-use', '--id', 'run_1', '--kernel-off'])

    expect(() => validateCommandAndFlags(ORCHESTRATION_COMMAND_SPECS, configured)).not.toThrow()
    expect(() => validateCommandAndFlags(ORCHESTRATION_COMMAND_SPECS, disabled)).not.toThrow()
    expect(configured.flags.get('kernel-config')).toBe('kernel.json')
    expect(disabled.flags.get('kernel-off')).toBe(true)
  })

  it('disables Kernel configuration only when the runtime confirms null persistence', async () => {
    callMock.mockResolvedValue({
      result: { run: { id: 'run_1', objective: 'Work', kernel_config: null } }
    })

    await ORCHESTRATION_HANDLERS['orchestration run-use']({
      flags: new Map<string, string | boolean>([
        ['id', 'run_1'],
        ['from', 'term_coord'],
        ['kernel-off', true]
      ]),
      client: { call: callMock },
      cwd: '/tmp/repo',
      json: true
    } as never)

    expect(callMock).toHaveBeenCalledWith('orchestration.runUse', {
      id: 'run_1',
      from: 'term_coord',
      kernel: null
    })
  })

  it('leaves native run-use unchanged without a Kernel flag', async () => {
    callMock.mockResolvedValue({ result: { run: { id: 'run_1', objective: 'Work' } } })

    await ORCHESTRATION_HANDLERS['orchestration run-use']({
      flags: new Map([
        ['id', 'run_1'],
        ['from', 'term_coord']
      ]),
      client: { call: callMock },
      cwd: '/tmp/repo',
      json: true
    } as never)

    expect(callMock).toHaveBeenCalledWith('orchestration.runUse', {
      id: 'run_1',
      from: 'term_coord'
    })
  })

  it('rejects missing files, invalid JSON, and mutually exclusive Kernel flags before RPC', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'orca-kernel-config-'))
    const invalidPath = join(directory, 'invalid.json')
    await writeFile(invalidPath, '{')
    const invoke = (flags: Map<string, string | boolean>) =>
      ORCHESTRATION_HANDLERS['orchestration run-use']({
        flags,
        client: { call: callMock },
        cwd: '/tmp/repo',
        json: true
      } as never)

    await expect(
      invoke(
        new Map<string, string | boolean>([
          ['id', 'run_1'],
          ['from', 'term_coord'],
          ['kernel-config', 'missing.json']
        ])
      )
    ).rejects.toMatchObject({ code: 'invalid_argument' })
    await expect(
      invoke(
        new Map<string, string | boolean>([
          ['id', 'run_1'],
          ['from', 'term_coord'],
          ['kernel-config', invalidPath]
        ])
      )
    ).rejects.toMatchObject({ code: 'invalid_argument' })
    await expect(
      invoke(
        new Map<string, string | boolean>([
          ['id', 'run_1'],
          ['from', 'term_coord'],
          ['kernel-config', invalidPath],
          ['kernel-off', true]
        ])
      )
    ).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(callMock).not.toHaveBeenCalled()
  })

  it('rejects an old runtime that silently ignores an explicit Kernel change', async () => {
    callMock.mockResolvedValue({ result: { run: { id: 'run_1', objective: 'Work' } } })

    await expect(
      ORCHESTRATION_HANDLERS['orchestration run-use']({
        flags: new Map<string, string | boolean>([
          ['id', 'run_1'],
          ['from', 'term_coord'],
          ['kernel-off', true]
        ]),
        client: { call: callMock },
        cwd: '/tmp/repo',
        json: true
      } as never)
    ).rejects.toMatchObject({ code: 'kernel_config_unsupported' })
  })
})

describe('orchestration reset CLI handler', () => {
  beforeEach(() => {
    callMock.mockReset().mockResolvedValue({ result: { reset: 'all' } })
  })
  const invoke = (flags: Map<string, string | boolean>) =>
    ORCHESTRATION_HANDLERS['orchestration reset']({
      flags,
      client: { call: callMock },
      json: true
    } as never)

  it('rejects a bare reset before calling the runtime', async () => {
    await expect(invoke(new Map())).rejects.toMatchObject({
      code: 'invalid_argument',
      message: 'Choose exactly one reset scope: --all, --tasks, or --messages.'
    })
    expect(callMock).not.toHaveBeenCalled()
  })

  it('sends only the tasks scope for --tasks', async () => {
    await invoke(new Map([['tasks', true]]))
    expect(callMock).toHaveBeenCalledWith('orchestration.reset', {
      all: undefined,
      tasks: true,
      messages: undefined
    })
  })

  it('sends only the all scope for --all', async () => {
    await invoke(new Map([['all', true]]))
    expect(callMock).toHaveBeenCalledWith('orchestration.reset', {
      all: true,
      tasks: undefined,
      messages: undefined
    })
  })

  it.each([
    new Map<string, string | boolean>([
      ['tasks', true],
      ['messages', true]
    ]),
    new Map<string, string | boolean>([
      ['all', true],
      ['tasks', true]
    ])
  ])('rejects multiple reset scopes before calling the runtime', async (flags) => {
    await expect(invoke(flags)).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(callMock).not.toHaveBeenCalled()
  })
})

describe('orchestration task-list brief output', () => {
  it('requests server-side brief and falls back client-side for older runtimes', async () => {
    callMock.mockReset().mockResolvedValue({
      result: {
        tasks: [{ id: 'task_1', spec: `First line\n${'detail '.repeat(40)}`, status: 'ready' }],
        count: 1
      }
    })
    vi.mocked(printResult).mockClear()
    await ORCHESTRATION_HANDLERS['orchestration task-list']({
      flags: new Map([['brief', true]]),
      client: { call: callMock },
      json: true
    } as never)
    expect(callMock).toHaveBeenCalledWith(
      'orchestration.taskList',
      expect.objectContaining({ brief: true })
    )
    const response = vi.mocked(printResult).mock.calls[0]?.[0] as {
      result: { tasks: { spec: string; spec_truncated: boolean }[] }
    }
    expect(response.result.tasks[0].spec).toHaveLength(160)
    expect(response.result.tasks[0].spec_truncated).toBe(true)
  })

  it('passes server-abbreviated rows through untouched', async () => {
    const serverTasks = [
      { id: 'task_1', spec: 'already brief…', status: 'ready', spec_truncated: true }
    ]
    callMock.mockReset().mockResolvedValue({ result: { tasks: serverTasks, count: 1 } })
    vi.mocked(printResult).mockClear()
    await ORCHESTRATION_HANDLERS['orchestration task-list']({
      flags: new Map([['brief', true]]),
      client: { call: callMock },
      json: true
    } as never)
    const response = vi.mocked(printResult).mock.calls[0]?.[0] as {
      result: { tasks: { spec: string; spec_truncated: boolean }[] }
    }
    expect(response.result.tasks).toBe(serverTasks)
  })
})
