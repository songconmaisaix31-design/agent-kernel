# Kernel candidate QA

## Verdict

Source QA, bounded compiled-output inspection, inactive Windows package inspection, and an isolated nonvisual packaged-runtime smoke passed for candidate `4b207b1a4a442cfe68ba08037eb52cf7a74ad651` on branch `songconmaisaix31-design/dual-0911-kernel-qa`.

This does not establish Electron-rendered UI, installer, signing, publishing, model/account behavior, or acceptance in a stable/D0 profile.

## Provenance

- Required baseline: `01bd406abb787a6b2fd8064e66bcefb75971b8ff`
- Original first source commit: `1e3f77ea6ee246ace2db17aef04148700a7962d0`
- Original final source commit: `cdf279512519017976557f7e76f857286f5f1098`
- Candidate under test: `4b207b1a4a442cfe68ba08037eb52cf7a74ad651`
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

## Remote delivery

- Source-QA commit `4706f942af80c795826145047062cf0211c557e9` was pushed to both `origin/songconmaisaix31-design/dual-0911-kernel-qa` and `standalone/songconmaisaix31-design/dual-0911-kernel-qa` without force.
- This follow-up report is delivered only to the same-name standalone branch, preserving the origin branch; its exact verified tip is recorded in the worker handoff.

## Remaining limits

- The runtime validation was deliberately nonvisual and limited to isolated process readiness, candidate CLI RPC, one scratch folder/terminal command, and owned-resource shutdown; it did not exercise product or model/account work.
- The package is an unpacked directory, not an installer; signing and publishing were not performed.
- No Electron skill was available in this session, so no rendered Orca UI validation was attempted or claimed.
- Visual Studio native compilation remains unavailable; W-QA did not rebuild native code or install system tooling.
- Stable and D0 runtime profiles, credentials, running applications, Docker resources, production code, lockfiles, and root configuration were not changed. The only generated runtime/profile state is the disposable evidence-local tree documented above.
