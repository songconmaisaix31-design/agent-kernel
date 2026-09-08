import { OrchestrationError } from './orchestration-error'
import { z } from 'zod'

// Approved code is trusted executable input, never taken from the candidate or Plan.acceptance.
const Check = z
  .object({
    source: z
      .string()
      .min(1)
      .max(32_768)
      .refine((text) => text.trim().length > 0),
    timeoutMs: z.number().int().min(1).max(30_000)
  })
  .strict()
export const AcceptanceChecks = z.record(z.string().min(1), Check).refine((checks) => {
  const values = Object.values(checks)
  return (
    values.length > 0 &&
    values.length <= 16 &&
    values.reduce((sum, check) => sum + check.timeoutMs, 0) <= 60_000 &&
    values.reduce((sum, check) => sum + Buffer.byteLength(check.source), 0) <= 131_072
  )
}, 'Approve 1–16 checks, at most 60 seconds and 128 KiB total.')
export const StoredAcceptancePolicy = z
  .object({
    approvalId: z.string().uuid(),
    checks: AcceptanceChecks
  })
  .strict()
export type AcceptancePolicy = z.infer<typeof StoredAcceptancePolicy>

const StartBinding = z.object({
  repo: z.string(),
  baseBranch: z.string(),
  worktree: z.literal('new-top-level')
})
export const AcceptedBinding = z
  .object({
    status: z.literal('accepted'),
    task: z.string(),
    dispatch: z.string(),
    candidate: z.string(),
    approvalId: z.string().uuid(),
    token: z.string().uuid(),
    binding: z.string(),
    location: z.string(),
    paths: z.array(z.string()),
    check: z.object({ exitCode: z.literal(0), stdout: z.string(), stderr: z.string() })
  })
  .passthrough()
const StoredRecord = z.discriminatedUnion('status', [
  AcceptedBinding,
  z.object({ status: z.literal('checking') }).passthrough(),
  z.object({ status: z.literal('rejected') }).passthrough()
])
function parseStored<T>(schema: z.ZodType<T>, text: string, code: string): T {
  try {
    return schema.parse(JSON.parse(text))
  } catch {
    throw new OrchestrationError(code, 'Malformed persisted Kernel binding.')
  }
}
export const parseKernelStartBinding = (text: string) =>
  parseStored(StartBinding, text, 'kernel_dispatch_mismatch')
export const readKernelAcceptanceRecord = (text: string | null | undefined) =>
  text == null ? null : parseStored(StoredRecord, text, 'kernel_acceptance_invalid')
