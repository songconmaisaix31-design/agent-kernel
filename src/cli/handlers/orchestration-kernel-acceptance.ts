import { isDeepStrictEqual } from 'node:util'
import { readFile } from 'node:fs/promises'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime-client'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'

type ResolveCoordinator = (
  flags: Map<string, string | boolean>,
  cwd: string,
  client: Parameters<CommandHandler>[0]['client']
) => Promise<string>
export function kernelAcceptanceHandlers(
  resolveCoordinator: ResolveCoordinator
): Record<string, CommandHandler> {
  const call = async (
    client: Parameters<CommandHandler>[0]['client'],
    method: string,
    input: Record<string, unknown>
  ) => {
    try {
      return await client.call<Record<string, unknown>>(method, input, { timeoutMs: 120_000 })
    } catch (error) {
      if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
        throw new RuntimeClientError(
          'kernel_acceptance_unsupported',
          'This server does not support Kernel acceptance; no native fallback was attempted.'
        )
      }
      throw error
    }
  }
  return {
    'orchestration kernel-approve-acceptance': async ({ flags, cwd, client, json }) => {
      const from = await resolveCoordinator(flags, cwd, client)
      let checks: unknown
      try {
        checks = JSON.parse(await readFile(getRequiredStringFlag(flags, 'checks'), 'utf8'))
      } catch {
        throw new RuntimeClientError(
          'invalid_argument',
          '--checks must name a JSON file containing per-Task source/timeoutMs checks.'
        )
      }
      const result = await call(client, 'orchestration.kernelApproveAcceptance', {
        from,
        run: getRequiredStringFlag(flags, 'run'),
        checks
      })
      const policy = result.result.policy as { approvalId?: unknown; checks?: unknown } | undefined
      if (
        result.result.status !== 'approved' ||
        typeof policy?.approvalId !== 'string' ||
        !isDeepStrictEqual(policy.checks, checks)
      ) {
        throw new RuntimeClientError(
          'kernel_acceptance_unsupported',
          'Server did not confirm persisted policy approval.'
        )
      }
      printResult(result, json, () => 'Kernel acceptance policy approved.')
    },
    'orchestration kernel-accept': async ({ flags, cwd, client, json }) => {
      const result = await call(client, 'orchestration.kernelAccept', {
        from: await resolveCoordinator(flags, cwd, client),
        run: getRequiredStringFlag(flags, 'run'),
        task: getRequiredStringFlag(flags, 'task'),
        dispatch: getRequiredStringFlag(flags, 'dispatch'),
        candidate: getRequiredStringFlag(flags, 'candidate')
      })
      const acceptance = result.result.acceptance as
        | { status?: string; task?: string; dispatch?: string; candidate?: string }
        | undefined
      if (
        acceptance?.status !== 'accepted' ||
        acceptance.task !== flags.get('task') ||
        acceptance.dispatch !== flags.get('dispatch') ||
        acceptance.candidate !== flags.get('candidate')
      ) {
        throw new RuntimeClientError(
          'kernel_acceptance_unsupported',
          'Server did not confirm Kernel acceptance.'
        )
      }
      printResult(result, json, () => 'Kernel candidate accepted; not integrated.')
    }
  }
}
