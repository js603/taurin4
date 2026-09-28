# idea2 MASTER RECORD

> **Canonical current-state record / Single Source of Truth**
>
> Repository: `js603/taurin4`
> Active branch: `idea2`
> Updated: **2026-09-28 (Asia/Seoul)**
>
> Historical evidence remains in Git history and `docs/archive/IDEA2_MASTER_RECORD_PRE_M3C_COMPLETE_20260926.md`.
> M3-D details: `docs/IDEA2_M3D_GATE0_FEASIBILITY.md`, `docs/IDEA2_M3D_SLICE1.md`, and `docs/IDEA2_M3D_ANDROID_STANDALONE_ACCEPTANCE_20260928.md`.

---

## 1. Project intent

`taurin4 / idea2` is a Text-first / Card / TUI realtime RPG/MMO client using the real OpenMMO authoritative world/server rather than reproducing gameplay rules in React.

```text
OpenMMO authoritative world
        ↓
Semantic Game Events / GameSession
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
- Android standalone mutable state uses app-private storage.
- Existing LAN/remote OpenMMO connection mode remains supported.
- Large desktop runtime data remains on the mounted **G:** drive where applicable.

---

## 2. Verification operating rules

1. Define PASS/FAIL evidence before deep investigation.
2. Prefer executable evidence over source archaeology.
3. Slow/stuck verification is corrected, never silently skipped.
4. No unbounded CI polling.
5. One cycle = workflow read → judgment → action → result report.
6. Temporary verification PRs are not merged with the PR merge action. If canonical is fast-forwarded to the verified head first, GitHub may classify the later-closed PR as merged because its commits are already contained in base; record that distinction explicitly.
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
- M3-D Android standalone user-flow acceptance — **VERIFIED / COMPLETE**

Recovery checkpoints:

- `checkpoint/idea2-m2-complete-20260924`
- `checkpoint/idea2-m3b-verified-20260925`
- `checkpoint/idea2-m3c-android-runtime-verified-20260925`
- `checkpoint/idea2-m3c-verified-20260926`
- `checkpoint/idea2-m3d-gate0-verified-20260927`
- `checkpoint/idea2-m3d-slice1a-verified-20260927`
- `checkpoint/idea2-m3d-slice1b-verified-20260927`
- `checkpoint/idea2-m3d-slice1c-verified-20260928`
- `checkpoint/idea2-m3d-standalone-verified-20260928` — final standalone acceptance checkpoint

---

## 4. M3-C external-server Android baseline — VERIFIED

The external/reachable-server Android path proves:

```text
APK
→ Tauri WebSocket transport
→ pinned real OpenMMO
→ auth / Character Lobby
→ EnterGame / old_crypt
→ MONSTER / WORLD ENCOUNTER
→ authoritative combat / kill / REWARD
→ background/foreground continuity
→ force-stop disconnect
→ relaunch / reauthentication
→ persisted-state rehydration
```

This path remains a required regression baseline even after standalone support.

---

## 5. M3-D architecture — VERIFIED / Decision B

The same pinned authoritative OpenMMO core is embedded in-process behind Tauri/Rust while preserving the WebSocket protocol boundary.

```text
Android/Windows taurin4
→ Tauri Rust backend
→ OpenMmoEmbeddedController
→ exact pinned OpenMMO authoritative core
→ loopback WebSocket
→ existing OpenMmoAdapter / OpenMmoGameSession
→ Text/Card GameScreen
```

Gate 0 proved Android compile/execution/socket/SQLite feasibility. Slice 1A established lifecycle/storage ownership. Slice 1B extracted the original authoritative server into a reusable library entrypoint. Slice 1C linked that core into Tauri and produced a feature-linked Android APK.

Slice 1C final verified temporary-PR head:

`8e75722660302591c2c7cd3af5a0c43a86c98a12`

Its verified implementation was promoted to canonical `idea2` without replacing OpenMMO authority.

---

## 6. M3-D Android standalone user-flow — VERIFIED / COMPLETE

Final verified implementation head:

`44669b89d0ddb863ea19f6865fbf73ffa344f1fa`

Verified real end-user path:

```text
actual Android APK launch
→ Singleplayer
→ embedded authoritative OpenMMO auto-start
→ no host/server URL/token input
→ automatic loopback auth/bootstrap
→ Character Lobby
→ character/state creation
→ safe embedded stop + upstream persistence
→ app force-stop/relaunch
→ Singleplayer restart
→ persisted character restored
→ EnterGame
→ OpenMMO World
→ SERVER AUTHORITATIVE gameplay state
```

Standalone workflow:

- `idea2 M3-D Android Standalone E2E` run `36382704727` — SUCCESS
- job `108801570224` — SUCCESS

Final-head regression matrix — all SUCCESS:

- Pull Request Quality `36382705005`
- Windows Playable Entry `36382704760`
- Android OpenMMO Client `36382704720`
- OpenMMO Adapter Integration `36382704686`
- Android OpenMMO Runtime E2E `36382704872`
- Windows Human Acceptance E2E `36382704747`
- M3-D OpenMMO Tauri Link `36382704778`
- M3-D Android Standalone E2E `36382704727`
- Android OpenMMO Lifecycle E2E `36382704657`

The external/reachable-server Android runtime job `108801570976` also passed on the same final head.

The final correction was test-harness-only: the Android soft keyboard obscured the second external-connection field after the new Singleplayer section expanded the screen. The acceptance driver now dismisses the IME between field entries. Product network/auth/gameplay behavior was unchanged.

### PR #13 / promotion semantics

Verification branch:

`ci/idea2-m3d-android-standalone-20260928`

PR #13 was a temporary draft verification PR. After all nine workflows passed, canonical `idea2` was moved by a **non-force fast-forward** from `f5ad5f570fed63a760bf24107bf6d9df9c412944` to the exact verified head `44669b89d0ddb863ea19f6865fbf73ffa344f1fa`.

No PR merge action and no merge commit were used. When PR #13 was subsequently closed, GitHub reported `merged=true` because the base already contained the head. Treat this as GitHub containment semantics, not as a project merge-commit operation.

Detailed evidence: `docs/IDEA2_M3D_ANDROID_STANDALONE_ACCEPTANCE_20260928.md`.

---

## 7. Security / authority boundaries

- Exact OpenMMO pin stays fixed unless an explicit migration Gate changes it.
- OpenMMO remains authoritative.
- No combat/monster/dungeon/inventory/persistence authority is recreated in taurin4.
- token is not placed in URL, localStorage or sessionStorage.
- standalone token is handed through the native launch config and kept memory-only on the JS side.
- Android persistent authoritative data lives in app-private storage.
- LAN/remote entry remains available and tested.
- `LocalGameSession` remains available.

---

## 8. Pinned old_crypt facts

- id `old_crypt`
- entrance `(-1450, 0.7, 4720)`
- kobold lv1 / HP5 / guard8 / attack `1d4`
- attack cooldown `1900ms`, chase range `20m`
- starter sword `worn_iron_sword`, damage `1d6`
- player attack cadence about `1380ms`, impact about `540ms`
- XP event has optional `monster_id`

Real fixtures must not alter OpenMMO HP, damage, AI, spawn count, cooldown or server authority.

---

## 9. Next exact action — playable OpenMMO surface expansion

The infrastructure question is closed: PC/Android can use the real pinned OpenMMO, Android can host it standalone inside Tauri, persistence works, and external-server compatibility remains green.

The next Gate is therefore **not more standalone plumbing**. It is to determine how much of actual OpenMMO gameplay is currently exposed through the Text/Card/TUI presentation and expand one coherent player-facing slice.

Immediate sequence:

1. execute/audit the current standalone playable path beyond lobby/basic combat,
2. compare reachable TUI actions/states against the pinned OpenMMO gameplay surface,
3. identify missing high-value systems already available through authoritative protocol/events,
4. select one coherent vertical slice,
5. implement presentation/input adaptation only through `GameSession` / semantic events,
6. verify on Windows and Android standalone,
7. keep Android LAN/remote and real-adapter regressions green.

Do not begin by recreating OpenMMO systems in React.

---

## 10. New-chat bootstrap

> Continue `js603/taurin4` on branch `idea2`. Read `docs/IDEA2_MASTER_RECORD.md`, `docs/IDEA2_M3D_ANDROID_STANDALONE_ACCEPTANCE_20260928.md`, and `docs/IDEA2_NEXT_CHAT_HANDOFF_20260928.md` first. M3-C is VERIFIED/COMPLETE. M3-D Gate 0 and Slices 1A/1B/1C are VERIFIED. Android standalone user-flow acceptance is VERIFIED/COMPLETE at implementation head `44669b89d0ddb863ea19f6865fbf73ffa344f1fa`; all nine final-head PR workflows passed. Do not redo standalone infrastructure verification. Start the playable OpenMMO surface audit and choose the next coherent Text/Card/TUI gameplay slice while preserving exact upstream authority, standalone persistence, external-server compatibility and memory-only JS token policy.
