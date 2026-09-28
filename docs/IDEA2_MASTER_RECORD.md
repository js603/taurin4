# idea2 MASTER RECORD

> **Canonical current-state record / Single Source of Truth**
>
> Repository: `js603/taurin4`
> Active branch: `idea2`
> Updated: **2026-09-28 (Asia/Seoul)**
>
> Detailed historical evidence remains in Git history and `docs/archive/IDEA2_MASTER_RECORD_PRE_M3C_COMPLETE_20260926.md`.
> M3-D details: `docs/IDEA2_M3D_GATE0_FEASIBILITY.md` and `docs/IDEA2_M3D_SLICE1.md`.

---

## 1. Project intent

`taurin4 / idea2` is a Text-first / Card / TUI realtime RPG/MMO client that uses the real OpenMMO authoritative world/server rather than reproducing its gameplay rules in React.

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

- OpenMMO owns movement, combat, monsters, rewards, inventory, persistence and world state.
- Do not duplicate authoritative gameplay logic in React/Tauri.
- `GameSession` remains the shared UI/backend boundary.
- `LocalGameSession` remains available.
- `OpenMmoGameSession / OpenMmoAdapter / GameScreen` are shared across Windows and Android.
- Exact OpenMMO pin: `950e081c178d920c10c51f2d31f60c1b3383c925`.
- JS-side auth token remains memory-only; never URL/localStorage/sessionStorage.
- Large desktop runtime data remains on the mounted **G:** drive where applicable.

---

## 2. Verification operating rules

1. Define PASS/FAIL evidence before deep investigation.
2. Prefer executable evidence over source archaeology.
3. Slow/stuck verification is corrected, never silently skipped.
4. No unbounded CI polling.
5. One cycle = workflow read → judgment → action → result report.
6. Temporary verification PRs are closed **without merge**.
7. Status vocabulary: `VERIFIED`, `IMPLEMENTED-CI-VERIFIED`, `IMPLEMENTED-NOT-VERIFIED`, `BLOCKED`, `DEFERRED-WITH-PLAN`.
8. Material milestones update this record.

---

## 3. Milestone status

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
- M3-D Slice 1C — actual Tauri linkage + feature-linked Android APK — **VERIFIED / COMPLETE**

Recovery checkpoints:

- `checkpoint/idea2-m2-complete-20260924`
- `checkpoint/idea2-m3b-verified-20260925`
- `checkpoint/idea2-m3c-android-runtime-verified-20260925`
- `checkpoint/idea2-m3c-verified-20260926`
- `checkpoint/idea2-m3d-gate0-verified-20260927`
- `checkpoint/idea2-m3d-slice1a-verified-20260927`
- `checkpoint/idea2-m3d-slice1b-verified-20260927`
- `checkpoint/idea2-m3d-slice1c-verified-20260928` — created after final documentation update

---

## 4. M3-C verified Android baseline

The external/reachable-server Android path already proved:

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

This path must remain green while standalone embedded-server behavior is introduced.

---

## 5. M3-D Gate 0 — VERIFIED / DECISION B

Executable evidence proved that the original pinned OpenMMO server:

- compiles for Android ARM64,
- builds as Android native ELF,
- executes inside Android userspace,
- binds loopback WebSocket/REST ports,
- returns real WebSocket HTTP 101,
- creates SQLite/filesystem state on Android.

Final feasibility run: `36303619258` — SUCCESS.

Decision B:

**Embed/extract the same authoritative OpenMMO server core inside the Tauri Rust process while preserving the WebSocket protocol boundary.**

---

## 6. M3-D Slice 1A — VERIFIED

Implemented and verified:

- `OpenMmoEmbeddedController`
- Tauri app-private OpenMMO state/data layout
- explicit native `status / prepare / stop`
- typed TS bridge
- persistent paths survive stop
- placeholder/prepared state never claims real core linkage

PR #10 closed without merge.

Checkpoint: `checkpoint/idea2-m3d-slice1a-verified-20260927`.

---

## 7. M3-D Slice 1B — VERIFIED

The exact pinned `onlinerpg-server` was transformed into a reusable library boundary at build/test time without reimplementing gameplay modules.

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

PR #11 closed without merge.

Checkpoint: `checkpoint/idea2-m3d-slice1b-verified-20260927`.

---

## 8. M3-D Slice 1C — VERIFIED / COMPLETE

Final verified temporary-PR head:

`8e75722660302591c2c7cd3af5a0c43a86c98a12`

Temporary PR #12:

**CLOSED / merged=false / never merged**.

Validated files were promoted directly to canonical `idea2` with promotion commit:

`696c953d35916d3f69083a1f3f23ea6e7f03e09f`

Because the temporary branch and `idea2` had diverged, the branch itself was not fast-forwarded or force-merged. The exact verified blob versions of the 11 changed files were applied on top of the current `idea2` tree, preserving canonical-branch work.

Verified authoritative path:

```text
Tauri OpenMmoEmbeddedController.start()
→ exact pinned OpenMMO build input
→ extracted run_embedded_server()
→ app-private persistent state/data
→ ephemeral loopback readiness
→ native-memory NPC token
→ coreLinked=true only after real readiness
→ existing OpenMmoAdapter protocol path
→ explicit graceful stop
→ persisted restart using same state/token
```

Final required workflow evidence on head `8e75722660302591c2c7cd3af5a0c43a86c98a12`:

- Pull Request Quality `36370376213` — SUCCESS
- Windows Playable Entry `36370376394` — SUCCESS
- Android OpenMMO Client `36370376254` — SUCCESS
- OpenMMO Adapter Integration `36370376225` — SUCCESS
- M3-D OpenMMO Tauri Link `36370376217` — SUCCESS
- Android OpenMMO Runtime E2E `36370376209` — SUCCESS
- Android OpenMMO Lifecycle E2E `36370376267` — SUCCESS
- Windows Human Acceptance E2E `36370376261` — SUCCESS

Dedicated M3-D job `108765260098` passed:

- actual embedded controller start/readiness/stop/restart
- Android ARM64 feature-linked library check
- Android project initialization
- actual debug APK build with `embedded-openmmo`
- native ARM64 library extraction/inspection from the APK

Real Adapter job `108765260195` also passed against the pinned server, including the real dungeon/combat regression.

The last adapter race fix changed only test semantics: an approach-time kobold disappearance is accepted only when the authoritative server emitted matching `MonsterDead`; unexplained disappearance remains failure.

Slice 1C PASS criteria are all satisfied:

1. real embedded core start — VERIFIED
2. real readiness before `coreLinked=true` — VERIFIED
3. graceful stop/persistence — VERIFIED
4. restart from persistent state/token — VERIFIED
5. Android ARM64 feature-linked compile — VERIFIED
6. installable feature-linked APK packaging — VERIFIED
7. Windows/Android/real-adapter regressions — VERIFIED

Important boundary: this proves linkage, packaging and automated runtime regressions. It does **not** yet prove the complete Android standalone end-user flow from app launch through Singleplayer auto-start and relaunch.

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

## 10. Next exact action — Android standalone user-flow acceptance

Start the next Gate from canonical `idea2`.

Required end-user path:

```text
actual Android APK launch
→ Singleplayer
→ embedded authoritative OpenMMO auto-start
→ no server URL/token user input
→ automatic local connection/auth
→ Character Lobby
→ EnterGame / gameplay
→ safe shutdown
→ relaunch
→ persisted authoritative state
```

The immediate work is to inspect the existing Android/Tauri startup path and wire the verified `OpenMmoEmbeddedController.start()` into the Singleplayer bootstrap without removing the existing external-server path.

PASS requires executable/runtime evidence. APK compilation alone is insufficient.

---

## 11. New-chat bootstrap

> Continue `js603/taurin4` on branch `idea2`. Read `docs/IDEA2_MASTER_RECORD.md`, `docs/IDEA2_M3D_SLICE1.md`, and `docs/IDEA2_NEXT_CHAT_HANDOFF_20260928.md` first. M3-C is VERIFIED/COMPLETE. M3-D Gate 0 is VERIFIED with Decision B. Slice 1A, 1B and 1C are VERIFIED. PR #12 is closed without merge. Slice 1C's verified files were promoted directly to `idea2` at `696c953d35916d3f69083a1f3f23ea6e7f03e09f`. The next Gate is actual Android standalone user-flow acceptance: app launch → Singleplayer → embedded authoritative OpenMMO auto-start → automatic local auth/lobby/gameplay → shutdown → relaunch persistence. Preserve exact OpenMMO pin, upstream authority, external-server compatibility and memory-only JS token policy.
