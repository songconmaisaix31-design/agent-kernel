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
git archive --format=tar "$SOURCE_SHA" > /tmp/orca-source-${SOURCE_SHA}.tar
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
used to build the builder image. The script runs `pnpm install --frozen-lockfile --force`
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

The resulting `kernel-linux-artifacts-<SHA>/` contains:

- `packages/orca-linux.AppImage` and the versioned `orca-ide_*.deb`;
- `LICENSE` and the packaged upstream runtime resources contained by the existing
  electron-builder configuration; and
- `build-log.txt`, with the archive source SHA and actual staged artifact paths
  and checksums.

Do not run `AppRun`, add `--no-sandbox`, publish ports, or treat artifact creation
as a readiness check. W0 must separately decide whether the Docker namespace and
sandbox policy permits a direct, unwrapped, unprivileged startup.
