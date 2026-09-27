# M3-D Slice 1 — Embedded OpenMMO controller

Status: **Slice 1A IMPLEMENTED-NOT-VERIFIED**

Date: 2026-09-27 (Asia/Seoul)

Canonical parent decision:

- M3-D Gate 0: **VERIFIED / Decision B**
- pinned OpenMMO: `950e081c178d920c10c51f2d31f60c1b3383c925`
- architecture: embed authoritative OpenMMO server core in the Tauri Rust process while preserving the WebSocket protocol boundary.

## Slice 1A scope

Verification branch:

`ci/idea2-m3d-embedded-openmmo-slice1-20260927`

Temporary draft PR:

`#10` — **open / do not merge**

Current PR head:

`0d7905c85f8bdc10d87ba90fe0598ab9fd9e2068`

Implemented:

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

Important safety/architecture boundary:

- this Slice does **not** claim a fake/placeholder server is OpenMMO.
- current state is prepared-only and explicitly reports `coreLinked=false`.
- existing M3-C external OpenMMO runtime behavior is unchanged.
- no OpenMMO combat/world rules are duplicated into React or taurin4.
- no JS-side token persistence is introduced.

## Initial verification runs

For PR head `0d7905c85f8bdc10d87ba90fe0598ab9fd9e2068`:

- Pull Request Quality `36304747737` — **QUEUED**
- Windows Playable Entry `36304747738` — **IN PROGRESS**
- Windows Human Acceptance E2E `36304747741` — **IN PROGRESS**
- Android OpenMMO Client `36304747747` — **IN PROGRESS**
- OpenMMO Adapter Integration `36304747754` — **QUEUED**
- Android OpenMMO Runtime E2E `36304747756` — **IN PROGRESS**
- Android OpenMMO Lifecycle E2E `36304747771` — **QUEUED**

Strict no-polling rule applied after this checkpoint.

## Slice 1A PASS

Slice 1A is only verified when:

- Quality succeeds,
- Android APK build succeeds with the new native controller module,
- existing Windows/OpenMMO adapter regressions remain green,
- Android Runtime and Lifecycle regressions remain green.

If a Gate fails, inspect only that failing step/log before modifying scope.

## Next after Slice 1A

Slice 1B links the **real pinned authoritative OpenMMO core** behind this controller boundary.

The intended contract is approximately:

```text
OpenMmoServerConfig
→ OpenMmoServerController.start()
→ authoritative OpenMMO initialization
→ loopback endpoint + readiness + memory-only token handoff
→ existing OpenMmoAdapter
→ explicit stop
→ final persistence
```

Do not advance `coreLinked` to true until executable evidence proves the actual OpenMMO authoritative core is the running backend.
