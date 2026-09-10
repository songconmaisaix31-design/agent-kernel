#!/usr/bin/env bash
set -euo pipefail

: "${ORCA_SOURCE_SHA:?ORCA_SOURCE_SHA must be the exact 40-character source commit}"

case "$ORCA_SOURCE_SHA" in
  '' | *[!0-9a-f]*) echo 'ORCA_SOURCE_SHA must be lowercase hexadecimal' >&2; exit 64 ;;
esac

if [[ ${#ORCA_SOURCE_SHA} -ne 40 ]]; then
  echo 'ORCA_SOURCE_SHA must be exactly 40 characters' >&2
  exit 64
fi

source_archive=/input/orca-source.tar
source_dir=/workspace/source
staging_dir=/artifacts

test -r "$source_archive"
test -d /workspace/source/node_modules
test -d "$staging_dir"
if find "$staging_dir" -mindepth 1 -print -quit | grep -q .; then
  echo "Artifact target must be new and empty: $staging_dir" >&2
  exit 73
fi

find "$source_dir" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf -- '{}' +
tar -xf "$source_archive" -C "$source_dir"

test -f "$source_dir/package.json"
test -f "$source_dir/pnpm-lock.yaml"
test -f "$source_dir/LICENSE"
test -d "$source_dir/resources"

cd "$source_dir"
# Reject incompatible toolchains before installing or compiling native modules.
compiler_version=$(g++ -dumpfullversion)
if ! dpkg --compare-versions "$compiler_version" ge 12.2; then
  echo "Node 24 native build requires GCC >= 12.2; found $compiler_version" >&2
  exit 69
fi
printf 'compiler=%s\n' "$compiler_version"
pnpm install --frozen-lockfile --force
pnpm run build:linux

artifact_dir=$(mktemp -d)
trap 'rm -rf "$artifact_dir"' EXIT
find release -maxdepth 1 -type f \( -name '*.AppImage' -o -name '*.deb' \) \
  -exec cp -- '{}' "$artifact_dir" \;

if ! compgen -G "$artifact_dir/*.AppImage" >/dev/null; then
  echo 'Linux packaging did not produce an AppImage' >&2
  exit 1
fi
if ! compgen -G "$artifact_dir/*.deb" >/dev/null; then
  echo 'Linux packaging did not produce a deb package' >&2
  exit 1
fi

install -d -m 755 "$staging_dir/packages"
cp -- "$artifact_dir"/* "$staging_dir/packages/"
install -m 644 LICENSE "$staging_dir/LICENSE"

{
  printf 'source_sha=%s\n' "$ORCA_SOURCE_SHA"
  printf 'package_manager=%s\n' "$(node -p "require('./package.json').packageManager")"
  printf 'electron=%s\n' "$(node -p "require('./package.json').devDependencies.electron")"
  printf 'artifacts:\n'
  sha256sum "$staging_dir"/packages/* "$staging_dir/LICENSE"
} > "$staging_dir/build-log.txt"
