# Codex canceled-prompt readiness repair

## Scope and source comparison

The observed D0 process ran Orca 1.4.188 source `3538e109`. Its retained terminal state still reported `codex-interactive-prompt` after Codex printed an explicit canceled-command status, `Conversation interrupted`, and a new `Ask Codex to do anything` composer.

Candidate `4b207b1a4a442cfe68ba08037eb52cf7a74ad651` already differs from that source: it recognizes only the complete dismissed rate-limit reminder sequence. The D0 command-cancellation sequence contains neither that reminder nor the legacy `OpenAI Codex` ready header, so the candidate still reproduced a blocked `getTerminalInteractiveWait` result and could reject guarded prompt submission.

## Repair

The first repair in `3b97f0e3118e6fb21771b74e14a496b4fade2a24` was incomplete: it trusted the order of the cancellation markers after any blocked prompt. Independent QA showed that an active permission menu followed by model prose quoting the three UI lines incorrectly cleared the wait and allowed a bracketed prompt paste plus Enter.

The corrected detector clears a prior Codex command confirmation only when these causally adjacent, line-anchored UI states form one terminal section:

1. `Would you like to run this command?` and its exact `Press enter to confirm` line;
2. an immediately following `✗ You canceled the request to run` or `✗ You rejected the request to run` line;
3. an optional real `• Ran` receipt and its tree-drawing continuation lines;
4. `■ Conversation interrupted - tell the model what to do differently`;
5. a standalone `Ask Codex to do anything` input prompt.

The matcher runs after the existing ANSI normalization and reconstructed-tail logic; its scan tolerates multiline redraws, the observed tool receipt, spinner, and status footer. Generic prose cannot be interposed, and quoted, blockquoted, fenced, or detached cancellation transcripts do not qualify.

An older `waiting` hook/lifecycle permission is dismissed only when its observation time precedes the qualifying terminal boundary. Equal-time or newer hook permission, a live permission title, or a newer approval/account/quota/payment/security/trust text prompt remains blocked.

No RPC shape, stream opcode, execution-host behavior, repository assumption, or provider-specific wire content changed. The same host-local terminal tail and timestamps are used for native, folder-workspace, WSL, and SSH-owned PTYs.

## Reproduction and validation

The focused runtime regression uses `OrcaRuntimeService.getTerminalInteractiveWait` and `sendTerminalAgentPrompt`, not a copied detector. It reproduces the independent-QA quoted-screen counterexample and proves permission, trust, account, payment, security, quota, hook, and title waits retain `agent_prompt_blocked` with zero writes. Separate positive coverage proves the observed real command cancellation still recovers, including a stale hook predating the terminal boundary.

Validation commands and final results:

- `pnpm exec vitest run src/main/runtime/terminal-readiness-codex-prompt.test.ts src/main/runtime/orca-runtime.test.ts --testNamePattern "dismissed Codex canceled command prompt|submits after Codex cancels|keeps .* blocked with zero writes" --reporter=verbose`: 27/27 passed.
- `pnpm exec vitest run --config config/vitest.config.ts src/main/runtime/agent-prompt-submission-runtime.test.ts --reporter=dot`: 31/31 passed.
- `pnpm exec vitest run --config config/vitest.config.ts src/main/runtime/terminal-interactive-wait-visibility.test.ts --reporter=dot`: 27/27 passed.
- `pnpm run typecheck:node`, scoped oxlint, oxfmt, and `git diff --check`: passed.

`pnpm run check:max-lines-ratchet` did not pass: it reported 18 stale `mobile-config` baseline entries that predate and do not overlap this patch. No baseline or configuration file was changed.

## Evidence boundary

The GUI remaining on an older completed edit confirmation while the host screen advanced is a renderer/projection symptom, not evidence that the host prompt was still active. W0 later used Ctrl+L and grounded UI input as a recovery workaround; those actions do not prove the original detector correct and are not part of this source fix.

This work did not operate on D0, replace or restart any runtime, bypass a confirmation, deploy a package, or change acceptance policy. Validation is source-level; W-QA owns independent fixed-package/product evidence.
