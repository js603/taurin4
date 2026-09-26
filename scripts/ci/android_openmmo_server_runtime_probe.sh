#!/usr/bin/env bash
set -euo pipefail

: "${OPENMMO_DIR:?OPENMMO_DIR is required}"
: "${ANDROID_SERVER_BIN:?ANDROID_SERVER_BIN is required}"

ARTIFACT_DIR="${ANDROID_SERVER_PROBE_ARTIFACT_DIR:-artifacts/android-openmmo-server-probe}"
REMOTE_ROOT="/data/local/tmp/taurin4-openmmo-server-probe"
REMOTE_SERVER="$REMOTE_ROOT/onlinerpg-server"
HOST_FORWARD_PORT="18006"

mkdir -p "$ARTIFACT_DIR"
adb wait-for-device

cleanup() {
  adb forward --remove "tcp:${HOST_FORWARD_PORT}" >/dev/null 2>&1 || true
  if adb shell "test -f '$REMOTE_ROOT/server.pid'" >/dev/null 2>&1; then
    REMOTE_PID="$(adb shell "cat '$REMOTE_ROOT/server.pid'" 2>/dev/null | tr -d '\r' || true)"
    if [[ "$REMOTE_PID" =~ ^[0-9]+$ ]]; then
      adb shell "kill '$REMOTE_PID'" >/dev/null 2>&1 || true
    fi
  fi
  if [[ -n "${ADB_SERVER_SHELL_PID:-}" ]]; then
    wait "$ADB_SERVER_SHELL_PID" >/dev/null 2>&1 || true
  fi
  adb pull "$REMOTE_ROOT/server.stdout.log" "$ARTIFACT_DIR/server.stdout.log" >/dev/null 2>&1 || true
  adb pull "$REMOTE_ROOT/server.stderr.log" "$ARTIFACT_DIR/server.stderr.log" >/dev/null 2>&1 || true
  adb shell "cat /proc/meminfo | head -n 20" > "$ARTIFACT_DIR/device-meminfo.txt" 2>/dev/null || true
}
trap cleanup EXIT

adb shell "rm -rf '$REMOTE_ROOT' && mkdir -p '$REMOTE_ROOT/state' '$REMOTE_ROOT/data' '$REMOTE_ROOT/agent-client/data'"
adb push "$ANDROID_SERVER_BIN" "$REMOTE_SERVER" >/dev/null
adb shell "chmod 755 '$REMOTE_SERVER'"

# Preserve the pinned server's expected relative data layout. The probe uses
# /data/local/tmp only to establish Android-runtime feasibility; final M3-D
# app storage will use Tauri/Android app-private directories.
if [[ -d "$OPENMMO_DIR/data" ]]; then
  adb push "$OPENMMO_DIR/data/." "$REMOTE_ROOT/data/" >/dev/null
fi
if [[ -d "$OPENMMO_DIR/agent-client/data" ]]; then
  adb push "$OPENMMO_DIR/agent-client/data/." "$REMOTE_ROOT/agent-client/data/" >/dev/null
fi

# Keep one adb shell attached to the native server so Android does not reap it
# merely because the launch shell exits. A second adb connection performs the
# listener/WebSocket probes.
adb shell "cd '$REMOTE_ROOT' && \
  ./onlinerpg-server \
    --bind 127.0.0.1 \
    --port 10006 \
    --api-bind 127.0.0.1 \
    --terrain-port 10007 \
    --state-dir '$REMOTE_ROOT/state' \
    --terrain-dir '$REMOTE_ROOT/data/terrain' \
    --npc-data-dir '$REMOTE_ROOT/agent-client/data/npcs' \
    --tales-ledger '$REMOTE_ROOT/agent-client/data/tales/ledger.txt' \
    --geoip-db '$REMOTE_ROOT/data/geoip/dbip-country-lite.csv' \
    > '$REMOTE_ROOT/server.stdout.log' \
    2> '$REMOTE_ROOT/server.stderr.log' & \
  pid=\$!; echo \$pid > '$REMOTE_ROOT/server.pid'; wait \$pid" &
ADB_SERVER_SHELL_PID=$!

STARTED=0
for _ in $(seq 1 120); do
  STDOUT="$(adb shell "cat '$REMOTE_ROOT/server.stdout.log' 2>/dev/null" | tr -d '\r' || true)"
  STDERR="$(adb shell "cat '$REMOTE_ROOT/server.stderr.log' 2>/dev/null" | tr -d '\r' || true)"
  if grep -Fq "MMORPG Server listening on: 127.0.0.1:10006" <<<"$STDOUT$STDERR" || \
     grep -Fq "MMORPG Server started successfully" <<<"$STDOUT$STDERR"; then
    STARTED=1
    break
  fi
  if ! kill -0 "$ADB_SERVER_SHELL_PID" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

adb pull "$REMOTE_ROOT/server.stdout.log" "$ARTIFACT_DIR/server.stdout.log" >/dev/null 2>&1 || true
adb pull "$REMOTE_ROOT/server.stderr.log" "$ARTIFACT_DIR/server.stderr.log" >/dev/null 2>&1 || true

if [[ "$STARTED" != "1" ]]; then
  echo "Original OpenMMO Android executable did not reach listener-ready state" >&2
  cat "$ARTIFACT_DIR/server.stdout.log" >&2 2>/dev/null || true
  cat "$ARTIFACT_DIR/server.stderr.log" >&2 2>/dev/null || true
  exit 1
fi

adb forward "tcp:${HOST_FORWARD_PORT}" tcp:10006 >/dev/null

python3 - <<'PY'
import base64
import os
import socket

host = "127.0.0.1"
port = 18006
key = base64.b64encode(os.urandom(16)).decode("ascii")
request = (
    "GET / HTTP/1.1\r\n"
    f"Host: {host}:{port}\r\n"
    "Upgrade: websocket\r\n"
    "Connection: Upgrade\r\n"
    f"Sec-WebSocket-Key: {key}\r\n"
    "Sec-WebSocket-Version: 13\r\n\r\n"
).encode("ascii")
with socket.create_connection((host, port), timeout=5) as sock:
    sock.sendall(request)
    response = sock.recv(4096)
if b" 101 " not in response and not response.startswith(b"HTTP/1.1 101"):
    raise SystemExit(f"WebSocket upgrade did not return HTTP 101: {response!r}")
print(response.decode("latin1", errors="replace"))
PY

REMOTE_PID="$(adb shell "cat '$REMOTE_ROOT/server.pid'" | tr -d '\r')"
adb shell "cat /proc/$REMOTE_PID/status" > "$ARTIFACT_DIR/server-process-status.txt"
adb shell "cat /proc/$REMOTE_PID/maps | head -n 80" > "$ARTIFACT_DIR/server-process-maps.txt" || true
adb shell "ls -lah '$REMOTE_ROOT/state'" > "$ARTIFACT_DIR/state-files.txt"

cat > "$ARTIFACT_DIR/result.txt" <<'EOF'
M3-D Gate 0 Android executable runtime probe: PASS
- Original pinned OpenMMO server binary executed under Android userspace.
- Server bound 127.0.0.1:10006 inside the emulator.
- Host-to-device adb forwarding reached the listener.
- Real WebSocket HTTP Upgrade returned 101 Switching Protocols.
EOF

cat "$ARTIFACT_DIR/result.txt"
