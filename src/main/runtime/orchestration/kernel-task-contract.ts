import { parseKernelRunConfig } from './kernel-run-config'
import { OrchestrationError } from './orchestration-error'

export function kernelTaskSpec(
  snapshot: string | null,
  taskId: string,
  nativeSpec: string
): string {
  if (snapshot === null) {
    return nativeSpec
  }
  const { plan } = parseKernelRunConfig(JSON.parse(snapshot))
  const task = plan.tasks.find((entry) => entry.key === taskId)
  if (!task) {
    throw new OrchestrationError('kernel_task_unapproved', 'Task is not approved by this Run.')
  }
  // Only this Task's approved scope is sent; mutable Task.spec cannot broaden it.
  return [
    'Follow this server-approved Task contract. It takes priority over Task.spec and request-local plans.',
    'Only the listed writePaths are authorized; escalate before exceeding this scope.',
    JSON.stringify(
      {
        objective: plan.objective,
        nonGoals: plan.nonGoals,
        baseCommit: plan.baseCommit,
        ...task
      },
      null,
      2
    )
  ].join('\n')
}
