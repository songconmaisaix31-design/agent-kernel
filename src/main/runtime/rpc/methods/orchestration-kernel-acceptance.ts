import { isDeepStrictEqual } from 'node:util'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { RpcRequest } from '../core'
import { readKernelRunConfig } from '../../orchestration/kernel-run-config'
import { OrchestrationError } from '../../orchestration/orchestration-error'
import {
  kernelAcceptanceBinding,
  kernelAcceptanceLocation
} from '../../orchestration/kernel-candidate-acceptance'
import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import { requireKernelCoordinator } from './orchestration-kernel-admission'
import {
  acceptKernelCandidate,
  approveKernelAcceptance
} from '../../orchestration/kernel-candidate-acceptance'

const Caller = { run: z.string().min(1), from: z.string().min(1) }
export const ORCHESTRATION_KERNEL_ACCEPTANCE_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'orchestration.kernelApproveAcceptance',
    params: z.object({ ...Caller, checks: z.unknown() }).strict(),
    handler: (params, ctx) =>
      approveKernelAcceptance(
        {
          runtime: ctx.runtime,
          authorize: () =>
            requireKernelCoordinator(
              ctx.runtime,
              params.run,
              params.from,
              ctx.orchestrationCompatibilityEvidence
            )
        },
        params.checks
      )
  }),
  defineMethod({
    name: 'orchestration.kernelAccept',
    params: z
      .object({
        ...Caller,
        task: z.string().min(1),
        dispatch: z.string().min(1),
        candidate: z.string().min(1)
      })
      .strict(),
    handler: (params, ctx) =>
      acceptKernelCandidate(
        {
          runtime: ctx.runtime,
          signal: ctx.signal,
          authorize: () =>
            requireKernelCoordinator(
              ctx.runtime,
              params.run,
              params.from,
              ctx.orchestrationCompatibilityEvidence
            )
        },
        params
      )
  })
]

/** Revalidate durable/in-flight replies without executing another verifier or approving again. */
export async function revalidateKernelAcceptanceReply(
  runtime: OrcaRuntimeService,
  request: RpcRequest,
  result: unknown
): Promise<void> {
  if (
    !['orchestration.kernelApproveAcceptance', 'orchestration.kernelAccept'].includes(
      request.method
    )
  ) {
    return
  }
  const params = request.params as {
    run: string
    from: string
    task: string
    dispatch: string
    candidate: string
  }
  const context = {
    runtime,
    authorize: () =>
      requireKernelCoordinator(
        runtime,
        params.run,
        params.from,
        request.orchestrationCompatibilityEvidence
      )
  }
  const run = context.authorize()
  const reply = result as { policy?: unknown; runGeneration?: unknown; acceptance?: unknown }
  const reject = () => {
    throw new OrchestrationError(
      'kernel_acceptance_stale',
      'The cached response no longer has a current valid binding.'
    )
  }
  if (request.method === 'orchestration.kernelApproveAcceptance') {
    if (
      run.consumer_generation !== reply.runGeneration ||
      !isDeepStrictEqual(readKernelRunConfig(run)?.acceptancePolicy, reply.policy)
    ) {
      reject()
    }
    return
  }
  const initial = kernelAcceptanceBinding(context, params)
  const location = await kernelAcceptanceLocation(context, params, initial)
  const current = kernelAcceptanceBinding(context, params)
  const stored = current.task.kernel_acceptance ? JSON.parse(current.task.kernel_acceptance) : null
  if (
    !stored ||
    stored.status !== 'accepted' ||
    stored.binding !== initial.stamp ||
    current.stamp !== initial.stamp ||
    stored.location !== location.identity ||
    stored.candidate !== params.candidate ||
    !isDeepStrictEqual(stored, reply.acceptance)
  ) {
    reject()
  }
}
