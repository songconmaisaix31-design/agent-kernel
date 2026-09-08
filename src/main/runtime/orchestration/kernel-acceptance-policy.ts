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
