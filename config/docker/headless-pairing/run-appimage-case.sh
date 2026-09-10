#!/usr/bin/env bash
set -euo pipefail

case_name=${1:?launch case is required}
appimage=${ORCA_TEST_APPIMAGE:-/artifacts/squashfs-root/AppRun}
timeout_seconds=${ORCA_STARTUP_TIMEOUT_SECONDS:-12}
pairing_address=${ORCA_PAIRING_ADDRESS:-127.0.0.1}
port=${ORCA_SERVE_PORT:-0}
state_dir="/tmp/orca-${case_name}"
require_sandbox=${ORCA_REQUIRE_SANDBOX:-0}

if ((EUID == 0)); then
  mkdir -p "$state_dir/config" "$state_dir/cache"
  chown -R orca:orca "$state_dir"
  # Why: packaged serve should exercise the same unprivileged account required by production systemd guidance.
  exec runuser --user orca --preserve-environment -- "$0" "$@"
fi

mkdir -p "$state_dir/config" "$state_dir/cache"

if [[ "$require_sandbox" == 1 && ${ORCA_TEST_NO_SANDBOX:-0} == 1 ]]; then
  echo "FAIL: ORCA_REQUIRE_SANDBOX rejects ORCA_TEST_NO_SANDBOX=1" >&2
  exit 64
fi

if [[ "$require_sandbox" == 1 ]]; then
  if [[ "$appimage" == *.AppImage ]]; then
    echo "FAIL: ORCA_REQUIRE_SANDBOX requires an extracted orca-ide binary, not AppRun" >&2
    exit 64
  fi
  if [[ "$(basename "$appimage")" != orca-ide ]] || [[ ! -x "$appimage" ]]; then
    echo "FAIL: ORCA_REQUIRE_SANDBOX requires executable extracted orca-ide" >&2
    exit 64
  fi
  is_appimage=0
  launcher=("$appimage")
elif [[ "$appimage" == *.AppImage ]]; then
  is_appimage=1
  launcher=("$appimage" --appimage-extract-and-run)
else
  is_appimage=0
  launcher=("$appimage")
fi

app_args=("${launcher[@]}")
if [[ "$require_sandbox" != 1 && ${ORCA_TEST_NO_SANDBOX:-1} == 1 ]]; then
  app_args+=(--no-sandbox)
fi
app_args+=(serve --port "$port" --pairing-address "$pairing_address")
if [[ ${ORCA_READY_JSON:-0} == 1 ]]; then
  app_args+=(--json)
fi
if [[ ${ORCA_NO_PAIRING:-0} == 1 ]]; then
  app_args+=(--no-pairing)
fi

case "$case_name" in
  direct)
    command=("${app_args[@]}")
    ;;
  xvfb)
    command=(xvfb-run -a "${app_args[@]}")
    ;;
  dbus-xvfb)
    command=(dbus-run-session -- xvfb-run -a "${app_args[@]}")
    ;;
  journal)
    command=(setsid --wait xvfb-run -a "${app_args[@]}")
    ;;
  *)
    echo "Unknown launch case: $case_name" >&2
    exit 64
    ;;
esac

export HOME="$state_dir"
export XDG_CONFIG_HOME="$state_dir/config"
export XDG_CACHE_HOME="$state_dir/cache"
if [[ $is_appimage == 0 && "$require_sandbox" != 1 ]]; then
  export APPDIR=${ORCA_TEST_APPDIR:-"$(dirname "$appimage")"}
fi

process_is_current() {
  local pid=$1 expected_start_ticks=$2
  [[ -r "/proc/$pid/stat" ]] || return 1
  [[ $(awk '{print $22}' "/proc/$pid/stat" 2>/dev/null || true) == "$expected_start_ticks" ]] \
    && ! ps -o stat= -p "$pid" 2>/dev/null | grep -q '^Z'
}

collect_process_tree() {
  local parent child
  sandbox_tree_pids=("$app_pid")
  for ((index = 0; index < ${#sandbox_tree_pids[@]}; index += 1)); do
    parent=${sandbox_tree_pids[$index]}
    while read -r child; do
      [[ -n "$child" ]] && sandbox_tree_pids+=("$child")
    done < <(ps -o pid= --ppid "$parent" | tr -d ' ')
  done
}

verify_sandbox_process() {
  local deadline=$((SECONDS + timeout_seconds))
  local pid cmdline environment
  while ((SECONDS < deadline)); do
    if ! process_is_current "$app_pid" "$app_start_ticks"; then
      echo "SANDBOX_EXIT app_pid=$app_pid before verification" >&2
      return 1
    fi
    collect_process_tree
    for pid in "${sandbox_tree_pids[@]}"; do
      [[ -r "/proc/$pid/cmdline" ]] || continue
      cmdline=$(tr '\0' ' ' <"/proc/$pid/cmdline")
      [[ "$cmdline" == *"/orca-ide"* ]] || continue
      [[ " $cmdline " == *" --serve "* || " $cmdline " == *" serve "* ]] || continue
      if [[ "$cmdline" == *"--no-sandbox"* ]]; then
        echo "FAIL: ORCA_REQUIRE_SANDBOX observed --no-sandbox in Electron argv: $cmdline" >&2
        return 1
      fi
      environment=$(tr '\0' '\n' <"/proc/$pid/environ" 2>/dev/null || true)
      if grep -Eq '^(ELECTRON_DISABLE_SANDBOX|ORCA_APPIMAGE_NO_SANDBOX)=1$' <<<"$environment"; then
        echo "FAIL: ORCA_REQUIRE_SANDBOX observed sandbox-disable environment on pid $pid" >&2
        return 1
      fi
      echo "SANDBOX_OK electron_pid=$pid"
      return 0
    done
    sleep 0.1
  done
  echo "FAIL: ORCA_REQUIRE_SANDBOX did not observe a current serving Electron child" >&2
  return 1
}

wait_for_sandbox_process() {
  set +e
  wait "$app_pid"
  app_status=$?
  set -e
  echo "SANDBOX_EXIT app_pid=$app_pid status=$app_status" >&2
  return "$app_status"
}

if [[ ${ORCA_KEEP_RUNNING:-0} == 1 ]]; then
  if [[ "$require_sandbox" == 1 ]]; then
    env -u ELECTRON_DISABLE_SANDBOX -u ORCA_APPIMAGE_NO_SANDBOX "${command[@]}" &
    app_pid=$!
    app_start_ticks=$(awk '{print $22}' "/proc/$app_pid/stat")
    trap 'kill "$app_pid" 2>/dev/null || true; wait "$app_pid" 2>/dev/null || true' EXIT
    verify_sandbox_process || exit 1
    wait_for_sandbox_process
    exit $?
  fi
  exec "${command[@]}"
fi

if [[ "$require_sandbox" == 1 ]]; then
  env -u ELECTRON_DISABLE_SANDBOX -u ORCA_APPIMAGE_NO_SANDBOX "${command[@]}" &
  app_pid=$!
  app_start_ticks=$(awk '{print $22}' "/proc/$app_pid/stat")
  trap 'kill "$app_pid" 2>/dev/null || true; wait "$app_pid" 2>/dev/null || true' EXIT
  verify_sandbox_process || exit 1
  deadline=$((SECONDS + timeout_seconds))
  while ((SECONDS < deadline)) && process_is_current "$app_pid" "$app_start_ticks"; do
    sleep 0.1
  done
  if ! process_is_current "$app_pid" "$app_start_ticks"; then
    wait_for_sandbox_process
    exit $?
  fi
  kill -TERM "$app_pid" 2>/dev/null || true
  wait_for_sandbox_process || true
  exit 124
fi

set +e
timeout --signal=TERM --kill-after=2s "${timeout_seconds}s" "${command[@]}"
status=$?
set -e

if ((status == 124)); then
  echo "STARTUP_TIMEOUT: no ready contract after ${timeout_seconds}s" >&2
fi
exit "$status"
