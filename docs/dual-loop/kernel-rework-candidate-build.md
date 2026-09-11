# Kernel rework candidate build

## Fixed source and authorization

- Worktree: `C:/Users/DW/orca/workspaces/orca-kernel/dual-0911-rework-candidate`.
- Branch: `songconmaisaix31-design/dual-0911-rework-candidate`.
- Push target: `standalone`, `https://github.com/songconmaisaix31-design/agent-kernel.git`.
- Exact base: `4b207b1a4a442cfe68ba08037eb52cf7a74ad651`.
- Build source commit: `516da10cd7ad26bc8a4d3a7900b9e22c304a66c5`.
- Build source tree: `2a2d5bd8f4158ef12691909ab500d3431d56ddad`.
- This report is a subsequent documentation-only commit; it was not part of the build input.

W0 authorized the complete corrected INPUT chain in message `msg_ac75bba7e764`, superseding its earlier rejection of the first INPUT commit alone. W0 then authorized the complete REWORK chain in `msg_e5708ba69722`. No intermediate rejected commit was built or packaged alone, and no domain fixes were authored in this integration lane.

| Approved source commit                     | Applied candidate commit                   |
| ------------------------------------------ | ------------------------------------------ |
| `3b97f0e3118e6fb21771b74e14a496b4fade2a24` | `088b0b916a2610e9e047e60ea79dc10e78eaf683` |
| `7349ee2bc945dd71c8d27e3ae18f2c2cd0a22a5f` | `807163c565663fd5e60cea72c64fe6c6aebaf2fb` |
| `7e6f721aa175cb02edee12004b96e218504b56db` | `3dd2d0a1daba3a0816780a87ef9bd8fb60915825` |
| `6bf37be657ce204fef30d50523b6dd984c471be8` | `00d215f46528c8a9f89ba72a19534cf0ccd6b80a` |
| `51e43c9af8ca4c183179ea81ae0020e4f80a6ded` | `516da10cd7ad26bc8a4d3a7900b9e22c304a66c5` |

Both cherry-pick commands exited 0 without conflicts. The five INPUT paths exactly match `7e6f721`; the eleven net REWORK paths exactly match `51e43c9`. The intermediate REWORK edit to `orchestration-kernel.test.ts` was restored by its second commit. No root configuration or lockfile content changed.

## Dependencies and native runtime

Evidence directory: `C:/Users/DW/AppData/Local/OrcaKernelLab/night/dual-20260911-103612/W-evidence/W-PACK2`.

- Host: Windows x64, Node `24.16.0`, pnpm `10.24.0`.
- `pnpm install --offline --frozen-lockfile --ignore-scripts` exited 0: 1,280 packages reused, zero downloaded.
- Unchanged `pnpm-lock.yaml` SHA-256: `C202FBBC4697E8AD339685482E8738284F0A740D25A44CE63DAC6BE461E68DA7`.
- `prepare-runtime.cjs` in the evidence directory exited 0. It validated the cached Electron archive against the locked package's checksums and extracted only into this worktree's ignored dependency directory.
- Cached `electron-v43.1.0-win32-x64.zip` SHA-256: `A07DC1E3D5E589593D37E3B19D1B373E02BB58270E2EB0D6633EEE0198AD09F0`.
- Actual runtime: Electron `43.1.0`, embedded Node `24.18.0`, ABI `148`, N-API `10`.
- Read-only addon input: `kernel-candidate/win-unpacked/resources/node_modules/windows-native-registry/build/Release/native.node`, package `3.2.2`, 155,408 bytes, SHA-256 `5D5BB2D9FC233A3A115C3EC11F3D378569A12AA120DC5E6794E8546293CC250A`.
- The original addon loaded under this candidate's Electron before an identical copy was placed in its local dependency directory. No other checkout, old package, model authentication, installed profile, or system toolchain was modified.
- `ELECTRON_RUN_AS_NODE=1 <candidate Electron> config/scripts/ensure-native-runtime.mjs --check-only` exited 0.
- With `ORCA_REUSE_PREPARED_NATIVE_RUNTIME=1`, `node config/scripts/rebuild-native-deps.mjs --platform=win32 --arch=x64` exited 0 before packaging; the package hook also passed. Both reported that native modules already loaded and skipped rebuilding.

## Source and build validation

The combined suite used the 17 exact paths in `combined-test-paths.txt`. Its JSON report is `combined-tests.json`, with per-file counts in `combined-test-counts.json`. The earlier INPUT-only run passed 1,280 tests across four files; the final combined result is **1,861 passed, zero failed, across 17 files**.

The following PowerShell commands identify the exact final test invocation and evidence paths:

```powershell
$evidence = 'C:/Users/DW/AppData/Local/OrcaKernelLab/night/dual-20260911-103612/W-evidence/W-PACK2'
$tests = @(Get-Content "$evidence/combined-test-paths.txt")
pnpm exec vitest run --config config/vitest.config.ts @tests --reporter=default --reporter=json --outputFile.json="$evidence/combined-tests.json"
```

| Command / gate                                                                                 | Exit and result                                                |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Combined Vitest command above                                                                  | 0; 17 files, 1,861 tests                                       |
| `pnpm run typecheck:node`                                                                      | 0                                                              |
| `pnpm run typecheck:cli`                                                                       | 0                                                              |
| `pnpm run typecheck:web`                                                                       | 0                                                              |
| `pnpm exec oxlint <14 changed TypeScript paths>`                                               | 0                                                              |
| `pnpm exec oxfmt --check <16 changed paths>` after exact LF materialization                    | 0                                                              |
| `git diff --check 4b207b1a4a442cfe68ba08037eb52cf7a74ad651 HEAD` at build source               | 0                                                              |
| `pnpm run build:relay`                                                                         | 0; six platform/architecture bundles and WSL hook relay        |
| `pnpm exec tsc -p config/tsconfig.cli.json --outDir out --composite false --incremental false` | 0                                                              |
| `node config/scripts/verify-cli-bin.mjs --fix-executable --fix-package-json`                   | 0; only compiled output metadata                               |
| `pnpm run build:electron-vite` after tracked resource recovery                                 | 0                                                              |
| `pnpm run verify:built-skills-cli`                                                             | 0; 412 closure files, five commands                            |
| `pnpm run build:web-from-renderer`                                                             | 0; 884 projected files, 42.6 MiB                               |
| Original native gate above                                                                     | 0                                                              |
| Directory packaging below                                                                      | 0                                                              |
| `node "$evidence/verify-candidate.cjs"` at build source HEAD                                   | 0; 66 package/build byte comparisons and packaged native probe |

`combined-paths.txt` records the exact 16 changed paths; filtering that list to `.ts` gives the lint arguments. CLI compilation deliberately used the compiler and repository verifier directly because `build:cli` also invokes the development CLI installer, which was outside scope.

Retained failures and their disposition:

- `check:max-lines-ratchet` exited 1 on both the untouched base and combined source, reporting the same 18 stale `mobile-config` entries in this sparse checkout. It remains a known failing check; no baseline pruning, suppression, or configuration change was made. Logs: `base-max-lines.log`, `combined-max-lines.log`.
- Initial scoped format checks exited 1 because all 16 checked-out files used CRLF. Exact committed blobs passed the formatter unchanged. W0 authorized LF materialization; `checkout-index` left the up-to-date CRLF files in place, so a binary-safe export of the exact Git blobs was used instead. The final scoped format check passed, with no staged or source content change. Raw failures, blob comparisons, and final pass are retained in the format logs.
- The first Electron build exited 1 because sparse checkout omitted all of `resources/`. The 83 tracked files were restored only into this worktree from the fixed source using `git -c core.autocrlf=false restore --ignore-skip-worktree-bits --source=HEAD --worktree -- resources`. Base and candidate both have resource tree `78236144d3e58a7001a6b3bc8c33cc4321c1695e`; the source diff remained empty. W0 explicitly authorized this recovery in `msg_120801e202cb`. The retry passed; both build logs are retained.
- The first packaging invocation exited 1 before creating an artifact because PowerShell split unquoted dotted `-c.*` arguments. Quoting the complete arguments fixed the invocation; only packaging was retried.
- Initial external package-verifier probes used POSIX paths with the Windows ASAR API and exited 1. Native path normalization fixed the verifier, and the final verification passed without changing package bytes. The final log is `verify-candidate-platform-paths.log`.

## Fixed package

Directory: `C:/Users/DW/AppData/Local/OrcaKernelLab/night/dual-20260911-103612/kernel-rework-candidate/win-unpacked`.

Executable: `C:/Users/DW/AppData/Local/OrcaKernelLab/night/dual-20260911-103612/kernel-rework-candidate/win-unpacked/Orca.exe`.

The successful command used only the existing repository configuration and local prepared Electron distribution:

```powershell
$env:ORCA_REUSE_PREPARED_NATIVE_RUNTIME = '1'
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
$env:ORCA_BUILD_COMMIT = '516da10cd7ad26bc8a4d3a7900b9e22c304a66c5'
Remove-Item Env:CSC_LINK,Env:CSC_KEY_PASSWORD,Env:WIN_CSC_LINK,Env:WIN_CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
pnpm exec electron-builder --config config/electron-builder.config.cjs --dir --win --x64 --publish never '-c.directories.output=C:/Users/DW/AppData/Local/OrcaKernelLab/night/dual-20260911-103612/kernel-rework-candidate' '-c.electronDist=node_modules/electron/dist' '-c.win.signExecutable=false'
```

The package hook built the Windows CLI launcher, validated the packaged daemon entry under plain Node, and verified the bundled plugin. The log explicitly records that file signing was skipped. There was no installer, publishing, system registration, desktop launch, or runtime switch.

| Package file                                                               |     Bytes | SHA-256                                                            |
| -------------------------------------------------------------------------- | --------: | ------------------------------------------------------------------ |
| `Orca.exe`                                                                 | 225470464 | `7EEF1E2BC1BB70086E468C84DE01E9A853189B2F20F8365B45FC47513A8C933E` |
| `resources/bin/orca.exe`                                                   |      6144 | `357AA4BF60EC8002AD7CDD78F7FC284B14300E9C6957C58F5B8B9A27AF3F8D9C` |
| `resources/app.asar`                                                       | 132784819 | `3629081F4824CCDA7F2BEDF72FDE44E8BB4983BA30A80BB49A07D50C9C69D287` |
| `resources/node_modules/windows-native-registry/build/Release/native.node` |    155408 | `5D5BB2D9FC233A3A115C3EC11F3D378569A12AA120DC5E6794E8546293CC250A` |
| `resources/app.asar.unpacked/out/main/daemon-entry.js`                     |    144402 | `C9F8DD4DF76D2C91339BB6C62631F178F581A3B6CF02D86230AE642F75E1C519` |

`artifact-metadata.json` contains these hashes, the 66 matched file paths, source identity, and packaged runtime versions. The packaged native check ran the final executable with `ELECTRON_RUN_AS_NODE=1`; it loaded the packaged registry addon and node-pty, performed a read-only registry query, and exited 0 without loading the desktop entrypoint. The original package's registry hash remained unchanged.

## Launch preconditions and remaining limits

W-QA owns independent isolated desktop/product execution; this report establishes source tests, build output, and package/native validation only. No real Worker/model, rendered UI, D0 switch, or cross-platform product acceptance is claimed here.

For a later Windows GUI launch, W-QA must select and record fresh absolute `ORCA_USER_DATA_PATH` and `ORCA_EXPERIMENT_CODEX_SYSTEM_HOME` paths beneath `%LOCALAPPDATA%/OrcaKernelLab`, with no symlink escapes or copied authentication. Both are required for the existing experimental-profile route: `ORCA_USER_DATA_PATH` alone does not redirect this packaged GUI. `ELECTRON_RUN_AS_NODE` must be absent for the GUI; it was used only by native probes. The CLI entry for that package is `resources/bin/orca.exe`, with the same profile environment. Profile creation and launch were not performed by W-PACK2.

The live D0/P controller's exact native handle restoration remains W0's gate before an actual switch; generic coordinator-handle remint remains a known limitation. Same-owner rework remains deliberately unsupported for remote, WSL, folder, released/orphaned/unknown, changed-process, and accepted-candidate cases described in the approved source report. The package is fixed for W-QA and must not be overwritten while it is under evaluation.
