import { isGitRepoKind } from '../../../../shared/repo-kind'
import { isWslUncPath } from '../../../../shared/wsl-paths'
import type { OrchestrationCompatibilityEvidence } from '../../../../shared/orchestration-compatibility-evidence'
import type { OrcaRuntimeService } from '../../orca-runtime'
import {
  assertKernelWorkerPolicy,
  readKernelRunConfig
} from '../../orchestration/kernel-run-config'
import { OrchestrationError } from '../../orchestration/orchestration-error'
import type { RunRow } from '../../orchestration/types'
import type { WorkerStartInput } from './orchestration-worker-start-schema'
import { resolveRunScope } from './orchestration-run-scope'

export function requireKernelCoordinator(
  runtime: OrcaRuntimeService,
  runId: string,
  from: string,
  evidence?: OrchestrationCompatibilityEvidence
): RunRow {
  const caller =
    evidence &&
    runtime.verifyOrchestrationCompatibilityCaller(evidence, {
      currentRuntimeLaunchSufficient: true
    })
  if (!caller || caller.terminalHandle !== from) {
    throw new OrchestrationError(
      'consumer_fenced',
      'Kernel changes require the verified Run coordinator.'
    )
  }
  return resolveRunScope(runtime, {
    runId,
    callerTerminalHandle: from,
    callerPaneKey: caller.paneKey,
    requireCurrentConsumer: true,
    callerEvidence: evidence
  })
}

export function admitKernelWorkerStart(
  runtime: OrcaRuntimeService,
  runId: string,
  params: WorkerStartInput,
  evidence?: OrchestrationCompatibilityEvidence
): string | null {
  const db = runtime.getOrchestrationDb()
  const run = db.getRun(runId)
  if (!run) {
    throw new OrchestrationError('run_not_found', 'The Worker Run no longer exists.')
  }
  const config = readKernelRunConfig(run)
  if (!config) {
    return null
  }
  requireKernelCoordinator(runtime, runId, params.from, evidence)
  if (params.on || params.worktree !== 'new-top-level' || params.terminal) {
    throw new OrchestrationError(
      'kernel_unsupported_path',
      'Kernel supports only local new-top-level Workers.'
    )
  }
  assertKernelWorkerPolicy(db, params.task, run.kernel_config)
  if (
    (params.repo && params.repo !== config.repoId && params.repo !== `id:${config.repoId}`) ||
    (params.baseBranch && params.baseBranch !== config.plan.baseCommit)
  ) {
    throw new OrchestrationError(
      'kernel_start_mismatch',
      'Worker repository or base differs from the approved Run plan.'
    )
  }
  params.repo = `id:${config.repoId}`
  params.baseBranch = config.plan.baseCommit
  return run.kernel_config as string
}

export async function requireKernelLocalRepo(
  runtime: OrcaRuntimeService,
  snapshot: string | null,
  params: WorkerStartInput
): Promise<void> {
  if (snapshot === null) {
    return
  }
  const repo = await runtime.showRepo(params.repo as string)
  if (
    `id:${repo.id}` !== params.repo ||
    !isGitRepoKind(repo) ||
    repo.connectionId ||
    (repo.executionHostId && repo.executionHostId !== 'local') ||
    isWslUncPath(repo.path)
  ) {
    throw new OrchestrationError(
      'kernel_unsupported_path',
      'Kernel requires a local Git repository.'
    )
  }
}

export function recheckKernelWorkerStart(
  runtime: OrcaRuntimeService,
  runId: string,
  params: WorkerStartInput,
  snapshot: string | null,
  evidence?: OrchestrationCompatibilityEvidence
): void {
  const current = runtime.getOrchestrationDb().getRun(runId)
  if (!current || (current.kernel_config ?? null) !== snapshot) {
    throw new OrchestrationError(
      'kernel_config_changed',
      'Run policy changed during Worker preparation; retry from current state.'
    )
  }
  admitKernelWorkerStart(runtime, runId, params, evidence)
}

export function rejectKernelDispatch(runtime: OrcaRuntimeService, run: RunRow): void {
  const current = runtime.getOrchestrationDb().getRun(run.id)
  if (!current) {
    throw new OrchestrationError('run_not_found', 'The Dispatch Run no longer exists.')
  }
  if (readKernelRunConfig(current)) {
    throw new OrchestrationError(
      'kernel_unsupported_path',
      'Kernel Runs require supervised workerStart, not low-level dispatch.'
    )
  }
}
