# Night 2026-09-11 Linux readiness

## Scope and evidence boundary

This is a source-and-configuration assessment of Agent-Kernel Fork commit
`01bd406abb787a6b2fd8064e66bcefb75971b8ff`. It did not run Docker, build an
artifact, change a profile, or launch a runtime. Therefore, the **source
inference** below is not Linux runtime proof. The historical `2777dddd343e`
image must not be used as Fork acceptance evidence.

The checkout has `origin` at `songconmaisaix31-design/orca-kernel` and the
separate `standalone` remote at `songconmaisaix31-design/agent-kernel`; source
and package conclusions here apply only to this checkout and commit.

## Actual entry and staged artifact

- Source CLI entry: `src/cli/index.ts`; package `bin.orca` resolves to
  `out/cli/index.js`. The `serve` command is local-only and is dispatched by
  that CLI.
- Packaged Linux entry: `resources/bin/orca-ide`, with `AppRun` for the
  AppImage. `src/main/startup/appimage-cli-redirect.ts` redirects an AppImage
  `serve` invocation to `resources/app.asar.unpacked/out/cli/index.js` under
  Electron-as-Node, then the CLI starts the Electron serve child.
- Build from this Fork requires Node 24 and the pinned pnpm 10.24.0. The
  supported package pipeline is `pnpm install --frozen-lockfile`, followed by
  `pnpm run build:linux`; it produces AppImage and deb through
  `electron-builder`.
- The Linux package includes the AppImage/deb entry points plus packaged
  runtime resources, `agent-browser-linux-${arch}`, and the computer-use Linux
  runtime. `node-pty` is the relevant Electron native dependency; postinstall
  uses `@electron/rebuild`, and Linux packaging rejects bundled native objects
  above the glibc 2.31 floor.

## Small Docker recipe (W0-owned execution)

Build on an Ubuntu 20.04 (glibc 2.31) build environment or a verified prebuilt
native dependency set that passes the packaging gate; Ubuntu 22.04 has glibc
2.35 and is not itself the ABI floor. The current `Dockerfile.build` uses
Node 24 Bookworm, so it is useful for staging but must not be treated as a
glibc-2.31 native build environment. In an isolated Linux volume (never reuse
Windows `node_modules`), W0 should install the locked dependencies and build
on Ubuntu 20.04, then run `pnpm run build:linux` and retain the package gate's
native-symbol result before placing `dist/orca-linux.AppImage` in an unprivileged runtime image
with a private writable HOME/XDG state directory, no host HOME, repository, or
Docker socket mount, and no public published control port.

Install the documented runtime libraries, including `xvfb`, `zlib1g-dev`, GTK,
NSS, GBM, and X11 libraries. In Docker, extract the AppImage once without FUSE
and launch the extracted `squashfs-root/orca-ide serve --port 0 --pairing-address <reachable-private-host> --json`.
Do not pass `--no-sandbox`, `ELECTRON_DISABLE_SANDBOX`, privileged mode, extra
capabilities, or a sandbox-relaxing seccomp profile. `orca serve` starts Xvfb
itself when `DISPLAY` is unset and emits the versioned `orca_server_ready`
JSON contract after listener and pairing initialization.

## Current blockers and smallest proposed write paths

1. **No Fork runtime proof exists in this task.** This Windows checkout has no
   `node_modules`; no Linux build, package, or container was executed. W0 must
   generate an artifact from this exact commit and run the recipe on the Linux
   target before readiness can be claimed.
2. **Existing Docker acceptance harnesses do not preserve Chromium sandbox.**
   `config/docker/headless-pairing/run-appimage-case.sh` defaults
   `ORCA_TEST_NO_SANDBOX` to `1`; `config/docker/headless-serve-shutdown/run-signal-case.sh`
   hard-codes `AppRun --no-sandbox` or `ELECTRON_DISABLE_SANDBOX=1`. Their
   current success can establish functional headless paths only with sandbox
   disabled, not the requested security property.
3. **The likely Docker sandbox gate is environmental, not a source defect.**
   Historical local evidence recorded the unmodified Electron launch failing
   during namespace setup under Docker's default seccomp (`Operation not
   permitted`), while a wrapper's fallback added `--no-sandbox`. If this repeats
   against the Fork artifact, retain the evidence and use a VM/host route;
   do not broaden container privileges or disable the sandbox.

If W0 authorizes a follow-up test-only remediation, the smallest candidate
write paths are exactly:

- `config/docker/headless-pairing/run-appimage-case.sh`
- `config/scripts/run-headless-linux-pairing-docker.mjs`
- `config/docker/headless-serve-shutdown/run-signal-case.sh`
- `config/scripts/run-headless-serve-shutdown-docker.mjs`

The remediation now exposes an opt-in `--require-sandbox` mode on both Docker
runners. It selects the extracted `orca-ide` binary, binds argv inspection to
the launch process tree, rejects sandbox-disable flags and environment
variables, and fails closed on a namespace denial; existing functional mode
remains separate. Its pairing runner performs a startup-only secure check and
reports that scope explicitly instead of claiming the full pairing suite.

## Validation required after staging

1. Confirm `pnpm install --frozen-lockfile`, `pnpm run build:linux`, and the
   Linux packaging glibc-floor check succeed on the selected Linux builder.
2. In the unprivileged container, verify `/proc/<electron-pid>/cmdline` contains
   neither `--no-sandbox` nor sandbox-disabling environment variables, and
   preserve the exact failing Chromium diagnostic if it exits first.
3. Require one compact JSON line with `type:"orca_server_ready"` and
   `schemaVersion:1`; validate its bound and advertised endpoints without
   recording the pairing URL or credential.
4. Treat remote reachability under the SSH execution boundary as `live`,
   `unverifiable`, or `exited` only. Any later wire change must retain optional
   fields or capability-negotiate stream opcodes for mixed-version clients.
