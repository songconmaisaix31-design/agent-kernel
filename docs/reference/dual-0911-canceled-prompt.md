# Codex canceled-prompt readiness repair

## Scope and source comparison

The observed D0 process ran Orca 1.4.188 source `3538e109`. Its retained terminal state still reported `codex-interactive-prompt` after Codex printed an explicit canceled-command status, `Conversation interrupted`, and a new `Ask Codex to do anything` composer.

Candidate `4b207b1a4a442cfe68ba08037eb52cf7a74ad651` already differs from that source: it recognizes only the complete dismissed rate-limit reminder sequence. The D0 command-cancellation sequence contains neither that reminder nor the legacy `OpenAI Codex` ready header, so the candidate still reproduced a blocked `getTerminalInteractiveWait` result and could reject guarded prompt submission.

## Repair

The detector now clears a prior Codex interactive prompt only when these ordered, line-anchored UI states follow it:

1. `✗ You canceled the request to run` or `✗ You rejected the request to run`;
2. `■ Conversation interrupted - tell the model what to do differently`;
3. a standalone `Ask Codex to do anything` input prompt.

The matcher runs after the existing ANSI normalization and reconstructed-tail logic; its ordered line scan tolerates the observed redraw spinner and status footer after the composer. Ordinary idle prompts and quoted cancellation prose do not qualify.

An older `waiting` hook/lifecycle permission is dismissed only when its observation time precedes the qualifying terminal boundary. Equal-time or newer hook permission, a live permission title, or a newer approval/account/quota/payment/security/trust text prompt remains blocked.

No RPC shape, stream opcode, execution-host behavior, repository assumption, or provider-specific wire content changed. The same host-local terminal tail and timestamps are used for native, folder-workspace, WSL, and SSH-owned PTYs.

## Reproduction and validation

The focused runtime regression uses `OrcaRuntimeService.getTerminalInteractiveWait` and `sendTerminalAgentPrompt`, not a copied detector. With the `4b207b1a4` detector wiring, it failed with `reason: codex-interactive-prompt`; after text dismissal alone, the stale hook case failed with `source: hook`; the final implementation accepts the normal follow-up submission and then proves a newer permission hook blocks again.

Validation commands and final results:

- `pnpm exec vitest run --config config/vitest.config.ts src/main/runtime/terminal-readiness-codex-prompt.test.ts --reporter=dot`: 15/15 passed.
- `pnpm exec vitest run --config config/vitest.config.ts src/main/runtime/orca-runtime.test.ts -t "submits after Codex cancels a command prompt and renders a new input turn|returns a blocked wait result for generic Codex interactive prompts" --reporter=dot`: 2/2 passed.
- `pnpm exec vitest run --config config/vitest.config.ts src/main/runtime/agent-prompt-submission-runtime.test.ts --reporter=dot`: 31/31 passed.
- `pnpm exec vitest run --config config/vitest.config.ts src/main/runtime/terminal-interactive-wait-visibility.test.ts --reporter=dot`: 27/27 passed.
- `pnpm exec tsc --noEmit -p config/tsconfig.node.json --composite false`, scoped oxlint, oxfmt, and `git diff --check`: passed.

`pnpm run check:max-lines-ratchet` did not pass: it reported 18 stale `mobile-config` baseline entries that predate and do not overlap this patch. No baseline or configuration file was changed.

## Evidence boundary

The GUI remaining on an older completed edit confirmation while the host screen advanced is a renderer/projection symptom, not evidence that the host prompt was still active. W0 later used Ctrl+L and grounded UI input as a recovery workaround; those actions do not prove the original detector correct and are not part of this source fix.

This work did not operate on D0, replace or restart any runtime, bypass a confirmation, deploy a package, or change acceptance policy. Validation is source-level; W-QA owns independent fixed-package/product evidence.
