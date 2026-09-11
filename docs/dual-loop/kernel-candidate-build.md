# Kernel candidate build report

## Candidate

- Base: `01bd406abb787a6b2fd8064e66bcefb75971b8ff`
- Applied in order: `1e3f77ea6ee246ace2db17aef04148700a7962d0`, then `cdf279512519017976557f7e76f857286f5f1098`
- Candidate: `4b207b1a4a442cfe68ba08037eb52cf7a74ad651`
- Source comparison: the authorized readiness paths match `cdf279512519017976557f7e76f857286f5f1098` exactly.

## Validation

- `pnpm install --frozen-lockfile --ignore-scripts` — passed; 1,280 packages reused from cache.
- `pnpm exec vitest run --config config/vitest.config.ts src/main/runtime/terminal-readiness-codex-prompt.test.ts src/main/runtime/orca-runtime.test.ts` — passed: 2 files, 1,191 tests.
- `pnpm run typecheck:node`, `pnpm run typecheck:cli`, `pnpm run typecheck:web` — passed.
- `pnpm run build:relay`; CLI TypeScript compilation plus `verify-cli-bin`; `pnpm run build:electron-vite`; `pnpm run verify:built-skills-cli`; `pnpm run build:web-from-renderer` — passed. The skills verifier reported 412 closure files and 5 commands; web projection reported 884 files and 42.6 MiB.

## Packaging boundary

`node config/scripts/build-windows-cli-launcher.mjs` passed and created the isolated launcher. Windows Electron-native validation then failed before packaging: `windows-native-registry@3.2.2` has no `build/Release/native.node`, and `node-gyp` reported `Could not find any Visual Studio installation to use` while attempting its rebuild. No installer, running profile, D0 runtime, global CLI, system toolchain, signing, publishing, or application launch was touched; consequently no runnable Windows package is claimed.

## Artifact

The compiled, non-packaged candidate output is copied to `C:/Users/DW/AppData/Local/OrcaKernelLab/night/dual-20260911-103612/W-evidence/W-PACK/out`. It is build evidence only, not an inactive runnable package; native toolchain repair and a fresh package validation remain required.
