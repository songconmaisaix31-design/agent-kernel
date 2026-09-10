# Night 20260911 Kernel Linux package recipe

This recipe builds the existing `build:linux` target from one exact Git archive.
It stages the AppImage, deb, and `LICENSE`, then records the source revision and
actual artifact checksums in a simple build log.

It deliberately has no runtime stage. The known upstream AppImage wrapper adds
`--no-sandbox`, while direct binary sandbox startup currently exits 133 under the
current Docker policy; W0 owns that policy gate and no result from this recipe is
runtime acceptance.

Run the commands from a Linux Docker host after this recipe is committed at the
source revision. `SOURCE_SHA` is the exact full commit ID and the named volume is
Linux-only: never mount or copy host/Windows `node_modules` into the container.

```bash
set -euo pipefail
SOURCE_SHA=01bd406abb787a6b2fd8064e66bcefb75971b8ff
BUILD_IMAGE=orca-kernel-linux-builder:${SOURCE_SHA}
MODULE_VOLUME=orca-kernel-linux-node-modules-${SOURCE_SHA}
ARTIFACT_DIR="$PWD/kernel-linux-artifacts-${SOURCE_SHA}"

git cat-file -e "${SOURCE_SHA}^{commit}"
git -c core.autocrlf=false archive --format=tar --output=/tmp/orca-source-${SOURCE_SHA}.tar "$SOURCE_SHA"
test ! -e "$ARTIFACT_DIR"
mkdir "$ARTIFACT_DIR"
docker volume create "$MODULE_VOLUME"
docker build --tag "$BUILD_IMAGE" --file config/docker/kernel-runtime/Dockerfile .
docker run --rm \
  --env ORCA_SOURCE_SHA="$SOURCE_SHA" \
  --mount type=bind,src=/tmp/orca-source-${SOURCE_SHA}.tar,dst=/input/orca-source.tar,readonly \
  --mount type=volume,src="$MODULE_VOLUME",dst=/workspace/source/node_modules \
  --mount type=bind,src="$ARTIFACT_DIR",dst=/artifacts \
  "$BUILD_IMAGE"
```

`git archive` is the product build input, not a substitute for the checkout
used to build the builder image. `core.autocrlf=false` keeps the Git blob's LF
bytes when a Windows host creates the archive. The script runs `pnpm install --frozen-lockfile --force`
before `pnpm run build:linux`, so the package lock and Linux native rebuild path
remain authoritative. The Ubuntu 20.04 builder supplies the supported glibc
floor while the copied official Node 24 toolchain retains its upstream glibc 2.28
baseline; existing electron-builder hooks still reject an invalid packaged native
binary.

Both builder base images are digest-pinned. `corepack enable pnpm` deliberately
enables only pnpm: the copied Node toolchain has a dangling Yarn link and broad
Corepack enablement fails before the package manager is available. The artifact
mount must be a new empty directory; the script rejects a non-empty target and
never clears an existing result.

On a Windows checkout, verify the archive preserves the entrypoint's LF content
before the Docker build; the image also normalizes this one copied script:

```powershell
$archive = Join-Path $env:TEMP "orca-entry-$PID.tar"
$extract = Join-Path $env:TEMP "orca-entry-$PID"
New-Item -ItemType Directory -Path $extract | Out-Null
git archive --format=tar --output=$archive HEAD config/docker/kernel-runtime/build-linux-artifact.sh
tar -xf $archive -C $extract
if ([IO.File]::ReadAllBytes((Join-Path $extract 'config/docker/kernel-runtime/build-linux-artifact.sh')) -contains 13) {
  throw 'Entrypoint archive contains CRLF'
}
Remove-Item -LiteralPath $archive, $extract -Recurse -Force
```

The resulting `kernel-linux-artifacts-<SHA>/` contains:

- `packages/orca-linux.AppImage` and the versioned `orca-ide_*.deb`;
- `LICENSE` and the packaged upstream runtime resources contained by the existing
  electron-builder configuration; and
- `build-log.txt`, with the archive source SHA and actual staged artifact paths
  and checksums.

Do not run `AppRun`, add `--no-sandbox`, publish ports, or treat artifact creation
as a readiness check. W0 must separately decide whether the Docker namespace and
sandbox policy permits a direct, unwrapped, unprivileged startup.

## Runtime review recipe

This is a Fork runtime image, assembled only from the final locally produced
`orca-linux.AppImage`; it does not reuse or identify as an upstream image. The
build extracts the AppImage without launching it, checks the supplied checksum,
and the runtime invokes `/opt/orca/squashfs-root/orca-ide serve` directly. That
layout carries the packaged CLI resources and unpacked daemon entry produced by
the existing Linux electron-builder configuration.

Create an isolated build context containing no repository, credentials, sockets,
or reference-only material. W0 supplies the actual output path and checksum.

```bash
set -euo pipefail
RUNTIME_CONTEXT=$(mktemp -d)
cp /path/to/final/orca-linux.AppImage "$RUNTIME_CONTEXT/orca-linux.AppImage"
cp config/docker/kernel-runtime/Dockerfile.runtime "$RUNTIME_CONTEXT/Dockerfile.runtime"
cp config/docker/kernel-runtime/run-orca-runtime.sh "$RUNTIME_CONTEXT/run-orca-runtime.sh"
export ORCA_RUNTIME_CONTEXT="$RUNTIME_CONTEXT"
export ORCA_APPIMAGE_SHA256=$(sha256sum "$RUNTIME_CONTEXT/orca-linux.AppImage" | awk '{print $1}')
export ORCA_RUNTIME_SECONDS=120
export ORCA_TASKS_DIR=/absolute/path/to/tasks
export ORCA_ASSETS_DIR=/absolute/path/to/assets
docker compose -p orca-night-20260911-005945 \
  -f config/docker/kernel-runtime/compose.runtime.yml config
```

The `config` command is a review-only render. W0 alone builds or starts it, with
the fixed remaining-seconds value; `restart: "no"` prevents a replacement run.
The only published port is loopback control traffic. HOME, code, and output are
separate named volumes; tasks and assets are read-only mounts, and neither a
Docker socket nor a host checkout is mounted into the product worker.

For the authorized user to log into the pinned official Codex CLI interactively,
without embedding a credential or claiming login success:

```bash
docker compose -p orca-night-20260911-005945 \
  -f config/docker/kernel-runtime/compose.runtime.yml run --rm --entrypoint codex orca login
```

This recipe does not apply a seccomp, namespace, capability, privileged, or
`--no-sandbox` exception. Default Docker sandbox behavior can therefore still
reject Electron startup; a built image, a rendered Compose config, or a manual
login is not runtime acceptance or evidence that a product worker ran.
