# Windows managed smoke — 2026-09-07

## Scope and provenance

- Candidate: `songconmaisaix31-design/kernel-v01-candidate` at `64d28fdb4834b5f104c9f64be958399f2f9ffe3c` (clean before this evidence document).
- Formal checkout was read-only verified as `kernel/v01-managed-dispatch` at `a5cb9516ded51381fbe681fed5627f0baf243240`; its pre-existing `V01-TODO.md` modification was not touched.
- This record is a bounded environment/protection result, not a desktop, Worker, or model-execution pass.

## Native runtime checks

- Verified the approved Electron ZIP at `C:\Users\DW\AppData\Local\electron\Cache\a791fa12f2db1c58c084ec41c5caf1ac518de84788ba857a6bebef2fe9349ed3\electron-v43.1.0-win32-x64.zip`: 144237574 bytes and SHA-256 `A07DC1E3D5E589593D37E3B19D1B373E02BB58270E2EB0D6633EEE0198AD09F0`.
- Checked 75 archive entries for rooted or traversal paths and required exactly one root `electron.exe`; extracted only to `C:\Users\DW\AppData\Local\OrcaKernelLab\runtime\electron-43.1.0-win32-x64` after confirming that target was absent.
- Extracted `electron.exe` reports `v43.1.0`, is PE `0x8664`, and has SHA-256 `67CFF2CE5AC7976408AAC30E17E9266443A351B44EC1EE613B444867A78DC9D7`.
- Candidate `windows-native-registry@3.2.2` resolves through a candidate-local junction to `node_modules\.pnpm\windows-native-registry@3.2.2\node_modules\windows-native-registry`; its missing addon was copied only to that real path from the approved installed Orca source. Source and target are 155408-byte PE `0x8664` files with SHA-256 `5D5BB2D9FC233A3A115C3EC11F3D378569A12AA120DC5E6794E8546293CC250A`.
- Direct check-only execution used the extracted Electron with `ELECTRON_RUN_AS_NODE=1`: `electron.exe config/scripts/ensure-native-runtime.mjs --check-only`, exit 0. `ELECTRON_RUN_AS_NODE` was removed before any possible desktop launch.

## Protection stop

No candidate desktop, managed Run, Task, Worker, or model session was started. `src/main/codex/codex-home-paths.ts` resolves the system home as `~/.codex` and `syncSystemCodexResourcesIntoManagedHome` creates Windows junctions for system `skills`, `hooks`, `plugins`, `plugin-state`, `profile-v2`, `themes`, and `prompts`; `src/main/codex-accounts/runtime-home-service.ts` invokes that sync for runtime and per-account homes. Therefore an independent profile under `C:\Users\DW\AppData\Local\OrcaKernelLab\body-smoke-20260907\native-run\profile` could create writable links back to daily Codex resources, which exceeds the task's no-writeback/no-writable-link boundary; the authorized smoke stopped before profile materialization.

One command deviation is recorded: `node config/scripts/ensure-native-runtime.mjs --runtime=electron` was invoked once before the direct check-only command. The retained stdout proves its Electron child check failed on the absent `node_modules/electron/dist/version`, then `rebuild-native-deps.mjs` ran, skipped optional `cpu-features`, reset the partial Electron package path, and invoked its Electron-install child; the outer/child exit status was not retained by the command transcript, so it is unknown rather than assumed successful or failed. Post-call read-only inspection proves candidate `node_modules/.pnpm/electron@43.1.0/node_modules/electron/dist` and `path.txt` are still absent; all package-file timestamps remain 2026-09-06, no Electron or pnpm process remains, and no post-20:00 artifact was found in the Electron or pnpm cache roots inspected. This excludes a completed candidate install/rebuild and known live residual from that invocation, but does not prove that the attempted downloader made no network request; no repair entrypoint was rerun.

## Existing system-home override check

`ORCA_EXPERIMENT_CODEX_SYSTEM_HOME` is now an explicit Windows-only candidate-process source override. It defaults to the existing `homedir()/.codex` behavior when absent; when present it requires absolute system and profile paths under `%LOCALAPPDATA%\OrcaKernelLab`, resolves existing ancestors, rejects paths or existing sub-resource links that escape that root, and never falls back to the daily home. The managed target, system resource/config source, auth readback/writeback source, and host session source are therefore all constrained to the experiment root.

The runtime-home service disables the real-home lane while the override is enabled, rejects invalid paths before launch/rate-limit preparation side effects, and ignores custom host session-source settings in favor of the experiment system home. Main-index AiVault/resume and migration source calls use the same effective source. `config/scripts/run-windows-managed-smoke.mjs` validates the root and existing nested links before any `mkdir`, then creates only `native-run/system-home` and `native-run/profile`; its actual child environment strips inherited agent/session, Orca runtime-binding, Electron test/override, and provider variables before passing only the experiment source/profile variables plus ordinary system environment. It neither copies daily credentials nor launches a worker; authentication remains an explicit later experimental-login decision.

## Static diagnostics and accounting

`C:\Users\DW\AppData\Local\OrcaKernelLab\body-smoke-20260907\plan-static.log` contains 18 diagnostics: 16 style-only findings in `kernel-plan.ts` (three `interface` aliases, one regex escape, and brace enforcement) plus two `new Array(singleArgument)` style findings in `kernel-plan.test.ts`. The two sparse-array tests retain their original semantics; all 18 remain mechanical lint ownership for the original plan track, no source was changed, and the static suite is not claimed green.

Targeted validation after the change: `pnpm exec vitest run --config config/vitest.config.ts src/main/codex/codex-home-paths.test.ts src/main/codex-accounts/runtime-home-real-home-lane-routing.test.ts config/scripts/run-windows-managed-smoke.test.mjs` reported 28 passed, 3 Windows-only skips; `pnpm run typecheck:node` passed. The launcher test uses a real Node child and proves the selected experiment paths survive while inherited `CODEX_HOME`, session, Orca-dev, and Electron override variables do not. No desktop or Worker was started.

Affected artifacts: direct CLI TypeScript compilation completed, and `pnpm run build:electron-vite` completed main (3117 modules) and preload before the existing renderer asset failure (`resources/openclaude-logo.png`, `resources/logo.svg`, and related missing `resources/*` imports). This source-independent renderer failure was not repaired. The approved direct Electron command `ELECTRON_RUN_AS_NODE=1 <experimental-electron> config/scripts/ensure-native-runtime.mjs --check-only` completed successfully; neither test override nor `ELECTRON_RUN_AS_NODE` is passed by the launcher to a desktop child.

The pre-existing `usage-start.json`/`usage-deltas.json` records were read only. This aborted *candidate smoke* created no model session, so it has no smoke-session token segment; the new standard environment executor session is `01a07bc8-e3e5-7bd3-ba9d-038c143526a7`, sourced from `CODEX_SESSION_ID`. Its usage evidence location is the active executor/session runtime rather than this report; no readable task-local usage record exists (0 records under `native-run` beyond the pre-existing root usage file), so no token count is inferred from wall time.

## Required next action

The source override is implemented but desktop/model execution remains unperformed. Before the bounded Run → Task → `worker-start` / observable `worker-stop` path, use only an already-authorized independent experimental login in `native-run/system-home`; do not copy daily credentials or begin a paid flow.
