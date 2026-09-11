# Kernel candidate QA

## Verdict

Source QA, bounded compiled-output inspection, inactive Windows package inspection, isolated nonvisual packaged-runtime smoke, and an exact-identity warm-restart smoke passed for candidate `4b207b1a4a442cfe68ba08037eb52cf7a74ad651` on branch `songconmaisaix31-design/dual-0911-kernel-qa`.

This does not establish Electron-rendered UI, installer, signing, publishing, model/account behavior, or acceptance in a stable/D0 profile.

Follow-up canceled-prompt candidates `3b97f0e3118e6fb21771b74e14a496b4fade2a24` and `7349ee2bc945dd71c8d27e3ae18f2c2cd0a22a5f` are **rejected**. The former can clear a real permission prompt when later ordinary output quotes cancellation UI; the latter closes that unsafe path but does not recognize the actual D0 `Would you like to run the following command?` header or a long wrapped approval section, so the intended post-cancellation recovery remains blocked.

Canceled-prompt source candidate `7e6f721aa175cb02edee12004b96e218504b56db`, a direct child of `7349ee2b`, is **accepted for source only**: it passes the grounded positive shapes and all retained active-safety negatives.

Kernel same-owner rework checkpoint `6bf37be657ce204fef30d50523b6dd984c471be8` is **rejected**: its own focused suite fails 7/13, and independent real-source tests prove that it rejects both a physically preserved PTY after an application runtime restart and a second rework of the same retained resource. Its direct child `51e43c9af8ca4c183179ea81ae0020e4f80a6ded` fixes those boundaries and is **accepted for source only**.

The final combined source `516da10cd7ad26bc8a4d3a7900b9e22c304a66c5` and its unpacked Windows package are **accepted for bounded nonvisual readiness**. Independent package inspection, Electron-ABI native loading, isolated app/CLI readiness, and a real scratch PTY command passed; direct PTY close returned an `unverifiable` stop verdict, but an exact-handle shell `exit` completed and authoritative inventory reached zero before the exact owned app was gracefully stopped.

## Provenance

- Required baseline: `01bd406abb787a6b2fd8064e66bcefb75971b8ff`
- Original first source commit: `1e3f77ea6ee246ace2db17aef04148700a7962d0`
- Original final source commit: `cdf279512519017976557f7e76f857286f5f1098`
- Candidate under test: `4b207b1a4a442cfe68ba08037eb52cf7a74ad651`
- Rejected canceled-prompt follow-up: `3b97f0e3118e6fb21771b74e14a496b4fade2a24`
- Rejected canceled-prompt source follow-up: `7349ee2bc945dd71c8d27e3ae18f2c2cd0a22a5f`
- Accepted canceled-prompt source follow-up: `7e6f721aa175cb02edee12004b96e218504b56db`
- Rejected same-owner rework checkpoint: `6bf37be657ce204fef30d50523b6dd984c471be8`
- Accepted same-owner rework source follow-up: `51e43c9af8ca4c183179ea81ae0020e4f80a6ded`
- Final combined source: `516da10cd7ad26bc8a4d3a7900b9e22c304a66c5`
- Final combined source tree: `2a2d5bd8f4158ef12691909ab500d3431d56ddad`
- W-PACK2 delivery/report commit: `a113444950ce6372dce30f789715945d88a9a8ee`
- Initial W-PACK build report commit: `394a633f9fb8dc7a25b356d9d46ea89074951506`
- Updated native/package report commit: `818e2e89c4d3d2ddae5a53631d71a84734715134`
- Candidate tree: `592c5da16e77a460aa005ff16fa5f86df6c2af1a`
- Original final source tree: `592c5da16e77a460aa005ff16fa5f86df6c2af1a`

`01bd406a..4b207b1a` changes only:

- `docs/reference/night-20260911-readiness-repair.md`
- `src/main/runtime/orca-runtime.ts`
- `src/main/runtime/terminal-readiness-codex-prompt.ts`
- `src/main/runtime/terminal-readiness-codex-prompt.test.ts`

`git diff --exit-code cdf279512519017976557f7e76f857286f5f1098..4b207b1a4a442cfe68ba08037eb52cf7a74ad651` exited `0`. The complete trees are identical, and each of the four readiness-path blob IDs matches. The candidate's first integrated commit `c5f92aaf5833c02e2682e9cb6cc9126857ef0dcb` is likewise tree-equal to `1e3f77ea6ee246ace2db17aef04148700a7962d0`.

## Validation

Environment: Windows, Node `v24.16.0`, pnpm `10.24.0`.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile --ignore-scripts --offline` | PASS; 1,280 packages reused from cache, no downloads, lifecycle scripts disabled |
| `pnpm exec vitest run --config config/vitest.config.ts src/main/runtime/terminal-readiness-codex-prompt.test.ts --reporter=dot` | PASS; 1 file, 5/5 tests |
| `pnpm exec tsc --noEmit -p config/tsconfig.node.json --composite false` | PASS; exit 0 |
| `pnpm exec tsc --noEmit -p config/tsconfig.cli.json --composite false` | PASS; exit 0 |
| `pnpm exec vitest run --config config/vitest.config.ts src/main/runtime/orca-runtime.test.ts --reporter=dot -t "blocks tui-idle when a newer prompt follows a stale prompt and ready header\|returns a blocked wait result for Codex workspace trust prompts\|returns a blocked wait result for generic Codex interactive prompts"` | PASS; 3/3 selected integration tests, 1,183 skipped |
| `node --experimental-strip-types readiness-boundary-matrix.mjs <candidate-worktree>` | PASS; 6/6 direct imports of the candidate TypeScript source |
| `git diff --check 01bd406abb787a6b2fd8064e66bcefb75971b8ff..4b207b1a4a442cfe68ba08037eb52cf7a74ad651` | PASS; exit 0 |

The supplementary direct-source matrix used the repository file itself, not a copied implementation. It accepted only the complete dismissed ordinary reminder and rejected an active permission menu, a real quota/payment blocker, ambiguous terminal ownership after retained prompt text, a later turn boundary, and quoted prompt prose. Existing runtime integration tests separately kept newer hooks review, workspace trust, and generic permission prompts fail-closed.

Evidence logs and the supplementary matrix are under `C:/Users/DW/AppData/Local/OrcaKernelLab/night/dual-20260911-103612/W-evidence/W-QA/`.

## Compiled output inspection

The W-PACK build report was read directly from commits `394a633f9fb8dc7a25b356d9d46ea89074951506` and `818e2e89c4d3d2ddae5a53631d71a84734715134`. Their ancestry leads directly to the tested candidate, and the only Git change after the candidate is that build report. The inspected output at `C:/Users/DW/AppData/Local/OrcaKernelLab/night/dual-20260911-103612/W-evidence/W-PACK/out` contains 3,463 files totaling 145,004,064 bytes.

| Check | Result |
| --- | --- |
| Required nonempty entries: `cli/index.js`, `cli/specs/orchestration.js`, `main/index.js`, `main/daemon-entry.js`, `preload/index.js`, `renderer/index.html`, `web/web-index.html` | PASS; all 7 present |
| Compiled main readiness content | PASS; matcher name and exact lower-credit/confirmation literals present |
| Renderer index local references | PASS; all 328 referenced assets exist |
| `node --check` on CLI, main, daemon entry, and preload entry | PASS; 4/4 |
| `node out/cli/index.js --help` | PASS; exit 0 and complete command catalog |
| `node out/cli/index.js help orchestration kernel-accept` | PASS; exit 0 with full-SHA candidate syntax |
| `node out/cli/index.js help orchestration kernel-approve-acceptance` | PASS; exit 0 with trusted-check boundary note |
| `node out/cli/index.js help orchestration run-use` | PASS; exit 0 with `--kernel-config` / `--kernel-off` syntax |
| `node out/cli/index.js --version` | No distinct version output; exit 0 with root help fallback, so no version claim |

The compiled CLI's control flow returns help before dynamically loading `RuntimeClient`; these help-only smokes did not contact a running runtime or write a profile. This is bounded build evidence, not execution proof for the Electron application or daemon service.

## Inactive Windows package inspection

The initial native gate failed because the fresh candidate lacked `windows-native-registry/build/Release/native.node` and Visual Studio compilation was unavailable. The updated W-PACK report records a later bounded reuse: an Electron-compatible addon was proven under the candidate runtime, copied into the ignored candidate dependency tree, the repository's original native gate passed without rebuilding, and `electron-builder --dir` then produced `kernel-candidate/win-unpacked`. Both events remain part of the history; the later success does not erase the initial failure.

The package at `C:/Users/DW/AppData/Local/OrcaKernelLab/night/dual-20260911-103612/kernel-candidate/win-unpacked` contains 3,124 files totaling 626,305,429 bytes. Its `app.asar` has 2,960 entries and identifies `orca` version `1.4.188` with `./out/main/index.js` as the application main; no application entry point was launched.

| Check | Result |
| --- | --- |
| Required package entries: `Orca.exe`, `resources/app.asar`, `resources/bin/orca.exe`, packaged registry addon, and unpacked daemon entry | PASS; all present and nonempty |
| Packaged compiled-output provenance | PASS; all 2,872 packaged `out` entries match W-PACK output size and SHA-256 (1,051 unpacked payloads and 1,821 packed entries) |
| Packaged registry addon | PASS; 155,408 bytes, SHA-256 `5D5BB2D9FC233A3A115C3EC11F3D378569A12AA120DC5E6794E8546293CC250A`, matching the updated W-PACK report |
| Packaged Electron native probe | PASS; Electron `43.1.0`, module ABI `148`, N-API `10`; registry addon loaded and completed a read-only HKCU Environment query |
| Packaged node-pty probe | PASS; ConPTY native module loaded without spawning a terminal |
| `resources/bin/orca.exe help orchestration kernel-accept` | PASS; exit 0 with full-SHA candidate syntax; no runtime/profile contact |

Key SHA-256 values: `Orca.exe` = `9AD72561B4AF104629E1F93F1877AA03969AE3631B45EA1583426D569465C5CC`, `resources/app.asar` = `535AA863EF82573DE6361D104D2B55556A8F69FE6E2982D80E4F27282E6809E8`, and the unpacked daemon entry = `C9F8DD4DF76D2C91339BB6C62631F178F581A3B6CF02D86230AE642F75E1C519`, identical to W-PACK's compiled daemon entry.

These results establish structural, byte-provenance, CLI-help, and native-load evidence for the inactive directory only. They do not claim the app starts, renders, or operates correctly.

## Isolated packaged-runtime smoke

The exact packaged candidate was then launched from `C:/Users/DW/AppData/Local/OrcaKernelLab/night/dual-20260911-103612/kernel-candidate/win-unpacked/Orca.exe`. Source inspection was against exact source `4b207b1a4a442cfe68ba08037eb52cf7a74ad651`, not the report branch tip:

- `configureDevUserDataPath` accepts packaged `ORCA_USER_DATA_PATH` only when `ORCA_EXPERIMENT_CODEX_SYSTEM_HOME` enables the guarded experiment path. Both paths must be absolute, under `OrcaKernelLab`, and link-free; startup succeeded and a post-run scan found zero reparse points.
- `configureOrcaUserDataPathEnv` canonicalizes the selected Electron `userData` into `ORCA_USER_DATA_PATH`; the CLI reads `orca-runtime.json` from exactly that directory and requires a local named-pipe transport plus an authentication token.
- Electron derives `requestSingleInstanceLock()` identity from the configured `userData`, and the source acquires the lock only after configuring that path. This isolates discovery metadata and the single-instance namespace from stable Orca and D0.

The fresh paths were `W-evidence/W-QA/runtime-smoke/profile`, `system-codex-home`, and `scratch-folder`; all remained under the authorized evidence directory. The launch used:

```powershell
Start-Process -FilePath <exact-candidate-Orca.exe> -WorkingDirectory <win-unpacked> -WindowStyle Hidden -PassThru -Environment @{
  ORCA_EXPERIMENT_CODEX_SYSTEM_HOME = <W-QA/runtime-smoke/system-codex-home>
  ORCA_USER_DATA_PATH = <W-QA/runtime-smoke/profile>
  ORCA_CLI_COMMAND = <exact-candidate-resources/bin/orca.exe>
  ORCA_STARTUP_DIAGNOSTICS = '1'
}
```

| Check | Result |
| --- | --- |
| Exact process identity | PASS; PID `121304`, executable exactly the candidate `Orca.exe` (SHA-256 `9AD72561B4AF104629E1F93F1877AA03969AE3631B45EA1583426D569465C5CC`) |
| Profile discovery | PASS; `profile/orca-runtime.json` named PID `121304`, runtime `50b52983-fbff-441e-9e84-8d59bb0703e7`, and a candidate-owned named pipe; the preserved evidence copy redacts its token |
| Exact candidate CLI status | PASS; `resources/bin/orca.exe status --json` returned app version `1.4.188`, `runtime.state=ready`, `reachable=true`, graph `ready`, PID `121304`, and the same runtime ID |
| Runtime/daemon command path | PASS; candidate CLI `repo add` registered only the scratch Git folder, and `terminal create` ran `terminal-smoke.ps1` in that folder; CLI read returned `CANDIDATE_TERMINAL_OK_2`, and marker/cwd files independently matched |
| Terminal cleanup | PASS with one bounded observation; the first exact-handle close succeeded, the second returned `tab_not_found` after its command completed, and authoritative terminal list before/after `terminal stop` contained zero live terminals (`stopped: 0`) |
| Graceful application stop | PASS; `CloseMainWindow()` could not address a hidden window, so six top-level windows belonging only to verified PID `121304` received standard `WM_CLOSE`; all posts succeeded and the process exited within 30 seconds |
| Post-stop candidate state | PASS; candidate CLI status returned `app.running=false`, `runtime.state=not_running`, `reachable=false`, and zero processes remained under the candidate package path |
| Existing runtime preservation | PASS; stable Orca remained PID `81484`, runtime `9eff2735-3c29-48e2-8ce4-2446b5513f2b`, `ready/reachable` before and after; read-only D0 metadata still named runtime `1bd39503-94d2-4045-8e1f-4419dd8d0f83` and its PID `117424` remained present |

The read-only and scratch commands used the exact candidate CLI with the three isolation environment variables above:

```powershell
& <exact-candidate-cli> status --json
git -C <W-QA/runtime-smoke/scratch-folder> init
& <exact-candidate-cli> repo add --path <scratch-folder> --json
& <exact-candidate-cli> terminal create --worktree path:<scratch-folder> --title W-QA-RUNTIME-SMOKE-2 --command "powershell.exe -NoLogo -NoProfile -File <W-QA/runtime-smoke/terminal-smoke.ps1>" --json
& <exact-candidate-cli> terminal wait --terminal <exact-handle> --for exit --timeout-ms 45000 --json
& <exact-candidate-cli> terminal read --terminal <exact-handle> --limit 100 --json
& <exact-candidate-cli> terminal close --terminal <exact-handle> --json
& <exact-candidate-cli> terminal list --worktree path:<scratch-folder> --json
& <exact-candidate-cli> terminal stop --worktree path:<scratch-folder> --json
```

`terminal wait --for exit` timed out because the supplied startup command returned to Orca's persistent PowerShell terminal rather than terminating it; this does not weaken command execution evidence, which was independently present in CLI output and two scratch files. The second close's `tab_not_found` is retained as exact negative evidence rather than presented as a clean close response; the subsequent authoritative inventory proved no live terminal remained.

The repository-required Electron skill was not present after one bounded search of the configured agent, runtime, and plugin skill roots. No rendered UI action, screenshot, accessibility inspection, or Playwright CDP validation was attempted or claimed.

## Isolated packaged warm restart

The exact same `4b207b1a` package was launched again with a second fresh profile under `W-evidence/W-QA/warm-restart`. The exact candidate CLI registered only `warm-restart/scratch-folder` and created a persistent base PowerShell terminal whose first command wrote `WARM_FIRST` under the same evidence subtree; no model, account, stable profile, D0 runtime, or product workspace was contacted.

| Check | Result |
| --- | --- |
| First app/runtime identity | PASS; exact `Orca.exe` PID `108608`, runtime `2437283a-06b3-4c24-8163-c31a5e0b655f`, app version `1.4.188` |
| Persistent terminal identity | PASS; handle `term_5b7d7975-df8c-4d39-b9ec-27eb00f52755`, PTY ID ending `@@cdc353bc`, incarnation `96f5be9c-5109-4378-b933-a392d295206a`; first marker existed |
| First graceful app close | PASS; six top-level windows belonging only to verified PID `108608` received standard `WM_CLOSE`, and the app exited within 30 seconds |
| Daemon survival boundary | PASS; candidate CLI reported app/runtime `not_running` after main-process exit, while exact candidate-path daemon PID `125196` remained; no unknown process was stopped |
| Same-profile relaunch | PASS; exact `Orca.exe` PID `94888`, new runtime `aa7ff9f6-46a3-41a7-9e9e-8b0b09e36d11` |
| Physical terminal survival | PASS; the new runtime rediscovered the exact same handle, PTY ID, and incarnation ID; it was marked orphaned but remained connected and writable, so no recreated terminal was counted |
| Post-restart command | PASS; only after full identity equality, exact candidate CLI accepted 191 bytes and the surviving PowerShell wrote `WARM_SECOND` under the evidence subtree |
| Owned cleanup | PASS with retained negative response; `terminal close` returned `tab_not_found`, but authoritative terminal inventory was zero, PID `94888` exited through its six exact-PID windows, final candidate status was `not_running`, and zero exact candidate-path processes remained |

This first warm restart establishes a real daemon-backed PTY/incarnation surviving an ordinary application close and same-profile relaunch, but its rediscovered entry had `orphaned=true` and `pty:` fallback tab/leaf IDs. It therefore proves physical survival only, not restored managed pane or Worker authority.

A second fresh `W-evidence/W-QA/warm-authority` run closed that limitation using only public native CLI controls. Before close, `terminal create --focus` plus `terminal switch` was allowed to settle until the terminal was `orphaned=false`, `paneRuntimeId=1`, connected/writable, and present in a real persisted visual layout.

| Managed-authority check | Result |
| --- | --- |
| Before-close identity | PASS; PID `109376`, runtime `acdb0fcd-e2db-45d9-a24b-34cc8cb73278`, PTY ID ending `@@7674f0e0`, incarnation `577d791b-061d-4d69-b707-2f4dd8490e2b`, real tab `c8ecf094-85d7-4680-b037-df55f47be48b`, leaf `233139df-909c-4eba-b697-a980d3a4f2cf` |
| Same-profile relaunch | PASS; PID `119200`, runtime `38bf3bef-6298-41ea-9d0a-6f9d917a6669`, graph ready |
| Physical and managed restoration | PASS; handle was refreshed, but exact PTY ID, incarnation, tab, leaf, worktree, and visual-layout placement remained equal; `orphaned=false`, `paneRuntimeId=1`, connected/writable |
| Post-proof command | PASS; only after both physical and managed equality, the refreshed handle accepted 182 bytes and the same PowerShell wrote `AUTH_AFTER` under the evidence subtree |
| Cleanup | PASS; exact terminal close returned `ptyKilled=true`, inventory became zero, exact PID exited through standard `WM_CLOSE`, final status was `not_running`, and zero candidate-path processes remained |

The second run establishes restored managed pane identity despite the changed application/runtime epoch, which directly grounds the rework boundary test below. Neither warm run establishes rendered UI behavior: the repository-required Electron skill remained unavailable, no Playwright CDP action was attempted, and the hidden-window `WM_CLOSE` control supplied no visual assertion.

The scratch PowerShell handle reminted because that shell had no controller-exported agent handle. A bounded source audit confirms the narrower real-agent path: daemon inventory supplies `controllerIdentity.handle` or `session.terminalHandle`; `adoptControllerTerminalHandle` may replace a synthetic handle only for the exact persisted surface and incarnation; and restored orchestration authority retains that controller identity. The actual candidate tests `restores a retained coordinator handle after a late controller inventory` and `recovers exported ORCA_TERMINAL_HANDLE from discovered live PTY sessions` passed 2/2 with 1,184 unrelated tests skipped. Thus a controller-bound D0/P agent can preserve its original handle across the app epoch, while a plain shell demonstrates only the broader generic remint case.

## Canceled Codex prompt follow-up

### Reproduced old failure

W0's preserved D0 evidence shows the exact live lane remained connected and writable after an actual Esc cancellation: Codex rendered `✗ You canceled the request to run`, `■ Conversation interrupted`, and a new `› Ask Codex to do anything`, while terminal state still exposed `agentWait.source=prompt-text` and `reason=codex-interactive-prompt`. The later grounded paste/Return workaround resumed D0, but it neither bypassed an active approval nor proves the detector was correct.

An evidence-local Vitest imports the real `OrcaRuntimeService` from candidate `4b207b1a4a442cfe68ba08037eb52cf7a74ad651`; it does not copy or replace the detector. Given a real permission shape followed by explicit cancellation, interruption, and the new Codex input, desired acceptance failed before any new input write because `assertAgentPromptPermissionSafe` threw `agent_prompt_blocked`. The clean configured run produced 1/1 expected regression failure. An earlier discovery run found no external test under the repository include glob, and the first custom-config run emitted an Electron download message plus an unhandled-rejection warning; neither is counted as defect proof, and the corrected mocked run is the retained source result.

### Fixed candidate review

Git object `3b97f0e3118e6fb21771b74e14a496b4fade2a24` exists locally with exact parent `4b207b1a4a442cfe68ba08037eb52cf7a74ad651` and tree `6b92cd4b3d4045f2bbc20c50f5e880d700c2e876`. Its complete diff is five paths: the two readiness source/test files, `orca-runtime.ts`, `orca-runtime.test.ts`, and one reference document. `git diff --check` passed.

The immutable commit was exported with `git archive` into `W-evidence/W-QA/fixed-3b97f0e3`; the extracted `orca-runtime.ts` blob `56b240621fd5e47ca9df1694a0db8c019896d4b2` exactly matches the Git object. Tests used the existing dependency tree through an evidence-local junction and did not read W-INPUT's worktree.

| Check | Result |
| --- | --- |
| W-INPUT focused matcher suite | PASS; 15/15 |
| W-INPUT selected caller regression | PASS; 2/2 selected, 1,185 skipped |
| Existing prompt-submission suite | PASS; 31/31 |
| Existing interactive-wait suite | PASS; 27/27 |
| Node TypeScript check | PASS; `tsc --noEmit -p config/tsconfig.node.json --composite false` |
| Independent actual-source caller matrix | **FAIL**; 9/10 passed, quoted exact cancellation UI unsafely cleared a real permission prompt |

The independent matrix confirms the intended explicit-cancellation recovery succeeds. It also preserves blocking for a newer active permission, account login, payment, security review, real quota reminder, workspace trust prompt, newer permission hook, and live permission title.

The failing counterexample is caller-level, not a helper-only assertion:

```text
Permission required
Allow once
Allow always
Reject
For reference, this is a quoted old screen:
✗ You canceled the request to run & old-tool.cmd
■ Conversation interrupted - tell the model what to do differently.
› Ask Codex to do anything
```

Expected: `getTerminalInteractiveWait` remains `{source: prompt-text, reason: codex-interactive-prompt}`, `sendTerminalAgentPrompt` rejects `agent_prompt_blocked`, and no bytes are written. Actual at `3b97f0e3`: wait was `null`, submission resolved `{accepted: true, bytesWritten: 19}`, and the PTY received the bracketed `unsafe` paste plus Enter. `isDismissedCodexCanceledCommandPrompt` ignores the intervening ordinary prose and accepts the later line-anchored quoted markers as authoritative cancellation state.

This exact expected/actual was escalated to W0 for the W-INPUT owner. Candidate `3b97f0e3` is not accepted and must not be packaged or delivered as the readiness fix.

### Corrected input candidate

Git object `7349ee2bc945dd71c8d27e3ae18f2c2cd0a22a5f` is directly parented from rejected `3b97f0e3`, has tree `d5b24dc100d1089e78609b67ccc4e180993550bf`, and changes only the reference document, detector source/test, and `orca-runtime.test.ts`; `git diff --check` passed. W-QA exported it to `W-evidence/W-QA/input-7349ee2b` with archive SHA-256 and Git provenance in `input-7349ee2b-provenance.json`.

| Check | Result |
| --- | --- |
| Submitted detector suite | PASS; 19/19 |
| Full actual `orca-runtime` caller suite | PASS; 1,199/1,199 |
| Independent actual-source caller matrix | **FAIL** after grounded D0 expansion; 10 passed, 2 failed |
| Node TypeScript check | PASS; `tsc --noEmit -p config/tsconfig.node.json --composite false` |

The original 10-case independent matrix accepts its synthetic `this command` cancellation boundary and rejects the prior exact quoted-UI counterexample before any unsafe write. It also preserves fail-closed behavior for newer active permission, account, payment, security, quota, workspace trust, permission hook, and live permission-title cases.

After W0 supplied the grounded current D0 header, the same real caller was expanded with two required positive cases. A case differing only by `Would you like to run the following command?` expected wait `null` and safe new-prompt submission, but actual wait remained `{source: prompt-text, reason: codex-interactive-prompt, since: 2000}`. A realistic 17-line Environment/Reason/wrapped-command/three-choice section before `Press enter to confirm` also remained blocked because the header differs and `findPreviousLine` has a fixed 12-line floor. Fail-closed rejection is safe but is not feature completion; W-QA therefore rejects `7349ee2b`. It was not packaged or launched, so no runtime or rendered acceptance is claimed.

### Grounded input candidate

Git object `7e6f721aa175cb02edee12004b96e218504b56db` is directly parented from rejected `7349ee2b`, has tree `e2a26ad50cf3f0080c5c4c04ff7b9a28e6575283`, changes the same four paths, and passes `git diff --check`. Its complete Git archive is at `W-evidence/W-QA/input-7e6f721a-complete`; the first system extraction stalled and remains explicitly identified as the incomplete `input-7e6f721a` directory, which was not used for tests. `input-7e6f721a-provenance.json` identifies the complete snapshot and archive hash.

| Check | Result |
| --- | --- |
| Expanded independent actual-source caller matrix | PASS; 12/12 |
| Submitted detector suite | PASS; 21/21 |
| Node TypeScript check | PASS; `tsc --noEmit -p config/tsconfig.node.json --composite false` |

The two grounded positives now recover: the actual `Would you like to run the following command?` heading and the realistic long Environment/Reason/wrapped-command/three-choice section both clear after explicit cancel/interruption/new input. The synthetic positive and all permission, account, payment, security, quota, trust, quoted-UI, newer-hook, and live-title negative cases remain green with blocked unsafe writes. W-QA accepts `7e6f721a` for source only; it was not packaged or launched, so no runtime or rendered acceptance is claimed.

## Same-owner Kernel rework follow-up

Git object `6bf37be657ce204fef30d50523b6dd984c471be8` has exact parent `4b207b1a4a442cfe68ba08037eb52cf7a74ad651` and tree `4a3061b69ebdbebc3fd8a4f10bfb70ef79543ad7`. Its complete 11-path diff and `git diff --check` passed. W-QA exported that object with `git archive` to `W-evidence/W-QA/rework-6bf37be6`; the archive SHA-256 is `2B7FA0647E541653C9B97536021F5D1C71D0592859F32F6E2AC110D0D8F5A90A`, and per-path blob IDs are preserved in `rework-6bf37be6-provenance.json`.

| Check | Result |
| --- | --- |
| Node TypeScript check | PASS; `tsc --noEmit -p config/tsconfig.node.json --composite false` |
| Checkpoint's focused rework suite | **FAIL**; 7 failed, 6 passed |
| Independent real-source boundary suite | **FAIL**; both expected admissions rejected |
| Public Kernel `runUse` remint suite | **FAIL**; restored original 1 failed, unrelated identity 1 passed |

The checkpoint's claimed success test expected a fresh Dispatch but received `kernel_unsupported_path: Kernel requires a local Git repository`. Five other cases expecting rework/config/generation decisions were preempted by the same local-repo admission, while the wrong-terminal-owner case expected `kernel_rework_invalid` but received `consumer_fenced`. These are failures of the submitted test/source combination with dependencies present, not an unmaterialized-dependency limitation.

The independent test imports `prepareKernelReworkStart` and `assertKernelReworkStart` from the immutable snapshot; it does not copy either implementation. It reproduces two additional caller/policy defects:

- With terminal handle, pane, worktree, resource, and `process_incarnation` unchanged, but current runtime ID changed after the ordinary app restart physically proven above, expected same-owner admission instead rejects `kernel_rework_invalid: Original Worker terminal identity is no longer current` because persisted `worker.runtime_epoch` must equal the new app runtime ID.
- After one successful resource transfer, the retained resource correctly has `owner_dispatch_id=ctx_second` while immutable provenance remains `origin_dispatch_id=ctx_first`. A second rework from `ctx_second`, otherwise exact, expected admission but rejects `kernel_rework_invalid: Rework requires the original unaccepted local Worker resource` because `origin_dispatch_id` is required to equal the immediately prior dispatch.
- On the actual registered `orchestration.runUse` method with real SQLite and `OrcaRuntimeService`, an initial Kernel owner whose handle remints across restart while its pane/PTY/incarnation remain the same is rejected by `prepareKernelRunBinding -> assertKernelRunOwner` with `consumer_fenced: Run has a different or invalid current owner` before `bindRun` can refresh the handle. The paired unrelated-pane/incarnation negative correctly remains fenced.

The public `runUse` remint rejection is a real generic gap, but the controller audit narrows this batch's required fix: an actual controller-bound Codex coordinator can restore the exact original handle. No pane-only relaxation is justified; the safe target is exact original handle/pane/incarnation plus current controller authority across a changed app runtime epoch, with synthetic, unrelated, or unknown identities still rejected.

Both exact expected/actual failures were escalated to W0 for the W-REWORK owner. Checkpoint `6bf37be6` is not accepted; no live D0 operation, application launch, model session, or runtime/profile mutation was used to test it.

### Corrected rework candidate

Git object `51e43c9af8ca4c183179ea81ae0020e4f80a6ded` is directly parented from rejected `6bf37be6`, has tree `5a6c807b450a989f56094198df272220dbcded4a`, and its complete `4b207b1a..51e43c9a` source chain changes 11 net paths. `orchestration-kernel.test.ts` was touched in the ordered intermediate commits but is tree-equal to the base at the final candidate. Both the direct child diff and full chain pass `git diff --check`. W-QA exported the immutable object to `W-evidence/W-QA/rework-51e43c9a`; the archive SHA-256 and every changed-path blob are recorded in `rework-51e43c9a-provenance.json`.

| Check | Result |
| --- | --- |
| Submitted rework/config/limits/ordinary-start suites | PASS; 4 files, 229/229 |
| Node TypeScript check | PASS; `tsc --noEmit -p config/tsconfig.node.json --composite false` |
| Corrected independent actual-source boundary matrix | PASS; 6/6 |

The first mechanical reuse of the old QA file produced two harness errors because `51e43c9a` added `getOrchestrationDispatchAuthority` and moved `assertKernelReworkStart`; that run is retained but is not counted as a product failure. The corrected test imports the new real implementation and supplies the required current authority and non-orphan managed-terminal facts.

The corrected matrix admits both intended positives: the same pane/incarnation/resource across a changed current runtime epoch, and a second rework whose resource keeps the first dispatch as immutable origin while the second dispatch is current owner. It independently rejects missing current authority, wrong current runtime, wrong process incarnation, and an orphaned terminal. The submitted suites additionally preserve lineage integrity, attempt/concurrency limits, accepted/downstream/generation races, ordinary dependency rejection, low-level dispatch recheck after asynchronous agent detection, policy recheck at DB entry, and dependency-base recheck immediately before terminal delivery.

Source inspection confirms the new dispatch stores the current runtime epoch while preserving the prior historical epoch in its rework binding. Current authority is tied to the requested terminal, current runtime, managed non-orphan worktree, equivalent pane, exact historical/resource/current process incarnation, and equal local host scope. The broader plain-shell `runUse` handle-remint gap remains a known limitation, but controller-bound Codex agents can restore the exact exported handle as documented above; no pane-only owner relaxation is part of this source acceptance.

W-QA accepts `51e43c9a` for source only. It was not packaged, launched, or used against D0, so combined-package, live controller restoration, native switch, and rendered UI remain outside this verdict.

## Final combined Windows package

W-PACK2 built the immutable combined source `516da10cd7ad26bc8a4d3a7900b9e22c304a66c5`, tree `2a2d5bd8f4158ef12691909ab500d3431d56ddad`, into `kernel-rework-candidate/win-unpacked`. Its final report commit is `a113444950ce6372dce30f789715945d88a9a8ee`; the report records 17 test files with 1,861 passing tests, three passing typechecks, passing scoped lint/format/build/native/package gates, and the unchanged known base/combined max-lines failure with the same 18 entries. W-QA read these build results but did not duplicate the already-green source suite.

Independent byte inspection matched W-PACK2 exactly:

| Payload | Bytes | SHA-256 |
| --- | ---: | --- |
| `Orca.exe` | 225,470,464 | `7EEF1E2BC1BB70086E468C84DE01E9A853189B2F20F8365B45FC47513A8C933E` |
| `resources/app.asar` | 132,784,819 | `3629081F4824CCDA7F2BEDF72FDE44E8BB4983BA30A80BB49A07D50C9C69D287` |
| `resources/bin/orca.exe` | 6,144 | `357AA4BF60EC8002AD7CDD78F7FC284B14300E9C6957C58F5B8B9A27AF3F8D9C` |
| packaged registry addon | 155,408 | `5D5BB2D9FC233A3A115C3EC11F3D378569A12AA120DC5E6794E8546293CC250A` |
| unpacked daemon entry | 144,402 | `C9F8DD4DF76D2C91339BB6C62631F178F581A3B6CF02D86230AE642F75E1C519` |

The asar manifest identifies Orca `1.4.188` and `out/main/index.js`. Direct extraction of that compiled main payload found the final canceled-prompt matcher `^would you like to run (?:this|the following) command\?$`, the current-runtime epoch check, immutable origin-dispatch lineage, and the rework terminal-identity error path. W-PACK2's first two archive-verifier attempts incorrectly looked for built JavaScript at the archive root; its corrected platform-path verifier found all 66 expected compiled entries. W-QA's extraction and runtime checks use the actual package paths, so those retained verifier-path failures are not presented as product defects.

Using repository Electron `43.1.0` in run-as-Node mode, W-QA loaded the package's actual Electron ABI `148` modules: `windows-native-registry` completed a read-only HKCU Environment query, and node-pty loaded its ConPTY native binding without spawning a terminal. The exact packaged CLI root help and `--version` fallback both exited 0; as before, `--version` produces help rather than a distinct version value, so the app version claim comes from the live runtime status.

### Isolated final-package runtime

The exact `kernel-rework-candidate/win-unpacked/Orca.exe` was started with `Start-Process -WindowStyle Hidden`, `--user-data-dir` set to `W-QA/final-package-runtime/profile`, and matching `ORCA_USER_DATA_PATH`, `ORCA_EXPERIMENT_CODEX_SYSTEM_HOME`, and `ORCA_CLI_COMMAND`. The profile, experiment system home, Git scratch folder, and every generated marker remained under the authorized W-QA evidence directory.

| Check | Result |
| --- | --- |
| Exact application identity | PASS; PID `122580`, exact package executable, product version `1.4.188.0` |
| Runtime discovery and readiness | PASS; isolated profile named PID `122580` and runtime `94c76638-b9de-41d1-860f-eeff787492ea`; exact packaged CLI returned app `1.4.188`, runtime reachable/ready, graph ready |
| Scratch registration | PASS; exact CLI registered only `final-package-runtime/scratch-folder` as repo `619401b4-491e-455e-bbae-727bc3c04b34` |
| Real PTY command | PASS; handle `term_4c7b8faa-0c7a-4027-bb69-75caf7f54485`, PTY suffix `@@699d3143`, incarnation `e68923f8-d063-49b6-8759-c7ef17f43ecc`; CLI output and files both showed `FINAL_PACKAGE_PTY_OK` and the exact scratch cwd |
| Direct terminal close | BOUNDED ANOMALY; first call timed out, retry returned `ptyKilled=false`, `ptyStopVerdict=unverifiable`, and inventory still showed the exact PTY connected/writable |
| Terminal cleanup fallback | PASS; `terminal send --text exit --enter` targeted only the exact owned PowerShell handle, `terminal wait --for exit` was satisfied with reported exit code 1, and authoritative worktree inventory then returned zero terminals |
| Exact application cleanup | PASS; seven top-level windows belonging only to verified PID `122580` received standard `WM_CLOSE`, all posts succeeded, and the PID exited within 30 seconds |
| Final isolation state | PASS; exact candidate CLI returned app/runtime `not_running`, and zero processes remained whose executable path was under the final package root |

The close anomaly is preserved rather than rewritten as a clean direct close. It did not prevent bounded acceptance because the exact session accepted its own graceful `exit`, disappeared from authoritative inventory, and no owned resource remained; it is not evidence that an unknown or remote process exited.

The bounded runtime controls were:

```powershell
$env:ORCA_EXPERIMENT_CODEX_SYSTEM_HOME = '<W-QA>/final-package-runtime/system-codex-home'
$env:ORCA_USER_DATA_PATH = '<W-QA>/final-package-runtime/profile'
$env:ORCA_CLI_COMMAND = '<kernel-rework-candidate>/win-unpacked/resources/bin/orca.exe'
Start-Process -FilePath '<kernel-rework-candidate>/win-unpacked/Orca.exe' `
  -ArgumentList "--user-data-dir=$env:ORCA_USER_DATA_PATH" -WindowStyle Hidden -PassThru
& $env:ORCA_CLI_COMMAND status --json
& $env:ORCA_CLI_COMMAND repo add --path '<W-QA>/final-package-runtime/scratch-folder' --json
& $env:ORCA_CLI_COMMAND terminal create --worktree 'path:<scratch-folder>' `
  --title W-QA-FINAL-PACKAGE --command 'powershell.exe -NoLogo -NoProfile' --json
& $env:ORCA_CLI_COMMAND terminal send --terminal term_4c7b8faa-0c7a-4027-bb69-75caf7f54485 `
  --text '<evidence-local marker/cwd command>' --enter --json
& $env:ORCA_CLI_COMMAND terminal read --terminal term_4c7b8faa-0c7a-4027-bb69-75caf7f54485 --limit 120 --json
& $env:ORCA_CLI_COMMAND terminal close --terminal term_4c7b8faa-0c7a-4027-bb69-75caf7f54485 --json
& $env:ORCA_CLI_COMMAND terminal send --terminal term_4c7b8faa-0c7a-4027-bb69-75caf7f54485 --text exit --enter --json
& $env:ORCA_CLI_COMMAND terminal wait --terminal term_4c7b8faa-0c7a-4027-bb69-75caf7f54485 --for exit --timeout-ms 30000 --json
& $env:ORCA_CLI_COMMAND terminal list --worktree 'path:<scratch-folder>' --json
# Enumerate top-level windows for verified PID 122580 only, PostMessage(WM_CLOSE), then wait 30 seconds.
& $env:ORCA_CLI_COMMAND status --json
```

No model/account login, controller agent, D0 switch, stable profile access, runtime/profile mutation outside the evidence tree, or rendered UI action was performed. Existing focused tests prove exact exported controller-handle recovery, and W0 owns the actual post-switch D0 proof; this isolated plain PowerShell smoke does not substitute for either. Raw evidence is under `W-evidence/W-QA/final-package/` and `W-evidence/W-QA/final-package-runtime/`.

## Remote delivery

- Source-QA commit `4706f942af80c795826145047062cf0211c557e9` was pushed to both `origin/songconmaisaix31-design/dual-0911-kernel-qa` and `standalone/songconmaisaix31-design/dual-0911-kernel-qa` without force.
- This follow-up report is delivered only to the same-name standalone branch, preserving the origin branch; its exact verified tip is recorded in the worker handoff.

## Remaining limits

- The runtime validation was deliberately nonvisual and limited to isolated process readiness, candidate CLI RPC, evidence-local scratch commands, exact-identity warm restart, and owned-resource shutdown; it did not exercise product or model/account work.
- The package is an unpacked directory, not an installer; signing and publishing were not performed.
- No Electron skill was available in this session, so no rendered Orca UI validation was attempted or claimed.
- Visual Studio native compilation remains unavailable; W-QA did not rebuild native code or install system tooling.
- Stable and D0 runtime profiles, credentials, running applications, Docker resources, production code, lockfiles, and root configuration were not changed. The only generated runtime/profile state is the disposable evidence-local tree documented above.
- The rejected `3b97f0e3` follow-up was source-tested only; no application, packaged candidate, model session, D0 replacement, rendered UI, or control workaround was launched for it.
- The rejected `6bf37be6` rework checkpoint was source-tested only; it was not used to replace the active Fork or mutate any live runtime.
