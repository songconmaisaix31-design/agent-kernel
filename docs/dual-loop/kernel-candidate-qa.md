# Kernel candidate source QA

## Verdict

Source QA passed for candidate `4b207b1a4a442cfe68ba08037eb52cf7a74ad651` on branch `songconmaisaix31-design/dual-0911-kernel-qa`.

This is a source and Node-level verdict only. It does not establish packaged-artifact, Electron-rendered UI, native-module rebuild, or running-app acceptance.

## Provenance

- Required baseline: `01bd406abb787a6b2fd8064e66bcefb75971b8ff`
- Original first source commit: `1e3f77ea6ee246ace2db17aef04148700a7962d0`
- Original final source commit: `cdf279512519017976557f7e76f857286f5f1098`
- Candidate under test: `4b207b1a4a442cfe68ba08037eb52cf7a74ad651`
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

## Remaining limits

- W-PACK's separately built artifact was not available during this source QA and was not inspected or executed.
- No Electron skill was available in this session, so no rendered Orca UI validation was attempted or claimed.
- Visual Studio native compilation is unavailable in the stated environment; native rebuild/build was not retried and no system tooling was installed.
- No runtime profile, credentials, running application, Docker resource, production code, lockfile, or root configuration was changed.
