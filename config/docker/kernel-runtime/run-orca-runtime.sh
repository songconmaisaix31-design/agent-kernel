#!/usr/bin/env bash
set -euo pipefail

: "${ORCA_RUNTIME_SECONDS:?ORCA_RUNTIME_SECONDS must be supplied by W0}"
ORCA_SERVE_PORT=${ORCA_SERVE_PORT:-6768}
ORCA_PAIRING_ADDRESS=${ORCA_PAIRING_ADDRESS:-127.0.0.1}

case "$ORCA_RUNTIME_SECONDS" in
  '' | *[!0-9]* | 0) echo 'ORCA_RUNTIME_SECONDS must be a positive integer' >&2; exit 64 ;;
esac

mkdir -p "$HOME/.config" "$HOME/.cache" /workspace /output
exec timeout --foreground --signal=TERM --kill-after=10s "${ORCA_RUNTIME_SECONDS}s" \
  /opt/orca/squashfs-root/orca-ide serve --port "$ORCA_SERVE_PORT" \
  --pairing-address "$ORCA_PAIRING_ADDRESS" --json
