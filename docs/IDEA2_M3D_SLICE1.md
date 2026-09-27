# M3-D Slice 1 — Embedded OpenMMO controller

Status: **Slice 1A VERIFIED / Slice 1B IMPLEMENTED-NOT-VERIFIED**

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

## Slice 1B — real authoritative core extraction — IMPLEMENTED-NOT-VERIFIED

Goal:

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

`#11` — open / do not merge.

Current verification head:

`aa520df43bdacd1452e275a539a2b6d37017bd57`

Proof implementation:

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

### Verification attempt 1

Head: `c04d4feaf2104920a786d94d4a69b99d5e3c45cc`

- Pull Request Quality `36318827498` — **SUCCESS**
- Core Extraction `36318827513` — **FAILURE before compilation**

Root cause was CI-only: the pinned server checkout does not contain `server/examples/`, so copying the probe failed with `No such file or directory` after `lib.rs` had already been generated successfully.

No OpenMMO extraction/runtime/compiler incompatibility was observed in this attempt because compilation had not started.

Correction:

- create `openmmo/server/examples` before copying the probe
- correction commit/head: `aa520df43bdacd1452e275a539a2b6d37017bd57`

### Verification attempt 2

- Core Extraction `36319065965` — **IN PROGRESS**
- Pull Request Quality `36319065969` — **IN PROGRESS**

Strict no-polling rule applied after this checkpoint.

## Slice 1B PASS

Slice 1B becomes VERIFIED only when the same extracted pinned authoritative core proves all of the following:

1. host `cargo check --lib` succeeds,
2. actual authoritative initialization reaches listener readiness,
3. real WebSocket upgrade returns HTTP 101,
4. explicit caller-owned stop exits successfully,
5. `game_data.db` and NPC token exist,
6. restart against the same state succeeds and preserves the token,
7. the extracted library still compiles for `aarch64-linux-android`.

Until then `coreLinked` remains `false`.

## Next after Slice 1B

Connect this verified extracted runtime behind `OpenMmoEmbeddedController`, expose only loopback endpoint/readiness/memory-only token to the native bootstrap, then prove the complete path inside an actual Android APK.
