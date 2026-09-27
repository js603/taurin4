# M3-D Slice 1 — Embedded OpenMMO controller

Status: **Slice 1A VERIFIED / Slice 1B VERIFIED / Slice 1C IMPLEMENTED-NOT-VERIFIED**

Date: 2026-09-27 (Asia/Seoul)

Pinned OpenMMO: `950e081c178d920c10c51f2d31f60c1b3383c925`

Architecture decision: embed the exact pinned authoritative OpenMMO server core in the Tauri Rust process while preserving the existing WebSocket protocol boundary. OpenMMO gameplay rules are not duplicated into React or a taurin4 replacement server.

## Slice 1A — VERIFIED

Native ownership boundary established:

- `OpenMmoEmbeddedController`
- Tauri app-private OpenMMO storage layout
- explicit status / prepare / stop commands
- typed frontend bridge
- persistent state directory survives stop
- existing Windows / Android external-server regressions remained green

Verification PR #10: **CLOSED / merged=false**.

Recovery checkpoint:

`checkpoint/idea2-m3d-slice1a-verified-20260927`

## Slice 1B — VERIFIED

The exact pinned binary-only OpenMMO server was transformed at build/test time into a reusable library entrypoint without copying gameplay rules.

Verified authoritative path:

```text
caller config / argv
→ run_embedded_server()
→ original OpenMMO GameState/bootstrap
→ original world/combat/monster/movement tasks
→ loopback WebSocket readiness + in-memory NPC token
→ explicit caller-owned shutdown
→ original task drain + final persistence
→ restart from same state
```

Verified head:

`aa520df43bdacd1452e275a539a2b6d37017bd57`

Final evidence:

- Pull Request Quality `36319065969` — **SUCCESS**
- Core Extraction `36319065965` — **SUCCESS**
- job `108619250201` — **SUCCESS**
- host OpenMMO library check — SUCCESS
- real HTTP 101 WebSocket against extracted authoritative core — SUCCESS
- explicit graceful shutdown — SUCCESS
- persisted `game_data.db` + `npc_token` — SUCCESS
- second start using same state root/token — SUCCESS
- Android ARM64 library check — SUCCESS

Evidence artifact:

- `idea2-m3d-openmmo-core-extraction`
- artifact `10931169956`
- digest `sha256:4fa648be208c71959d3d62d9d9a84c57c6ec8ca22d3708c244ec5627eeaa15e6`

Proof files promoted to `idea2`:

- `.github/workflows/idea2-m3d-openmmo-core-extraction.yml`
- `scripts/ci/extract_openmmo_server_lib.py`
- `scripts/ci/openmmo_embedded_core_probe.rs`

Promotion commit:

`eab16845599eff1a79335970218e53944c4473b9`

Verification PR #11: **CLOSED / merged=false**.

Recovery checkpoint:

`checkpoint/idea2-m3d-slice1b-verified-20260927`

## Slice 1C — actual Tauri linkage — IMPLEMENTED-NOT-VERIFIED

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

Verification branch:

`ci/idea2-m3d-openmmo-tauri-link-20260927`

Temporary draft PR:

`#12` — **open / do not merge**

Current verification head:

`13cc97d217a488563e2e88cc19c683b9a8dcddf8`

### Implemented

1. `scripts/prepare-openmmo-embedded.py`
   - creates/reuses a repo-local ignored `openmmo/` build-input checkout
   - verifies origin `Julian-adv/OpenMMO`
   - sparse-checks only the required upstream paths
   - fetches/checks out exact commit `950e081c178d920c10c51f2d31f60c1b3383c925`
   - refuses to discard unexpected local changes
   - invokes the already VERIFIED Slice 1B extraction transform
   - verifies `run_embedded_server` / readiness symbols and exact pin
   - corrected before verification so a newly initialized unborn HEAD cannot fail `rev-parse`
2. `.gitignore`
   - ignores `/openmmo/`; upstream source remains build input rather than copied game code
3. `package.json`
   - adds `openmmo:embedded:prepare`
   - Tauri/Android/iOS build commands prepare the exact source before Cargo metadata/build
4. `src-tauri/Cargo.toml`
   - optional `onlinerpg-server` path dependency against the generated exact-pin checkout
   - feature `embedded-openmmo`
   - default feature set remains empty, preserving existing external-server builds
5. `src-tauri/src/openmmo_embedded.rs`
   - phases expanded to `idle / prepared / starting / running / stopping / failed`
   - feature-enabled worker owns a dedicated Rust thread + Tokio runtime
   - starts exact `onlinerpg_server::run_embedded_server`
   - uses loopback ephemeral WebSocket/API ports
   - maps mutable paths to Tauri app-private storage
   - keeps NPC token in native memory and returns it only in start launch config
   - sets `coreLinked=true` **only after actual upstream readiness is received**
   - explicit stop sends the upstream shutdown signal and waits for graceful persistence completion
   - restart test requires the same persisted NPC token and `game_data.db`
   - non-feature build continues to report that the embedded core is not linked
6. `src-tauri/src/lib.rs`
   - adds `openmmo_embedded_start`
   - stop now reports errors if authoritative shutdown fails
   - existing environment-based external OpenMMO launch bridge remains intact
7. `src/openmmo/embeddedHost.ts`
   - typed start launch config and expanded lifecycle state
8. `.github/workflows/idea2-windows-playable.yml`
   - prepares exact OpenMMO build input before direct Tauri Cargo check
9. `.github/workflows/idea2-m3d-openmmo-tauri-link.yml`
   - exact-pin source verification
   - real Tauri controller start/stop/restart unit Gate using actual authoritative core
   - Android ARM64 feature-linked Cargo check
   - actual Android debug APK build with `--features embedded-openmmo --target aarch64`
   - APK native library inspection requiring an upstream authoritative-server shutdown string

### Security / compatibility boundaries

- JS token persistence remains forbidden.
- token is not put in a URL, localStorage or sessionStorage.
- external/reachable-server M3-C path remains the default while Slice 1C is unverified.
- `embedded-openmmo` is feature-gated.
- `coreLinked=true` means actual upstream readiness was received; it is never a compile-time or placeholder flag.
- no combat/monster/dungeon/inventory rules were recreated in taurin4.

### Initial Slice 1C verification runs

Latest head `13cc97d217a488563e2e88cc19c683b9a8dcddf8`:

- M3-D OpenMMO Tauri Link `36322534990` — **IN PROGRESS**
- Pull Request Quality `36322534965` — **IN PROGRESS**
- Windows Playable Entry `36322534951` — **QUEUED**
- OpenMMO Adapter Integration `36322534945` — **PENDING**
- Android OpenMMO Lifecycle E2E `36322534969` — **QUEUED**
- Android OpenMMO Runtime E2E `36322534964` — **QUEUED**
- Windows Human Acceptance E2E `36322535013` — **PENDING**
- Android OpenMMO Client `36322534963` — **PENDING**

Strict no-polling rule applies after this checkpoint.

## Slice 1C PASS

Slice 1C becomes VERIFIED only when executable evidence proves:

1. `OpenMmoEmbeddedController` starts the actual pinned core and reaches readiness,
2. `coreLinked=true` only while that actual core is running,
3. explicit controller stop completes upstream graceful shutdown/persistence,
4. restart reuses persistent state/token,
5. feature-linked Tauri compiles for Android ARM64,
6. an installable Android APK is built with the authoritative core linked,
7. existing external-server Windows/Android regressions remain green.

After Slice 1C, the next Gate is the actual **Android standalone UI acceptance**: app launch → Singleplayer → embedded server auto-start → OpenMmoAdapter → lobby/gameplay → safe shutdown/restart, with no PC/server input required.
