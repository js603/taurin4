# M3-D Slice 1 — Embedded OpenMMO controller

Status: **Slice 1A VERIFIED / Slice 1B VERIFIED / Slice 1C NEXT**

Date: 2026-09-27 (Asia/Seoul)

Pinned OpenMMO: `950e081c178d920c10c51f2d31f60c1b3383c925`

Architecture decision: embed the pinned authoritative OpenMMO server core in the Tauri Rust process while preserving the existing WebSocket protocol boundary. No OpenMMO gameplay rules are duplicated into React or taurin4.

## Slice 1A — VERIFIED

Verified implementation:

- `src-tauri/src/openmmo_embedded.rs`
  - `OpenMmoEmbeddedController`
  - `idle / prepared / failed`
  - Tauri app-private OpenMMO storage layout
  - persistent data survives stop
  - `coreLinked=false` until the real authoritative core is actually attached
- `src-tauri/src/lib.rs`
  - managed controller
  - status / prepare / stop Tauri commands
- `src/openmmo/embeddedHost.ts`
  - typed frontend bridge

Verification PR #10 was closed without merge after direct promotion to `idea2`.

All required regressions passed:

- Pull Request Quality `36304747737` — SUCCESS
- Windows Playable Entry `36304747738` — SUCCESS
- Windows Human Acceptance E2E `36304747741` — SUCCESS
- Android OpenMMO Client `36304747747` — SUCCESS
- Android OpenMMO Runtime E2E `36304747756` — SUCCESS
- Android OpenMMO Lifecycle E2E `36304747771` — SUCCESS
- OpenMMO Adapter Integration `36304747754` — SUCCESS on one allowed re-run job `108615150371` after the existing old_crypt combat RNG failure

Recovery checkpoint:

`checkpoint/idea2-m3d-slice1a-verified-20260927`

## Slice 1B — real authoritative core extraction — VERIFIED

Verified contract:

```text
caller config / argv
→ run_embedded_server()
→ original authoritative OpenMMO GameState/bootstrap
→ original world/combat/monster/movement tasks
→ loopback WebSocket readiness + in-memory NPC token
→ explicit caller-owned shutdown
→ original task drain + final persistence
→ restart from same state
```

Verification branch:

`ci/idea2-m3d-openmmo-core-extraction-20260927`

Temporary draft PR:

`#11` — **CLOSED / merged=false** after direct promotion of proof files.

Verified head:

`aa520df43bdacd1452e275a539a2b6d37017bd57`

Proof implementation preserved on `idea2`:

1. `scripts/ci/extract_openmmo_server_lib.py`
   - generates `server/src/lib.rs` from the exact pinned upstream `server/src/main.rs`
   - does not duplicate gameplay modules
   - replaces process-only CLI ownership with caller supplied argv parsed by upstream clap
   - replaces OS shutdown signal with caller-owned oneshot shutdown
   - reports actual WebSocket/API listener addresses and the already-created NPC token
   - changes process-global tracing init to restart-safe `try_init()`
2. `scripts/ci/openmmo_embedded_core_probe.rs`
   - starts the extracted authoritative server core on loopback ephemeral ports
   - requires real WebSocket HTTP 101
   - requires generated NPC token
   - requests explicit shutdown
   - requires graceful success and persisted `game_data.db`
   - restarts using the same state root
   - requires the NPC token to persist across restart
3. `.github/workflows/idea2-m3d-openmmo-core-extraction.yml`
   - exact pinned checkout
   - host library compile
   - executable start / WebSocket / stop / persistence / restart proof
   - Android ARM64 library compile

Promotion commit:

`eab16845599eff1a79335970218e53944c4473b9`

### Verification evidence

Attempt 1:

- Pull Request Quality `36318827498` — **SUCCESS**
- Core Extraction `36318827513` — failed before compilation because `server/examples/` did not exist
- correction: create the examples directory before copying the probe

Attempt 2, head `aa520df43bdacd1452e275a539a2b6d37017bd57`:

- Pull Request Quality `36319065969` — **SUCCESS**
- Core Extraction `36319065965` — **SUCCESS**
- job `108619250201` — **SUCCESS**
- host `cargo check -p onlinerpg-server --lib --locked` — SUCCESS
- actual extracted authoritative start/stop/persistence/restart proof — SUCCESS
- Android ARM64 `cargo check -p onlinerpg-server --lib --target aarch64-linux-android --locked` — SUCCESS
- evidence artifact `idea2-m3d-openmmo-core-extraction` / `10931169956`
- artifact digest `sha256:4fa648be208c71959d3d62d9d9a84c57c6ec8ca22d3708c244ec5627eeaa15e6`

Direct artifact inspection confirmed:

- first authoritative OpenMMO server startup reached WebSocket readiness
- first explicit caller-owned shutdown reached `Graceful shutdown complete`
- second startup against the same state root also reached readiness
- second explicit shutdown also completed gracefully
- final probe printed `M3-D Slice 1B embedded authoritative OpenMMO core probe: PASS`
- persisted state included `game_data.db`, `network_metrics.db`, and owner-only `npc_token`

Slice 1B PASS is therefore satisfied:

1. host library compile succeeds,
2. authoritative initialization reaches listener readiness,
3. real WebSocket upgrade succeeds with HTTP 101,
4. explicit caller-owned stop exits successfully,
5. SQLite state and NPC token are persisted,
6. restart against the same state succeeds and preserves the token,
7. the same extracted authoritative library compiles for Android ARM64.

`coreLinked` remains `false` in production code until Slice 1C actually connects this verified runtime behind `OpenMmoEmbeddedController`.

## Slice 1C — actual Tauri linkage — NEXT

Goal:

```text
Tauri OpenMmoEmbeddedController.start()
→ exact pinned OpenMMO source
→ extracted run_embedded_server()
→ app-private state/data paths
→ loopback readiness
→ memory-only token handoff
→ existing OpenMmoAdapter
→ explicit stop
→ persisted authoritative restart
```

Implementation policy:

- use the exact OpenMMO pin as build input rather than copying gameplay rules into taurin4,
- keep the OpenMMO WebSocket protocol boundary,
- keep token handoff native/in-memory only,
- do not set `coreLinked=true` until the actual Tauri controller starts the extracted authoritative core,
- preserve existing external-server M3-C behavior while the standalone path is introduced,
- prove the linkage with an actual Tauri/Android build before enabling standalone as the default Android path.
