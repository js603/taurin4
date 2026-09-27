# idea2 MASTER RECORD

> **Canonical current-state record / Single Source of Truth**
>
> Repository: `js603/taurin4`
> Active branch: `idea2`
> Updated: **2026-09-27 (Asia/Seoul)**
>
> Detailed historical evidence is preserved in Git history and `docs/archive/IDEA2_MASTER_RECORD_PRE_M3C_COMPLETE_20260926.md`.
> M3-D details: `docs/IDEA2_M3D_GATE0_FEASIBILITY.md` and `docs/IDEA2_M3D_SLICE1.md`.

---

## 1. Project intent

`taurin4 / idea2` is a Text-first / Card / TUI realtime RPG/MMO client using the real OpenMMO authoritative world/server instead of reproducing its rules in React.

```text
OpenMMO authoritative world
        ↓
Semantic Game Events
        ↓
Attention Director
        ↓
Floating Card / Focus Modal / Critical Modal / Event Log
```

Fixed rules:

- OpenMMO owns movement, combat, monsters, rewards, inventory and world state.
- Do not duplicate OpenMMO gameplay rules in React/Tauri.
- `GameSession` remains the shared UI/backend boundary.
- `LocalGameSession` remains available.
- `OpenMmoGameSession / OpenMmoAdapter / GameScreen` are shared across Windows and Android.
- Exact OpenMMO pin:
  `950e081c178d920c10c51f2d31f60c1b3383c925`.
- Auth token remains memory-only on the JS side; never URL/localStorage/sessionStorage.
- Large desktop runtime data remains on the user's mounted **G:** drive where applicable.

---

## 2. Verification operating rules

1. Define PASS/FAIL evidence before deep investigation.
2. Prefer executable evidence over source archaeology.
3. Maximum three exploratory branches before switching proof route.
4. Slow/stuck verification is corrected, never silently skipped.
5. No unbounded CI polling.
6. One cycle = workflow read → judgment → action → result report.
7. Temporary verification PRs are closed **without merge**.
8. Status vocabulary: `VERIFIED`, `IMPLEMENTED-CI-VERIFIED`, `IMPLEMENTED-NOT-VERIFIED`, `BLOCKED`, `DEFERRED-WITH-PLAN`.
9. Material milestones update this record.

---

## 3. Completed milestones

- M0 — Floating Text Vertical Slice — COMPLETE
- M0.5 — Cross-platform Host Foundation — COMPLETE
- M0.6 — Character / World Contract — FOUNDATION COMPLETE
- M1 — Windows PC ↔ Windows PC LAN — COMPLETE
- M1.5 — Original OpenMMO Runtime & Flow Audit — COMPLETE
- M2 — taurin4 + Real OpenMMO Backend — COMPLETE
- M3-A — Controlled Combat Input Migration — VERIFIED
- M3-B — Windows Playable Runtime — VERIFIED
- M3-C — Android real OpenMMO client — **VERIFIED / COMPLETE**
- M3-D Gate 0 — Android standalone feasibility — **VERIFIED / DECISION B**
- M3-D Slice 1A — native embedded controller/storage boundary — **VERIFIED**
- M3-D Slice 1B — real pinned authoritative core extraction — **VERIFIED**
- M3-D Slice 1C — actual Tauri linkage — **IMPLEMENTED-NOT-VERIFIED**

Recovery checkpoints:

- `checkpoint/idea2-m2-complete-20260924`
- `checkpoint/idea2-m3b-verified-20260925`
- `checkpoint/idea2-m3c-android-runtime-verified-20260925`
- `checkpoint/idea2-m3c-verified-20260926`
- `checkpoint/idea2-m3d-gate0-verified-20260927`
- `checkpoint/idea2-m3d-slice1a-verified-20260927`
- `checkpoint/idea2-m3d-slice1b-verified-20260927`

---

## 4. M3-C verified Android baseline

Actual APK verification already proved:

```text
APK
→ Tauri WebSocket transport
→ pinned real OpenMMO
→ auth / Character Lobby / CryptMira
→ EnterGame / old_crypt
→ MONSTER / WORLD ENCOUNTER
→ authoritative combat / kill / REWARD
→ background/foreground continuity
→ force-stop disconnect
→ relaunch / reauthentication
→ persisted-state rehydration
```

This external/reachable-server path must remain green while M3-D standalone is introduced.

---

## 5. M3-D Gate 0 — VERIFIED / DECISION B

Gate 0 proved with executable evidence that the original pinned OpenMMO server:

- compiles for Android ARM64,
- builds as an Android native ELF,
- executes inside Android userspace,
- binds loopback WebSocket/REST ports,
- returns real WebSocket HTTP 101,
- creates SQLite/filesystem state on Android.

Final feasibility run:

- `36303619258` — SUCCESS
- evidence artifact `10926178241`

Decision:

**B — embed/extract the same authoritative OpenMMO server core inside the Tauri Rust process, preserving the WebSocket protocol boundary.**

Reason: Android portability is proven, but production should not depend on owning a raw writable child executable when Tauri already supplies the correct in-process native lifecycle.

---

## 6. M3-D Slice 1A — VERIFIED

Implemented and verified:

- `OpenMmoEmbeddedController`
- Tauri app-private OpenMMO state/data layout
- explicit native `status / prepare / stop`
- typed TS bridge
- persistent paths survive stop
- placeholder/prepared state never claims the real core is linked

PR #10 was closed without merge after direct promotion.

Checkpoint:

`checkpoint/idea2-m3d-slice1a-verified-20260927`

---

## 7. M3-D Slice 1B — VERIFIED

The exact pinned binary-only `onlinerpg-server` was transformed into a reusable library boundary at build/test time without reimplementing gameplay modules.

Verified path:

```text
caller-owned config
→ run_embedded_server()
→ original GameState + authoritative ticks
→ loopback readiness + in-memory NPC token
→ real WebSocket HTTP 101
→ explicit shutdown
→ original drain + final persistence
→ restart from same state/token
```

Final verification:

- head `aa520df43bdacd1452e275a539a2b6d37017bd57`
- Quality `36319065969` — SUCCESS
- Core Extraction `36319065965` — SUCCESS
- job `108619250201` — SUCCESS
- Android ARM64 extracted library check — SUCCESS
- evidence artifact `10931169956`
- digest `sha256:4fa648be208c71959d3d62d9d9a84c57c6ec8ca22d3708c244ec5627eeaa15e6`

Proof files are preserved on `idea2`; PR #11 is closed without merge.

Checkpoint:

`checkpoint/idea2-m3d-slice1b-verified-20260927`

---

## 8. M3-D Slice 1C — IMPLEMENTED-NOT-VERIFIED

Verification branch:

`ci/idea2-m3d-openmmo-tauri-link-20260927`

Temporary draft PR:

`#12` — open / **DO NOT MERGE**

Current head:

`13cc97d217a488563e2e88cc19c683b9a8dcddf8`

Implemented:

```text
Tauri OpenMmoEmbeddedController.start()
→ exact-pin ignored /openmmo build-input checkout
→ Slice 1B generated onlinerpg-server library
→ dedicated Rust thread + Tokio runtime
→ app-private state/data paths
→ upstream readiness on ephemeral loopback ports
→ native-memory NPC token handoff
→ coreLinked=true only after real readiness
→ explicit upstream shutdown
→ persisted state/token restart
```

Build policy:

- `embedded-openmmo` is a Cargo feature; default remains external-server compatible.
- `/openmmo/` is ignored build input, not copied gameplay code.
- Tauri build scripts prepare the exact pin before Cargo uses the optional server dependency.
- unexpected local OpenMMO changes are never discarded.
- first source-prep implementation was corrected before verification to handle a newly initialized unborn git HEAD.

Dedicated Slice 1C Gate verifies:

1. exact source pin + generated library,
2. actual Tauri controller starts/stops/restarts the real authoritative core,
3. `coreLinked` semantics,
4. persistent DB/token reuse,
5. feature-linked Tauri Android ARM64 Cargo check,
6. installable Android debug APK built with `embedded-openmmo`,
7. APK native library contains an upstream authoritative server marker,
8. old external-server Windows/Android regressions remain green.

Initial latest-head runs:

- M3-D OpenMMO Tauri Link `36322534990` — IN PROGRESS
- Quality `36322534965` — IN PROGRESS
- Windows Playable `36322534951` — QUEUED
- OpenMMO Adapter `36322534945` — PENDING
- Android Lifecycle `36322534969` — QUEUED
- Android Runtime `36322534964` — QUEUED
- Windows Human Acceptance `36322535013` — PENDING
- Android Client `36322534963` — PENDING

Strict no-polling rule applies after this checkpoint.

`coreLinked=true` is not considered VERIFIED until these executable Gates pass.

---

## 9. Pinned old_crypt facts

- id `old_crypt`
- entrance `(-1450, 0.7, 4720)`
- kobold lv1 / HP5 / guard8 / attack `1d4`
- attack cooldown `1900ms`, chase range `20m`
- starter sword `worn_iron_sword`, damage `1d6`
- player attack cadence about `1380ms`, impact about `540ms`
- XP event has optional `monster_id`

Real fixtures must not change OpenMMO HP, damage, AI, spawn count, cooldown or server authority.

---

## 10. Next exact action

Check the PR #12 latest-head Gates **once**.

- If a Gate fails: inspect only its failing step/log, repair the narrow cause, and re-run through a new meaningful checkpoint.
- If all required Gates pass: mark Slice 1C VERIFIED, promote verified files directly to `idea2`, close PR #12 without merge, create a recovery checkpoint, then start the next Gate.

Next Gate after Slice 1C:

```text
actual Android APK launch
→ Singleplayer
→ embedded authoritative OpenMMO auto-start
→ no server URL/token user input
→ existing OpenMmoAdapter auto-connect
→ Character Lobby / EnterGame / gameplay
→ safe stop
→ relaunch
→ persisted authoritative state
```

This is the first full **Android standalone user-flow acceptance**.

---

## 11. New-chat bootstrap

> Continue `js603/taurin4` on branch `idea2`. Read `docs/IDEA2_MASTER_RECORD.md` and `docs/IDEA2_M3D_SLICE1.md` first. M3-C is VERIFIED/COMPLETE. M3-D Gate 0 is VERIFIED with Decision B. Slice 1A and 1B are VERIFIED. Slice 1C actual Tauri linkage is IMPLEMENTED-NOT-VERIFIED on temporary PR #12, latest head `13cc97d217a488563e2e88cc19c683b9a8dcddf8`; check its latest Gates once, obey no-unbounded-polling, never merge temporary PRs, preserve exact OpenMMO pin and memory-only JS token policy, and keep large desktop runtime data on G: where applicable.
