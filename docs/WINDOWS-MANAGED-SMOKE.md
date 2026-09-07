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

No supported process-local system-home source override exists in the inspected HOST path. `getSystemCodexHomePath()` in `src/main/codex/codex-home-paths.ts` unconditionally returns `join(homedir(), '.codex')`; `ORCA_USER_DATA_PATH` changes only the managed target, while `CODEX_HOME`/`ORCA_CODEX_HOME` are used for real-home lane routing and do not change the source passed to `syncSystemCodexResourcesIntoManagedHome()`.

The precise minimum missing capability is an approved, process-local way to set the *system resource source* used by `getSystemCodexHomePath()` (or an explicit source parameter passed through the existing sync call) to an experiment-owned directory. It must be paired with an authorized authentication seed that does not copy or link daily Codex files; neither capability exists in the inspected code, so no candidate launch is authorized.

## Static diagnostics and accounting

`C:\Users\DW\AppData\Local\OrcaKernelLab\body-smoke-20260907\plan-static.log` contains 18 diagnostics: 16 style-only findings in `kernel-plan.ts` (three `interface` aliases, one regex escape, and brace enforcement) plus two `new Array(singleArgument)` style findings in `kernel-plan.test.ts`. They are mechanical lint ownership for the original plan track, not behavior/security repairs; no source was changed and the static suite is not claimed green.

The pre-existing `usage-start.json`/`usage-deltas.json` records were read only. This aborted *candidate smoke* created no model session, so it has no smoke-session token segment; the new standard environment executor session is `01a07bc8-e3e5-7bd3-ba9d-038c143526a7`, sourced from `CODEX_SESSION_ID`. Its usage evidence location is the active executor/session runtime rather than this report; no readable task-local usage record exists (0 records under `native-run` beyond the pre-existing root usage file), so no token count is inferred from wall time.

## Required next action

Before a real managed smoke, provide an approved isolation design that prevents the runtime-home service from creating writable junctions/copies to the daily `~/.codex` resources while preserving any authorized existing authentication. Then rerun only the bounded Run → Task → `worker-start` / observable `worker-stop` path with the same one-task, one-stop, one-attempt limits.
