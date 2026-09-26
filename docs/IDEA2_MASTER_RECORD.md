# idea2 MASTER RECORD

> **Canonical current-state record / Single Source of Truth**
>
> Repository: `js603/taurin4`
> Active branch: `idea2`
> Updated: **2026-09-26 (Asia/Seoul)**
>
> 이 문서는 현재 프로젝트 상태와 다음 작업을 빠르게 이어가기 위한 canonical 기록이다.
> M0~M3-C의 상세 조사/실패/교정 이력은 Git에 그대로 보존되어 있으며,
> 압축 전 전체 기록은 `docs/archive/IDEA2_MASTER_RECORD_PRE_M3C_COMPLETE_20260926.md`를 참조한다.

---

## 1. Project intent

`taurin4 / idea2`는 OpenMMO의 authoritative world/server 시스템을 실제 backend로 사용하면서,
3D 렌더링 대신 **Text-first / Card / TUI 감성의 실시간 RPG/MMO 클라이언트**로 재구성하는 프로젝트다.

핵심 표현 파이프라인:

```text
OpenMMO authoritative world
        ↓
Semantic Game Events
        ↓
Attention Director
        ↓
Floating Card / Focus Modal / Critical Modal / Event Log
```

원칙:

- OpenMMO가 이동/전투/몬스터/보상/인벤토리/월드의 권위자다.
- React/Tauri는 게임 규칙을 복제하지 않는다.
- `GameSession`이 UI와 backend 사이의 공통 경계다.
- `LocalGameSession`은 유지한다.
- `OpenMmoGameSession / OpenMmoAdapter`는 Windows/Android에서 공유한다.
- OpenMMO reference pin은 항상 다음 exact commit이다.

`950e081c178d920c10c51f2d31f60c1b3383c925`

---

## 2. Current architecture

```text
React Text/Card UI
      ↓
GameScreen / Attention
      ↓
GameSession
      ├─ LocalGameSession
      └─ OpenMmoGameSession
              ↓
         OpenMmoAdapter
              ↓
    OpenMmoTransport abstraction
      ├─ Browser/Node WebSocket transport
      └─ Tauri plugin WebSocket transport
              ↓
       OpenMMO Rust Server
```

Platform policy:

- Windows: first-class Tauri client/runtime.
- Android: first-class Tauri APK client/runtime.
- M3-C Android is a client connected to reachable OpenMMO server.
- Android-hosted standalone OpenMMO is **M3-D**, not M3-C.
- Android LAN-host acceptance is not yet the current multiplayer Gate.

Storage constraint:

- large local/runtime data must prefer the user's mounted **G:** drive.
- Windows OpenMMO runtime default remains `G:\taurin4-openmmo-runtime`.

---

## 3. Verification operating rules

1. Define PASS/FAIL evidence before deep investigation.
2. Maximum 3 exploratory branches before switching to shortest proof route.
3. Prefer executable evidence over source archaeology.
4. A slow verification method must be replaced, not silently skipped.
5. No unbounded CI polling.
6. One cycle = workflow 조회 → 판단 → 행동 → 결과 보고.
7. Do not create unrelated CI restart churn while a long real-server Gate is running.
8. Status vocabulary:
   - `VERIFIED`
   - `IMPLEMENTED-CI-VERIFIED`
   - `IMPLEMENTED-NOT-VERIFIED`
   - `BLOCKED`
   - `DEFERRED-WITH-PLAN`
9. Temporary CI PRs are closed **without merge** after verification.
10. Material milestone changes must update this record.

---

## 4. Completed milestones

### M0 — Floating Text Vertical Slice — COMPLETE

Local Text/Card loop works:

```text
탐험 → 목적지 → 이동 → 조우 → 전투 → 반응 → 보상 → 탐험
```

### M0.5 — Cross-platform Host Foundation — COMPLETE

Shared Rust LAN/bootstrap host foundation exists for Windows/Android packaging.

### M0.6 — Character / World Contract — FOUNDATION COMPLETE

Character Passport / WorldSave schema baseline exists. Durable final persistence is still later work.

### M1 — Windows PC ↔ Windows PC LAN — COMPLETE

Real two-PC LAN runtime was user-confirmed on 2026-09-23.

### M1.5 — Original OpenMMO Runtime & Flow Audit — COMPLETE

Original pinned OpenMMO server/client lifecycle and architecture were audited and executed.
Important conclusion: OpenMMO world simulation, combat, monster AI and deterministic NPC execution do not require an LLM.

### M2 — taurin4 + Real OpenMMO Backend — COMPLETE

Recovery checkpoint:

`checkpoint/idea2-m2-complete-20260924`

Verified real-server path includes:

```text
ClientInfo
→ auth
→ character lifecycle
→ EnterGame
→ authoritative movement
→ ability/cooldown
→ real old_crypt
→ MonsterSpawned
→ semantic MONSTER
→ WORLD ENCOUNTER
→ PlayerAttack
→ PlayerAttacked
→ MonsterDead
→ XpGained
→ optional original-RNG GroundItem pickup
→ inventory/equipment
→ disconnect/reconnect persistence
```

### M3-A — Controlled Combat Input Migration — VERIFIED

Real combat now goes through the player-facing path:

```text
GameSession INVESTIGATE_ENCOUNTER / ATTACK
→ OpenMmoGameSession
→ OpenMmoAdapter
→ authoritative OpenMMO server
```

### M3-B — Windows Playable Runtime — VERIFIED

Recovery checkpoint:

`checkpoint/idea2-m3b-verified-20260925`

Actual Windows Tauri/WebView2 automation verified:

```text
one-command launcher
→ local pinned OpenMMO server
→ in-memory token handoff
→ Character Lobby
→ GameScreen
→ real MONSTER / WORLD ENCOUNTER
→ visible attack input
→ authoritative combat result
```

---

## 5. M3-C — Android real OpenMMO client — VERIFIED

M3-C is now complete across all planned slices.

### Slice 1 — Android transport/APK — IMPLEMENTED-CI-VERIFIED

Recovery checkpoint:

`checkpoint/idea2-m3c-slice1-ci-verified-20260925`

Implemented:

- `@tauri-apps/plugin-websocket 2.4.3`
- `tauri-plugin-websocket 2.4.3`
- Android runtime detection
- `TauriPluginOpenMmoTransport`
- FIFO async plugin-send ordering
- Android APK build Gate

### Slice 2 — Actual Android APK runtime — VERIFIED

Recovery checkpoint:

`checkpoint/idea2-m3c-android-runtime-verified-20260925`

Final verified head:

`386bd6244a4ead22bb91858f3cb8e662411836cd`

Final Gate results:

- Quality `36145279929` — **SUCCESS**
- Real pinned OpenMMO adapter `36145280078` — **SUCCESS**
- Android OpenMMO Client APK `36145279831` — **SUCCESS**
- Windows Tauri acceptance `36145279854` — **SUCCESS**
- Android Runtime E2E `36145280020` — **SUCCESS**

Android artifact proved the actual APK path:

```text
APK
→ Tauri WebSocket transport
→ pinned real OpenMMO
→ auth
→ Character Lobby
→ CryptMira
→ EnterGame
→ OpenMMO World
→ MONSTER
→ WORLD ENCOUNTER
→ 살펴본다
→ 빠른 공격
→ authoritative kobold kill
→ REWARD / Kobold 처치
```

Server evidence included:

`Player CryptMira killed kobold (lvl 1)`

### Slice 3 — Android lifecycle / reconnect — VERIFIED

Temporary verification PR: `#8`

Verification branch/head:

`ci/idea2-m3c-android-lifecycle-20260925`

`14354bf75ab662bf458a881f35eb72da363447e3`

Verified run set on that head:

- PR Quality `36167085027` — **SUCCESS**
- Android Client APK `36167085033` — **SUCCESS**
- Windows Acceptance `36167085315` — **SUCCESS**
- Android Runtime regression `36167085264` — **SUCCESS**
- **Android Lifecycle E2E `36167085139` — SUCCESS**
- Real pinned OpenMMO adapter `36167085196`
  - attempt 1: combat RNG failure
  - attempt 2 / job `108305632758`: **SUCCESS**
  - `Run taurin4 adapter against real pinned server` — **SUCCESS**

Lifecycle acceptance proves with the **actual Android APK**:

```text
connect/auth
→ Character Lobby
→ CryptMira
→ EnterGame
→ capture authoritative state
→ Android HOME/background
→ foreground resume
→ same live session; no Session ended
→ force-stop package
→ server observes Session ended for CryptMira
→ relaunch APK
→ server URL/token are NOT persisted
→ deliberately re-enter credentials
→ same CryptMira in Character Lobby
→ EnterGame again
→ authoritative persisted state rehydrated
```

Lifecycle state policy:

- HOME/background does **not** freeze OpenMMO world simulation.
- HP may legitimately change while the app is backgrounded.
- Background continuity therefore requires same live session, same character/floor/position boundary and no disconnect; HP equality is not required for this specific transition.
- Force-stop/reconnect compares the last observed authoritative state to rehydrated state, including HP where applicable.

Security boundary remains unchanged:

- auth token is memory-only.
- no token in URL.
- no token in localStorage/sessionStorage.
- no device token persistence was added for Slice 3.

Slice 3 implementation promoted to `idea2`:

`c283e03c8fdc44bc1f9d7c079572f815950996b8`

Promoted files:

- `.github/workflows/idea2-android-openmmo-lifecycle.yml`
- `scripts/ci/android_openmmo_lifecycle_acceptance.py`
- `scripts/ci/run_android_openmmo_acceptance.sh`
- `src/features/game/ui/GameScreen.tsx`
- `src/features/game/ui/GameScreen.test.tsx`
- `src/openmmo/real.integration.test.ts`

The promotion used the current `idea2` tree as the base and replaced only these six verified blobs. The detailed canonical history on `idea2` was preserved.

---

## 6. Current exact project status

- M0 — COMPLETE
- M0.5 — COMPLETE
- M0.6 — FOUNDATION COMPLETE
- M1 — COMPLETE
- M1.5 — COMPLETE
- M2 — COMPLETE
- M3-A — VERIFIED
- M3-B — VERIFIED
- **M3-C — VERIFIED / COMPLETE**

Current verified Android capabilities:

- installable Tauri APK
- real pinned OpenMMO connectivity
- Character Lobby
- EnterGame
- Text/Card GameScreen
- real MONSTER encounter
- actual server-authoritative combat/kill/reward
- background/foreground session continuity
- force-stop disconnect detection
- fresh-launch reauthentication
- authoritative character-state rehydration
- token remains memory-only

Temporary PR policy:

- PR #7 was closed without merge after Slice 2 verification.
- PR #8 is to be closed without merge after Slice 3 finalization.

---

## 7. Important pinned OpenMMO facts

Reference commit:

`950e081c178d920c10c51f2d31f60c1b3383c925`

Relevant old_crypt facts:

- id: `old_crypt`
- entrance: `(-1450, 0.7, 4720)`
- depth-1 kobold level: 1
- kobold HP: 5
- guard: 8
- attack damage: `1d4`
- attack cooldown: `1900ms`
- chase range: `20m`
- starter sword: `worn_iron_sword`, damage `1d6`
- player attack cadence: approximately `1380ms`, impact approximately `540ms`
- XP event contains optional `monster_id`

Real test fixture uses deterministic dungeon geometry and safe staging without changing monster HP, damage, AI, spawn count, cooldown or server authority.

---

## 8. Android connection information for current M3-C topology

Current M3-C Android app is a client, not yet an on-device OpenMMO host.

For a real Galaxy/device on the same LAN as a PC OpenMMO server:

```text
SERVER WEBSOCKET · LAN / REMOTE
ws://<PC-LAN-IP>:10006

LOCAL AUTH TOKEN
<contents of OpenMMO data/npc_token>
```

Do not use on a physical phone:

- `127.0.0.1` — means the phone itself
- `10.0.2.2` — Android Emulator host alias only

The OpenMMO server must be reachable on LAN, normally bound to `0.0.0.0:10006`.

---

## 9. Next exact action — M3-D Android standalone singleplayer

M3-C is complete. The next milestone is **M3-D**.

Goal:

```text
launch Android taurin4
→ choose Singleplayer
→ local/embedded authoritative OpenMMO runtime starts automatically
→ internal/localhost transport
→ Character Lobby
→ gameplay
→ safe shutdown
→ persistent character/world state on device
```

Do **not** duplicate OpenMMO combat/world rules in React merely to make standalone easier.

### M3-D Gate 0 — feasibility audit

Before implementation, prove whether the pinned OpenMMO authoritative server model can be embedded or compiled suitably for Android.

Audit in this order:

1. pinned OpenMMO server crate Android compile blockers
2. Tokio/network/runtime compatibility on Android
3. SQLite/filesystem paths inside Tauri Android app storage
4. server data/config packaging requirements
5. process model: original executable vs in-process server-core extraction
6. local socket/WebSocket feasibility
7. lifecycle/background restrictions
8. memory/CPU footprint
9. crash-safe persistence/shutdown

Decision outcomes:

- **A. Original server can run/host cleanly on Android:** embed/start it behind localhost/internal transport.
- **B. Original executable model is unsuitable but server core is portable:** extract/embed the authoritative server core and keep the same protocol boundary.
- **C. Critical authoritative dependencies are not mobile-portable:** record exact blockers before selecting a narrower replacement architecture.

M3-D Gate 0 PASS requires executable compile/runtime evidence, not assumption.

---

## 10. New-chat bootstrap

For a new conversation:

> Continue `js603/taurin4` on branch `idea2`. Read `docs/IDEA2_MASTER_RECORD.md` first and treat it as canonical. Verify the actual `idea2` HEAD and relevant CI state before changes. M3-C Android real OpenMMO client, combat, lifecycle and reconnect are VERIFIED. Continue from `M3-D Gate 0 — Android standalone OpenMMO feasibility audit`. Preserve server authority, the exact pinned OpenMMO commit, memory-only auth-token policy, G: storage constraint for large desktop runtime data, and the anti-delay/no-unbounded-polling rules.
