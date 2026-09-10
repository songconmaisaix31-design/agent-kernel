# Readiness candidate independent review

Candidate reviewed: `cdf279512519017976557f7e76f857286f5f1098`.

## Verdict

**Accept for the narrow ordinary-rate-limit readiness change, with bounded evidence only.** The candidate permits dispatch to continue only when the exact observed ordinary Codex reminder is followed by one anchored final `Ask Codex to do anything` line. It does not establish a real logged-in, paid, or permission-approved Worker; those paths remain explicitly blocked and were not executed.

## Fixed snapshot and commands

The review used the isolated Git archive export at `C:\Users\DW\AppData\Local\OrcaKernelLab\night\20260911-005945\resume-0252\W-QA\candidate-cdf279512519017976557f7e76f857286f5f1098`.

The candidate tree ID was `592c5da16e77a460aa005ff16fa5f86df6c2af1a` and the exported `terminal-readiness-codex-prompt.ts` SHA-256 was `03DC2A57DAABA88BD2A7B4B868F2004322BF21879B17F906C8A10AEFD075CD07`.

Environment: Windows PowerShell, Node `v24.16.0`; dependencies were installed only in the private export with `pnpm install --frozen-lockfile --ignore-scripts --offline` (1,280 packages, 0 downloads).

```powershell
$env:CANDIDATE_SNAPSHOT = '<fixed export path>'
node --test <fixed export path>\readiness-candidate-harness.mjs
pnpm exec vitest run --config config/vitest.config.ts src/main/runtime/terminal-readiness-codex-prompt.test.ts --reporter=dot
```

Results:

- Candidate-native Vitest: 1 file passed; 5 tests passed; 0 failed (`vitest v4.1.5`).
- Candidate Node type check: `pnpm exec tsc --noEmit -p config/tsconfig.node.json --composite false` passed with exit 0 and no diagnostics.
- Private fixed-source execution harness: 4 discovered, 4 passed, 0 failed. This is supplementary evidence only: it executed the candidate matcher after only removing TypeScript annotations in the private harness, and checked the candidate runtime's narrow wiring.
- `git diff --check <parent> <candidate>` passed with no whitespace errors.

## What was checked

- Exact three-line ordinary reminder followed by the final input prompt clears the stale reminder.
- A following permission approval, sign-in, plan/paid upgrade, or workspace trust prompt remains blocked.
- Incomplete, quoted, stale, or extra-output forms do not clear the reminder.
- `orca-runtime.ts` applies the narrow matcher before generic startup-modal dismissal and no longer uses the generic `findCodexInputPromptIndex` helper.

## Limits and residual risk

No terminal was sent input; no real Worker, Docker, model, login, payment, permission, trust, account approval, running Fork, or stable Orca process was started, modified, or restarted. The source-level harness cannot substitute for the candidate's Vitest suite, a same-PTY live terminal observation, or an authenticated/paid/permission flow; those remain untested and blocked. This review therefore approves only continued dispatch after the precisely matched ordinary reminder, not any privileged or commercial action.
