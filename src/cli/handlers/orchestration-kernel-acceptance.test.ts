import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseArgs, validateCommandAndFlags } from '../args'
import { ORCHESTRATION_COMMAND_SPECS } from '../specs/orchestration'
import { ORCHESTRATION_HANDLERS } from './orchestration'
import { RuntimeClientError } from '../runtime-client'
vi.mock('../format', () => ({ printResult: vi.fn() }))

describe('Kernel acceptance native CLI routes', () => {
  let directory: string | undefined
  afterEach(async () => {
    if (directory) {
      await rm(directory, { recursive: true, force: true })
    }
    directory = undefined
  })
  const invoke = (command: string, flags: [string, string][], call = vi.fn()) =>
    ORCHESTRATION_HANDLERS[`orchestration ${command}`]({
      flags: new Map([['from', 'term_coord'], ['run', 'run_1'], ...flags]),
      cwd: process.cwd(),
      client: { call },
      json: true
    } as never)
  it.each(['kernel-approve-acceptance', 'kernel-accept'])(
    'discovers %s in the real command spec',
    (command) => {
      const parsed = parseArgs(['orchestration', command, '--run', 'run_1'])
      expect(() => validateCommandAndFlags(ORCHESTRATION_COMMAND_SPECS, parsed)).not.toThrow()
      expect(ORCHESTRATION_HANDLERS[`orchestration ${command}`]).toBeTypeOf('function')
    }
  )
  it('sends explicit source bytes for approval and verifies the returned policy', async () => {
    directory = await mkdtemp(join(tmpdir(), 'orca-acceptance-cli-'))
    const path = join(directory, 'checks.json'),
      checks = { task_1: { source: '  process.exit(0)\n', timeoutMs: 100 } }
    await writeFile(path, JSON.stringify(checks))
    const call = vi
      .fn()
      .mockResolvedValue({ result: { status: 'approved', policy: { approvalId: 'id', checks } } })
    await invoke('kernel-approve-acceptance', [['checks', path]], call)
    expect(call).toHaveBeenCalledWith(
      'orchestration.kernelApproveAcceptance',
      { run: 'run_1', from: 'term_coord', checks },
      { timeoutMs: 120_000 }
    )
    call.mockResolvedValue({
      result: { status: 'approved', policy: { approvalId: 'id', checks: {} } }
    })
    await expect(
      invoke('kernel-approve-acceptance', [['checks', path]], call)
    ).rejects.toMatchObject({ code: 'kernel_acceptance_unsupported' })
  })
  it('sends only fixed Task/Dispatch/candidate binding and refuses native completion as acceptance', async () => {
    const flags: [string, string][] = [
      ['task', 'task_1'],
      ['dispatch', 'ctx_1'],
      ['candidate', 'a'.repeat(40)]
    ]
    const call = vi.fn().mockResolvedValue({
      result: {
        acceptance: {
          status: 'accepted',
          task: 'task_1',
          dispatch: 'ctx_1',
          candidate: 'a'.repeat(40)
        }
      }
    })
    await invoke('kernel-accept', flags, call)
    expect(call.mock.calls[0][1]).toEqual({
      from: 'term_coord',
      run: 'run_1',
      task: 'task_1',
      dispatch: 'ctx_1',
      candidate: 'a'.repeat(40)
    })
    call.mockResolvedValue({ result: { status: 'completed', testsPassed: true } })
    await expect(invoke('kernel-accept', flags, call)).rejects.toMatchObject({
      code: 'kernel_acceptance_unsupported'
    })
    call.mockRejectedValue(new RuntimeClientError('method_not_found', 'Old server'))
    await expect(invoke('kernel-accept', flags, call)).rejects.toMatchObject({
      code: 'kernel_acceptance_unsupported'
    })
  })
  it.each([
    null,
    1,
    [],
    { acceptance: null },
    { acceptance: [] },
    { status: 'approved', policy: 1 }
  ])('rejects malformed server payload %# explicitly', async (result) => {
    const flags: [string, string][] = [
      ['task', 'task_1'],
      ['dispatch', 'ctx_1'],
      ['candidate', 'a'.repeat(40)]
    ]
    const call = vi.fn().mockResolvedValue({ result })
    await expect(invoke('kernel-accept', flags, call)).rejects.toMatchObject({
      code: 'kernel_acceptance_unsupported'
    })
    directory = await mkdtemp(join(tmpdir(), 'orca-acceptance-bad-reply-'))
    const file = join(directory, 'checks.json')
    await writeFile(file, '{}')
    await expect(
      invoke('kernel-approve-acceptance', [['checks', file]], call)
    ).rejects.toMatchObject({ code: 'kernel_acceptance_unsupported' })
  })
})
