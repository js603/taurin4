# M3-D Gate 0 — Android standalone OpenMMO feasibility

Status: **IN PROGRESS**

Date: 2026-09-26 (Asia/Seoul)

Pinned OpenMMO revision:

`950e081c178d920c10c51f2d31f60c1b3383c925`

## Gate question

Determine with executable evidence whether Android standalone should use:

- A. the original OpenMMO server executable,
- B. the same authoritative server logic embedded in-process behind the existing protocol boundary,
- C. a narrower replacement only if critical authoritative dependencies are genuinely non-portable.

No OpenMMO combat/world rules may be duplicated into React merely to make standalone easier.

## Source audit findings

The pinned server depends on ordinary Rust/server components including Tokio, tokio-tungstenite, Axum, bundled rusqlite, r2d2_sqlite, rustls-backed reqwest, filesystem-backed state and the pinned shared/terrain crates.

The current upstream shape is an executable-only `server/src/main.rs`. Startup currently owns:

- CLI/env parsing,
- SQLite/state directory initialization,
- NPC token generation,
- terrain/NPC/housing stores,
- authoritative `GameState`,
- background world/combat/movement ticks,
- WebSocket listener,
- REST listener,
- OS shutdown signal handling,
- graceful drain and final persistence.

For an embedded Android runtime the likely extraction boundary is therefore:

`ServerConfig + ServerHandle/start/stop`

while preserving the existing authoritative modules and WebSocket protocol.

Expected mobile substitutions if B is selected:

- CLI `Args` → Tauri/native configuration object
- `STATE_DIR` → Android app-private data directory
- Unix/desktop signal handling → explicit Tauri lifecycle stop signal
- standalone process ownership → Tokio task owned by the Tauri Rust backend
- game WebSocket → loopback listener (`127.0.0.1`, preferably dynamically selected port)
- existing `OpenMmoAdapter` / codec / protocol remain unchanged

## Persistence / I/O findings

Pinned terrain I/O uses standard Rust filesystem/Tokio filesystem operations. Atomic writes are performed using same-directory temporary files, `sync_data`, and rename.

Pinned auth persistence uses bundled SQLite (`rusqlite` + `r2d2_sqlite`) and accepts an explicit state-directory path.

These APIs are structurally compatible with mapping state into Android app-private storage; actual Android runtime persistence remains a later executable Gate.

## Android cross-compile probe

Temporary verification branch:

`ci/idea2-m3d-android-server-feasibility-20260926`

Temporary draft PR:

`#9` — **do not merge**

Initial probe head:

`1eb1f140cdce0ab32cd174d9c24df612bc537ef5`

Initial run:

`36227785057`

The initial run did **not** reach Android compilation. Sparse checkout omitted the upstream workspace member `agent-client`, so Cargo stopped while loading workspace metadata.

This is a CI checkout defect, not Android incompatibility.

Upstream workspace members are:

`agent-client`, `server`, `shared`, `terrain`, `tools/terrain-gen`.

Corrected probe head:

`a01f19503fe5acf03b43b46eb0f11bd944010830`

Corrected run:

`36227927324`

Observed executable evidence at the first meaningful checkpoint:

- Android SDK/NDK setup — PASS
- exact pinned OpenMMO checkout — PASS
- Android NDK linker configuration — PASS
- **`onlinerpg-shared` Android cargo check — PASS**
- **`onlinerpg-terrain` Android cargo check — PASS**
- original `onlinerpg-server` Android cargo check — IN PROGRESS at checkpoint
- original server Android ELF build — pending at checkpoint

No repeated polling was performed after this checkpoint.

## Current decision state

**A/B/C decision is not final yet.**

However, current evidence already rules out a broad claim that the OpenMMO protocol/terrain foundation is intrinsically non-portable to Android. Both pinned shared and terrain crates compile for `aarch64-linux-android`.

Architecturally, B (in-process authoritative server core) is currently the preferred candidate because the Android/Tauri application itself is a Rust shared-library runtime, while the pinned upstream server is presently organized as a standalone CLI/process executable. Final selection waits for the corrected original-server cross-compile result.

## Next exact action

1. inspect corrected run `36227927324` once at the next checkpoint,
2. if the server check/build fails, inspect only that compiler/linker failure,
3. classify the blocker as gameplay-critical vs executable-only/observability/lifecycle,
4. if core dependencies remain portable, proceed to a bounded in-process skeleton Gate,
5. prove on Android that Tauri can start/stop an authoritative loopback server task and persist state in app-private storage before beginning standalone gameplay integration.
