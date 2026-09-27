# M3-D Gate 0 — Android standalone OpenMMO feasibility

Status: **VERIFIED / DECISION B**

Date: 2026-09-27 (Asia/Seoul)

Pinned OpenMMO revision:

`950e081c178d920c10c51f2d31f60c1b3383c925`

## Gate question

Determine with executable evidence whether Android standalone should use:

- A. the original OpenMMO server executable,
- B. the same authoritative server logic embedded in-process behind the existing protocol boundary,
- C. a narrower replacement only if critical authoritative dependencies are genuinely non-portable.

No OpenMMO combat/world rules may be duplicated into React merely to make standalone easier.

## Final decision

**B — extract/embed the authoritative OpenMMO server core in-process inside the Tauri Rust backend while preserving the current WebSocket protocol boundary.**

The Gate proved that the original executable itself is technically Android-portable, so this is not a fallback caused by incompatible server dependencies. B is selected as the production architecture because it gives taurin4 ownership of Android lifecycle, storage and shutdown without relying on deployment/execution of a separate raw native server process.

Target shape:

```text
Android taurin4 APK
        ↓
Tauri Rust backend
        ↓
OpenMmoServerController
        ↓
embedded pinned OpenMMO authoritative core
 ├─ SQLite/state
 ├─ movement/combat
 ├─ monster AI
 ├─ dungeon/world
 ├─ persistence
 └─ background ticks
        ↓
127.0.0.1:<local port> WebSocket
        ↓
existing OpenMmoAdapter / OpenMmoGameSession
        ↓
Text/Card GameScreen
```

The gameplay protocol and server authority remain unchanged.

## Executable evidence

Temporary verification branch:

`ci/idea2-m3d-android-server-feasibility-20260926`

Temporary draft PR:

`#9` — closed without merge after verification.

Final verified PR head:

`9b3cf532b371adc18e1312359130a0e4a4a23537`

Final feasibility run:

`36303619258` — **SUCCESS**

Quality run:

`36303619268` — **SUCCESS**

Evidence artifact:

`idea2-m3d-android-server-feasibility` / artifact `10926178241`

Final run proved all of the following:

1. exact pinned OpenMMO checkout — PASS
2. Android NDK/linker setup — PASS
3. `onlinerpg-shared` `aarch64-linux-android` cargo check — PASS
4. `onlinerpg-terrain` `aarch64-linux-android` cargo check — PASS
5. original `onlinerpg-server` `aarch64-linux-android` cargo check — PASS
6. original server ARM64 Android ELF build — PASS
7. emulator-matching x86_64 Android server ELF build — PASS
8. original pinned server executes inside Android userspace — PASS
9. server binds `127.0.0.1:10006` inside Android — PASS
10. real WebSocket Upgrade returns HTTP `101 Switching Protocols` — PASS
11. evidence upload and bounded cleanup — PASS

ARM64 output was a real Android AArch64 PIE executable using `/system/bin/linker64`.

## Persistence / filesystem evidence

The Android runtime probe created actual mutable OpenMMO state under the supplied state directory, including:

- `game_data.db`
- SQLite journal/WAL-related files
- `network_metrics.db`
- `network_metrics.db-shm`
- `network_metrics.db-wal`
- `npc_token`
- `cape-textures/`

Therefore bundled SQLite plus normal server filesystem state is not merely structurally portable: it executed successfully in Android userspace.

For the production APK these paths must move from the probe's `/data/local/tmp/...` location into Tauri/Android app-private storage.

## Source extraction boundary

The pinned upstream currently keeps startup in executable-only `server/src/main.rs`. It owns:

- CLI/env parsing
- state path setup
- auth/SQLite initialization
- terrain/NPC/housing stores
- authoritative `GameState`
- movement/combat/monster/world background ticks
- WebSocket listener
- REST listener
- OS shutdown signal
- graceful drain/final persistence

M3-D must separate this into a reusable native lifecycle boundary, approximately:

```text
OpenMmoServerConfig
OpenMmoServerController::start(config)
OpenMmoServerHandle::endpoint()
OpenMmoServerHandle::auth_token()
OpenMmoServerHandle::stop()
```

Mobile substitutions:

- CLI `Args` → native/Tauri config
- `STATE_DIR` → Android app-private data directory
- desktop/Unix shutdown signal → explicit controller stop signal
- standalone process ownership → Tauri-owned Tokio runtime/task
- fixed external endpoint → loopback endpoint owned by controller

All authoritative gameplay modules remain the pinned OpenMMO implementation.

## Probe delay correction

An earlier runtime run reached PASS but the workflow was later cancelled because probe cleanup waited indefinitely on the attached `adb shell ... wait $pid` keepalive process.

The correction bounds both remote-server termination and local adb-shell reaping. The final run `36303619258` proved the same runtime path and completed the job successfully, eliminating the previous delay mode without skipping any verification scope.

## Known follow-up

The earlier artifact's process-memory sample targeted the keepalive shell rather than the actual server process, so no RSS number is treated as verified. This does **not** block Gate 0 because Android compile, execution, socket, SQLite/filesystem and shutdown feasibility are independently proven. Accurate embedded-process memory/CPU measurement belongs to the M3-D implementation acceptance Gate.

## Next exact action — M3-D Slice 1

Implement the smallest embedded authoritative-server skeleton:

1. introduce reusable `OpenMmoServerConfig` / controller lifecycle,
2. preserve the pinned OpenMMO authoritative modules and protocol,
3. map mutable state to app-private storage,
4. start the embedded server from the Tauri Rust backend,
5. return loopback endpoint + in-memory local auth token to the native bootstrap,
6. connect the existing `OpenMmoAdapter` without a manually entered server URL/token,
7. prove explicit stop and persistent restart,
8. verify first with compile/unit Gates, then with an actual Android APK runtime Gate.

Gate 0 is complete. Do not reopen executable-vs-core architecture investigation unless new executable evidence contradicts this decision.
