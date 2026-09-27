# M3-D Slice 1 — Embedded OpenMMO controller

Status: **Slice 1A VERIFIED / Slice 1B IMPLEMENTED-NOT-VERIFIED**

Date: 2026-09-27 (Asia/Seoul)

Canonical parent decision:

- M3-D Gate 0: **VERIFIED / Decision B**
- pinned OpenMMO: `950e081c178d920c10c51f2d31f60c1b3383c925`
- architecture: embed authoritative OpenMMO server core in the Tauri Rust process while preserving the WebSocket protocol boundary.

## Slice 1A — VERIFIED

Verification branch:

`ci/idea2-m3d-embedded-openmmo-slice1-20260927`

Temporary draft PR:

`#10` — closed without merge after verification.

Verified PR head:

`0d7905c85f8bdc10d87ba90fe0598ab9fd9e2068`

Implemented and promoted to `idea2`:

1. `src-tauri/src/openmmo_embedded.rs`
   - `OpenMmoEmbeddedController`
   - exact pinned commit constant
   - explicit lifecycle phases: `idle / prepared / failed`
   - Tauri `app_local_data_dir()/openmmo` storage root
   - creation of state/terrain/NPC/tales/geoip parent directories
   - persistent paths survive `stop()`
   - unit test for layout + lifecycle
   - `coreLinked=false` until the real authoritative core is actually connected
2. `src-tauri/src/lib.rs`
   - managed `OpenMmoEmbeddedController`
   - `openmmo_embedded_status`
   - `openmmo_embedded_prepare`
   - `openmmo_embedded_stop`
3. `src/openmmo/embeddedHost.ts`
   - typed frontend bridge for status/prepare/stop

Promotion commits on `idea2`:

- `b2eb5ecbaeaa49b5f95baf8dc3a3586ef757a0ed`
- `416275cd1fd58a5f21902810beb93589774c8f72`
- `96e29c411973aaf1b61a2d4ba393ffd56bf2ddd6`

### Verification evidence

For PR head `0d7905c85f8bdc10d87ba90fe0598ab9fd9e2068`:

- Pull Request Quality `36304747737` — **SUCCESS**
- Windows Playable Entry `36304747738` — **SUCCESS**
- Windows Human Acceptance E2E `36304747741` — **SUCCESS**
- Android OpenMMO Client `36304747747` — **SUCCESS**
- Android OpenMMO Runtime E2E `36304747756` — **SUCCESS**
- Android OpenMMO Lifecycle E2E `36304747771` — **SUCCESS**
- OpenMMO Adapter Integration `36304747754`
  - first attempt: existing old_crypt combat RNG failure (`CryptMira` died before kobold kill)
  - re-run job `108615150371`: **SUCCESS**
  - `Run taurin4 adapter against real pinned server`: **SUCCESS**

Slice 1A therefore passes all required regressions.

Recovery checkpoint:

`checkpoint/idea2-m3d-slice1a-verified-20260927`

Important boundary remains unchanged:

- Slice 1A does **not** claim a fake/placeholder server is OpenMMO.
- current embedded state is prepared-only and explicitly reports `coreLinked=false`.
- existing M3-C external OpenMMO runtime behavior is unchanged.
- no OpenMMO combat/world rules are duplicated into React or taurin4.
- no JS-side token persistence is introduced.

## Slice 1B — real authoritative core extraction — IMPLEMENTED-NOT-VERIFIED

Pinned `onlinerpg-server` is currently a binary-only crate; `server/src/main.rs` owns CLI parsing and authoritative server bootstrap together.

Slice 1B extracts only the process boundary while keeping all authoritative game modules as the exact pinned upstream source.

Target contract:

```text
OpenMmoServerConfig / caller argv
→ run_embedded_server()
→ authoritative OpenMMO GameState initialization
→ world/combat/monster/movement background tasks
→ loopback WebSocket readiness + in-memory NPC token
→ existing OpenMmoAdapter
→ caller-owned explicit shutdown
→ task drain + final persistence
→ restart from same state
```

Verification branch:

`ci/idea2-m3d-openmmo-core-extraction-20260927`

Temporary draft PR:

`#11` — **open / do not merge**

Current PR head:

`c04d4feaf2104920a786d94d4a69b99d5e3c45cc`

Implemented proof files:

1. `scripts/ci/extract_openmmo_server_lib.py`
   - operates only on exact pinned OpenMMO checkout
   - generates `server/src/lib.rs` from upstream `server/src/main.rs`
   - does not copy or reimplement gameplay modules
   - `Args::parse()` becomes caller-supplied argv parsed by the same upstream clap `Args`
   - OS signal becomes caller-provided oneshot shutdown receiver
   - readiness reports actual loopback WebSocket/API socket addresses
   - already-created NPC token is returned in memory
   - tracing initialization uses restart-safe `try_init()`
2. `scripts/ci/openmmo_embedded_core_probe.rs`
   - starts the extracted authoritative core with ephemeral loopback ports
   - requires real WebSocket HTTP 101
   - requires generated `npc_token`
   - explicitly requests shutdown
   - requires successful graceful exit and `game_data.db`
   - restarts against the same state root
   - requires the NPC token to persist across restart
3. `.github/workflows/idea2-m3d-openmmo-core-extraction.yml`
   - exact pinned checkout
   - host `cargo check --lib`
   - executable start/stop/persistence/restart proof
   - Android ARM64 `cargo check --lib`

Initial verification runs for head `c04d4feaf2104920a786d94d4a69b99d5e3c45cc`:

- M3-D OpenMMO Core Extraction `36318827513` — **QUEUED**
- Pull Request Quality `36318827498` — **QUEUED**

Strict no-polling rule applied after this checkpoint.

Allowed extraction:

- CLI `Args` → caller-owned config/argv
- OS shutdown signal → caller-provided shutdown receiver / handle
- listener readiness → explicit startup result
- tracing process-global initialization → idempotent in-process initialization

Not allowed:

- copying game rules into React or a taurin4 replacement server
- setting `coreLinked=true` before the actual pinned authoritative core is running behind the Tauri controller
- weakening OpenMMO combat, monster AI, persistence or protocol authority for mobile

Slice 1B PASS requires executable proof that the extracted pinned server core can start, return loopback readiness, accept a real WebSocket upgrade, stop explicitly, persist state, restart from that state, and still compile for Android ARM64.
