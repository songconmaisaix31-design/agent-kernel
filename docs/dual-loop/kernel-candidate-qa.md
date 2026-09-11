# Kernel candidate source QA

## Verdict

Source QA, bounded compiled-output inspection, and inactive Windows package inspection passed for candidate `4b207b1a4a442cfe68ba08037eb52cf7a74ad651` on branch `songconmaisaix31-design/dual-0911-kernel-qa`.

This does not establish full application launch, Electron-rendered UI, installer, signing, publishing, or running-profile acceptance.

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

## Remote delivery

- Source-QA commit `4706f942af80c795826145047062cf0211c557e9` was pushed to both `origin/songconmaisaix31-design/dual-0911-kernel-qa` and `standalone/songconmaisaix31-design/dual-0911-kernel-qa` without force.
- This follow-up report is delivered only to the same-name standalone branch, preserving the origin branch; its exact verified tip is recorded in the worker handoff.

## Remaining limits

- No full Orca application launch, daemon-service start, or profile-backed workflow was performed.
- The package is an unpacked directory, not an installer; signing and publishing were not performed.
- No Electron skill was available in this session, so no rendered Orca UI validation was attempted or claimed.
- Visual Studio native compilation remains unavailable; W-QA did not rebuild native code or install system tooling.
- No runtime profile, credentials, running application, Docker resource, production code, lockfile, or root configuration was changed.
