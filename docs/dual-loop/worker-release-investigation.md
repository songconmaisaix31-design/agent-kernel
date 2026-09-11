# W-LIFE worker release investigation

Round: `dual-20260911-103612`
Runtime observed: `9eff2735-3c29-48e2-8ce4-2446b5513f2b` / Orca `1.4.199`
Source reviewed: `01bd406abb787a6b2fd8064e66bcefb75971b8ff` / `1.4.188` (`v1.4.188-72-g01bd406ab`)

## Finding

This is not evidence that a worker process was released incorrectly, nor evidence
for a scheduler redesign. The two W-CHECK readings use distinct proofs:

- `ctx_7c6722a50805` is an exact local worker and `worker-show` reports
  `observation.status: exited`, but its terminal has
  `exitCause: { kind: unknown, reason: stop_unverified }`.
- Its final resource remains `owned` / `retained` with
  `retainedReason: identity_unproven`; its projection reports
  `liveness.verdict: unverifiable`, `reason: missing_status`.
- `ctx_3d53d8a356e8` is also an exact local worker, but its resource is
  durably `released` with `releaseCompletedAt: 2026-09-11 02:43:44`.

`observation.exited` is not sufficient to mark W-CHECK released. In the reviewed
source, `inspectWorkerTerminal` returns `exited` when an *exact* terminal has
`connected === false` and there is no stronger liveness verdict
(`src/main/runtime/rpc/methods/orchestration-worker-observation.ts:34-62`).
That is terminal/pane evidence. The release retry independently calls
`inspectTerminalProcessIncarnationLiveness` and settles only if the owning-host
process inventory says the recorded incarnation is `exited`
(`orchestration-worker-release.ts:32-72`). Missing identity, missing host scope,
timeout, or an unavailable inventory return `unverifiable`, not `exited`
(`src/main/runtime/orca-runtime.ts:17336-17352`).

Consequently the observed W-CHECK state is fail-closed: the initial close could
not confirm its PTY stop (`stop_unverified`), and the retry lacked the separate,
owning-host incarnation-exit proof required to turn a retained resource into a
released one. A terminal disappearing or becoming disconnected must not be
treated as process exit. This preserves the SSH boundary too: only the execution
host can establish `live` / `unverifiable` / `exited`; neither a client projection
nor a lost connection may substitute for that evidence.

## Why this is not a source regression found here

The source base predates the observed runtime by eleven app releases. It already
contains commit `1251ec28d` (`fix: reconcile failed worker release after confirmed
incarnation exit`), which applies the same reconciliation after both a retained
request and a release-completion failure. Its regression test starts from the
same durable shape—failed/settled dispatch, retained `identity_unproven`, stale
terminal handle—and expects release only after the exact process-incarnation
inventory is empty (`orchestration-worker-release-failed-exit.test.ts:65-86`).

The W-CHECK runtime transcript available through `worker-show` proves the
terminal-level observation and final resource state, but does not expose the
retry's `inspectTerminalProcessIncarnationLiveness` result or the individual
lease predicate that failed. It therefore cannot establish whether 1.4.199
received `unverifiable`, `live`, or a changed-owner/host guard result. Attributing
that implementation detail to the 1.4.188 checkout would be unsound.

## Production recommendation

No production source change is proposed from this evidence. In particular, do
not relax `identity_unproven`, infer exit from `connected: false`, or reconcile
from the projection's `missing_status`; each would violate the required
fail-closed, host-owned identity contract.

If the same behavior is to be investigated in the exact 1.4.199 source/build,
the smallest meaningful regression is in
`src/main/runtime/rpc/methods/orchestration-worker-release-failed-exit.test.ts`:
exercise a real release-unknown retry with an exact disconnected pane and assert
both outcomes. With unavailable/malformed owning-host inventory it must remain
`retained` / `identity_unproven`; with an empty inventory for the identical
host-scope and process incarnation it must become `released` without calling a
broad terminal close. That validates the boundary rather than weakening it.

## Validation and limits

- Read-only stable CLI: `worker-show` for both specified dispatches and
  `worker-list --run run_f7b390c7a33e` confirmed the final durable states.
- Static source and history review confirmed source version `1.4.188`, base SHA,
  reconciliation implementation, and its focused test.
- Focused Vitest command was attempted but not executable: this worktree has no
  `node_modules`, and `pnpm exec vitest` returned `Command "vitest" not found`.
  No dependency installation was performed.
