#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
OPENMMO_DIR="$ROOT/openmmo"
SERVER_LOG="$RUNNER_TEMP/openmmo-android-server.stdout.log"
SERVER_ERR="$RUNNER_TEMP/openmmo-android-server.stderr.log"
TERRAIN_DIR="$RUNNER_TEMP/openmmo-android-empty-terrain"

mkdir -p "$TERRAIN_DIR" artifacts/android-openmmo-runtime
rm -f "$OPENMMO_DIR/data/npc_token" "$OPENMMO_DIR/data/game_data.db"

(cd "$OPENMMO_DIR" && exec ./target/debug/onlinerpg-server --port 10006 --terrain-port 10007 --bind 0.0.0.0 --api-bind 127.0.0.1 --terrain-dir "$TERRAIN_DIR") >"$SERVER_LOG" 2>"$SERVER_ERR" &
SERVER_PID=$!

cleanup() {
  kill -CONT "$SERVER_PID" >/dev/null 2>&1 || true
  kill "$SERVER_PID" >/dev/null 2>&1 || true
  wait "$SERVER_PID" >/dev/null 2>&1 || true
  cp "$SERVER_LOG" artifacts/android-openmmo-runtime/server.stdout.log 2>/dev/null || true
  cp "$SERVER_ERR" artifacts/android-openmmo-runtime/server.stderr.log 2>/dev/null || true
}
trap cleanup EXIT

READY=0
for _ in $(seq 1 120); do
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "OpenMMO server exited before Android acceptance" >&2
    cat "$SERVER_LOG" || true
    cat "$SERVER_ERR" || true
    exit 1
  fi
  if [[ -s "$OPENMMO_DIR/data/npc_token" ]] && grep -q "WebSocket server ready for connections" "$SERVER_LOG"; then
    READY=1
    break
  fi
  sleep 0.25
done

if [[ "$READY" != "1" ]]; then
  echo "OpenMMO server did not become ready" >&2
  cat "$SERVER_LOG" || true
  cat "$SERVER_ERR" || true
  exit 1
fi

TOKEN="$(tr -d '\r\n' < "$OPENMMO_DIR/data/npc_token")"
test -n "$TOKEN"

export OPENMMO_SERVER_URL="ws://127.0.0.1:10006"
export OPENMMO_NPC_TOKEN="$TOKEN"
export OPENMMO_WASM_MODULE="$ROOT/.tmp/openmmo-wasm/onlinerpg_shared.js"
export OPENMMO_ACCEPTANCE_SEED_ONLY=1
export OPENMMO_DUNGEON_ACCOUNT="npc_idea2_player"

npx vitest run src/openmmo/real.integration.test.ts   -t "enters old_crypt and kills a real server-spawned kobold"

unset OPENMMO_ACCEPTANCE_SEED_ONLY
unset OPENMMO_DUNGEON_ACCOUNT

python3 scripts/ci/android_openmmo_runtime_acceptance.py   --token "$TOKEN"   --server "ws://10.0.2.2:10006"   --server-log "$SERVER_LOG"   --server-pid "$SERVER_PID"
