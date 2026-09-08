import { z } from 'zod'
import { OrchestrationError } from '../../orchestration/orchestration-error'
import { defineMethod, type RpcMethod } from '../core'
import { requiredString } from '../schemas'
import { describeUnconfirmedAgentStop } from '../../../../shared/pty-liveness-verdict'
import { ORCHESTRATION_WORKER_STOP_VERDICT_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import type { RuntimeStatus } from '../../../../shared/runtime-types'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { OrchestrationDb } from '../../orchestration/db'
import type { WorkerTerminalResourceRow } from '../../orchestration/worker-terminal-ownership'
import {
  inspectWorkerTerminal,
  resolvePinnedFederatedServer
} from './orchestration-worker-observation'

const WorkerDispatchParams = z.object({ dispatch: requiredString('Missing --dispatch') })

export const ORCHESTRATION_WORKER_STOP_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'orchestration.workerStop',
    params: WorkerDispatchParams,
    handler: async (params, { runtime, orchestrationMutation }) => {
      const db = runtime.getOrchestrationDb()
      const federated = db.getFederatedDispatch(params.dispatch)
      if (federated) {
        if (!orchestrationMutation) {
          throw new OrchestrationError(
            'invalid_argument',
            'Remote worker-stop requires a durable retry request.'
          )
        }
        const server = resolvePinnedFederatedServer(runtime, federated)
        const begun = db.beginWorkerStop(params.dispatch, runtime.getRuntimeId())
        if (begun.disposition === 'in_progress') {
          return unknownReceipt(params.dispatch, begun.worker, 'none')
        }
        if (begun.disposition === 'already_settled') {
          return settledReceipt(params.dispatch, begun.worker.state)
        }
        try {
          const status = (await runtime.callOrchestrationWorkerServer(
            server.environmentId,
            'status.get',
            undefined,
            30_000
          )) as RuntimeStatus
          if (
            !status.capabilities?.includes(ORCHESTRATION_WORKER_STOP_VERDICT_RUNTIME_CAPABILITY)
          ) {
            return unknownReceipt(
              params.dispatch,
              db.markWorkerStopUnknown(
                params.dispatch,
                `Connected server ${server.name} cannot prove the worker stop outcome.`
              ),
              'none'
            )
          }
          const remote = (await runtime.callOrchestrationWorkerServer(
            server.environmentId,
            'orchestration.federationStop',
            { dispatchId: params.dispatch },
            30_000,
            { orchestrationRequestId: orchestrationMutation.requestId }
          )) as RemoteStopReceipt
          if (remote.state === 'stopped') {
            const worker = db.reconcileFederatedWorkerStop(params.dispatch)
            return {
              dispatchId: params.dispatch,
              state: worker.state,
              alreadySettled: remote.alreadySettled,
              processAction: remote.processAction,
              close: remote.close
            }
          }
          if (remote.state === 'succeeded' || remote.state === 'failed') {
            db.resumeFederatedWorkerForTerminalRelay(params.dispatch)
            await runtime
              .syncOrchestrationFederatedDispatchAfterCurrent(params.dispatch)
              .catch(() => undefined)
            return {
              dispatchId: params.dispatch,
              state: db.getWorkerDispatch(params.dispatch)?.state ?? remote.state,
              alreadySettled: true,
              processAction: 'none'
            }
          }
          return unknownReceipt(
            params.dispatch,
            db.markWorkerStopUnknown(
              params.dispatch,
              remote.lastError ?? `The worker server returned ${remote.state}.`
            ),
            remote.processAction
          )
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          return unknownReceipt(
            params.dispatch,
            db.markWorkerStopUnknown(params.dispatch, reason),
            'unknown'
          )
        }
      }

      const begun = db.beginWorkerStop(params.dispatch, runtime.getRuntimeId())
      if (begun.disposition === 'in_progress') {
        return unknownReceipt(params.dispatch, begun.worker, 'none')
      }
      if (begun.disposition === 'already_settled') {
        return settledReceipt(params.dispatch, begun.worker.state)
      }
      if (begun.disposition === 'context_only') {
        if (!begun.alreadySettled) {
          runtime.notifyMessageArrived(`dispatch:${params.dispatch}`, 'status')
        }
        return {
          dispatchId: params.dispatch,
          state: begun.state,
          alreadySettled: begun.alreadySettled,
          processAction: 'none' as const,
          warning: contextOnlyStopWarning(begun)
        }
      }
      const handle = begun.worker.agent_terminal_handle
      const pinnedResource = db.getWorkerTerminalResourceByOwner(params.dispatch)
      const unconfirmed = (reason: string, action: string) =>
        unknownReceipt(
          params.dispatch,
          db.markWorkerStopUnknown(params.dispatch, reason),
          action,
          reason
        )
      if (!handle) {
        return unconfirmed('The Dispatch has no recorded agent terminal.', 'none')
      }
      const isCurrent = runtime.captureSupervisedTerminalCloseGuard(handle, () => {
        const current = db.getWorkerTerminalResourceByOwner(params.dispatch)
        return Boolean(
          current &&
          pinnedResource &&
          workerStopBindingIsCurrent(runtime, db, params.dispatch, current, pinnedResource)
        )
      })
      const observation = await inspectWorkerTerminal(runtime, db, params.dispatch)
      // Why `unverifiable` still proceeds: losing contact is a reason to report
      // the outcome honestly, never a reason to stop trying to stop the worker.
      if (
        !observation.exact ||
        (observation.status !== 'live' && observation.status !== 'unverifiable')
      ) {
        return unconfirmed(
          `The recorded worker process is ${observation.status}; no terminal was closed.`,
          'none'
        )
      }
      const resource = db.getWorkerTerminalResourceByOwner(params.dispatch)
      if (!resource || resource.ownership_state !== 'owned') {
        const ownership = resource?.ownership_state ?? 'unproven'
        return unconfirmed(`The worker terminal is ${ownership}; no terminal was closed.`, 'none')
      }
      if (
        !pinnedResource ||
        !workerStopBindingIsCurrent(runtime, db, params.dispatch, resource, pinnedResource) ||
        !isCurrent()
      ) {
        const reason =
          'The worker terminal identity, provider, or ownership changed; no terminal was closed.'
        return unconfirmed(reason, 'none')
      }
      try {
        const close = await runtime.closeTerminal(handle, { isCurrent })
        if (close.supervisedCloseRejected) {
          return unconfirmed(`${close.ptyStopReason}; no terminal was closed.`, 'none')
        }
        if (!close.ptyKilled) {
          // The tab is retired, but the agent process was never confirmed stopped —
          // settling here is the false success this receipt exists to prevent.
          return unconfirmed(describeUnconfirmedAgentStop(close), 'closed_agent_terminal')
        }
        const worker = db.settleWorkerStop(params.dispatch)
        runtime.notifyMessageArrived(`dispatch:${params.dispatch}`, 'status')
        return {
          dispatchId: params.dispatch,
          state: worker.state,
          alreadySettled: false,
          processAction: 'closed_agent_terminal',
          close
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        return unconfirmed(reason, 'unknown')
      }
    }
  })
]

type RemoteStopReceipt = {
  state: string
  alreadySettled: boolean
  processAction: string
  close?: unknown
  lastError?: string | null
}

function settledReceipt(dispatchId: string, state: string) {
  return { dispatchId, state, alreadySettled: true, processAction: 'none' }
}

function contextOnlyStopWarning(result: {
  state: string
  alreadySettled: boolean
  releasedCurrentTask: boolean
}): string {
  if (result.alreadySettled) {
    return `Dispatch was already ${result.state}; no terminal process changed.`
  }
  return result.releasedCurrentTask
    ? 'The assignment was stopped without closing its unsupervised terminal process.'
    : 'The superseded assignment was stopped without changing the current Task or terminal process.'
}

function unknownReceipt(
  dispatchId: string,
  worker: { state: string; last_error: string | null },
  processAction: string,
  reason?: string
) {
  return {
    dispatchId,
    state: worker.state,
    alreadySettled: false,
    processAction,
    lastError: reason ?? worker.last_error
  }
}

function workerStopBindingIsCurrent(
  runtime: OrcaRuntimeService,
  db: OrchestrationDb,
  dispatchId: string,
  resource: WorkerTerminalResourceRow,
  pinned: WorkerTerminalResourceRow
): boolean {
  const worker = db.getWorkerDispatch(dispatchId)
  const dispatch = db.getDispatchContextById(dispatchId)
  const authority = runtime.getOrchestrationDispatchAuthority(resource.terminal_handle)
  return Boolean(
    resource.id === pinned.id &&
    resource.owner_dispatch_id === pinned.owner_dispatch_id &&
    resource.terminal_handle === pinned.terminal_handle &&
    resource.pane_key === pinned.pane_key &&
    resource.process_incarnation === pinned.process_incarnation &&
    resource.host_scope === pinned.host_scope &&
    resource.worktree_id === pinned.worktree_id &&
    worker?.state === 'stopping' &&
    worker.agent_terminal_handle === resource.terminal_handle &&
    dispatch &&
    db.getDispatchContext(dispatch.task_id)?.id === dispatchId &&
    resource.owner_dispatch_id === dispatchId &&
    resource.ownership_state === 'owned' &&
    ['not_requested', 'retained'].includes(resource.release_state) &&
    authority &&
    resource.host_scope === JSON.stringify(authority.hostScope) &&
    authority.terminalHandle === resource.terminal_handle &&
    authority.processIncarnation === resource.process_incarnation &&
    db.isDispatchProcessCurrent({
      dispatchId,
      paneKey: resource.pane_key,
      processIncarnation: resource.process_incarnation
    }) &&
    db.isDispatchProcessCurrent({
      dispatchId,
      paneKey: authority.paneKey,
      processIncarnation: authority.processIncarnation
    }) &&
    db.isDispatchProcessCurrent({
      dispatchId,
      paneKey: runtime.getTerminalPaneKey(resource.terminal_handle),
      processIncarnation: runtime.getTerminalProcessIncarnation(resource.terminal_handle)
    }) &&
    !db.workerTerminalResourceHasIdentityConflict(resource.id)
  )
}
