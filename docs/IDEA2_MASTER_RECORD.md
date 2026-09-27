# idea2 MASTER RECORD

> **Canonical current-state record / Single Source of Truth**
>
> Repository: `js603/taurin4`
> Active branch: `idea2`
> Updated: **2026-09-27 (Asia/Seoul)**
>
> 상세 과거 이력은 Git history와 `docs/archive/IDEA2_MASTER_RECORD_PRE_M3C_COMPLETE_20260926.md`에 보존한다.
> M3-D Gate 0 상세 증거는 `docs/IDEA2_M3D_GATE0_FEASIBILITY.md`를 참조한다.

---

## 1. Project intent

`taurin4 / idea2`는 OpenMMO의 authoritative world/server를 실제 backend로 사용하면서,
3D 렌더링 대신 **Text-first / Card / TUI 감성의 실시간 RPG/MMO 클라이언트**로 재구성하는 프로젝트다.

```text
OpenMMO authoritative world
        ↓
Semantic Game Events
        ↓
Attention Director
        ↓
Floating Card / Focus Modal / Critical Modal / Event Log
```

고정 원칙:

- OpenMMO가 이동/전투/몬스터/보상/인벤토리/월드의 권위자다.
- React/Tauri에 OpenMMO 게임 규칙을 복제하지 않는다.
- `GameSession`이 UI/backend 공통 경계다.
- `LocalGameSession`은 유지한다.
- `OpenMmoGameSession / OpenMmoAdapter`는 Windows/Android에서 공유한다.
- OpenMMO reference는 exact commit으로 고정한다.

`950e081c178d920c10c51f2d31f60c1b3383c925`

---

## 2. Current client architecture

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
      ├─ Browser/Node WebSocket
      └─ Tauri plugin WebSocket
              ↓
       OpenMMO Rust Server
```

Current platform policy:

- Windows: first-class Tauri runtime.
- Android: first-class Tauri APK runtime.
- M3-C external/reachable server client path is VERIFIED.
- M3-D now moves Android to standalone embedded authoritative OpenMMO.
- large desktop runtime data remains on the user's mounted **G:** drive where applicable.

---

## 3. Verification operating rules

1. Define PASS/FAIL evidence before deep investigation.
2. Prefer executable evidence over source archaeology.
3. Maximum three exploratory branches before switching proof route.
4. Slow/stuck verification must be corrected, not silently skipped.
5. No unbounded CI polling.
6. One cycle = workflow 조회 → 판단 → 행동 → 결과 보고.
7. Temporary verification PRs are closed **without merge**.
8. Status vocabulary:
   - `VERIFIED`
   - `IMPLEMENTED-CI-VERIFIED`
   - `IMPLEMENTED-NOT-VERIFIED`
   - `BLOCKED`
   - `DEFERRED-WITH-PLAN`
9. Material milestone changes update this record.

---

## 4. Completed milestones

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

Important recovery checkpoints:

- `checkpoint/idea2-m2-complete-20260924`
- `checkpoint/idea2-m3b-verified-20260925`
- `checkpoint/idea2-m3c-slice1-ci-verified-20260925`
- `checkpoint/idea2-m3c-android-runtime-verified-20260925`
- `checkpoint/idea2-m3c-verified-20260926`

---

## 5. M3-C verified Android capabilities

Actual Android APK verification proved:

```text
APK
→ Tauri WebSocket transport
→ pinned real OpenMMO
→ auth
→ Character Lobby
→ CryptMira
→ EnterGame
→ OpenMMO World
→ MONSTER / WORLD ENCOUNTER
→ touch attack input
→ authoritative kobold kill
→ REWARD
→ background/foreground session continuity
→ force-stop disconnect
→ fresh-launch reauthentication
→ authoritative persisted-state rehydration
```

Security boundary:

- auth token remains memory-only.
- no token in URL.
- no token in localStorage/sessionStorage.
- no device token persistence was added.

M3-C final recovery checkpoint:

`checkpoint/idea2-m3c-verified-20260926`

---

## 6. M3-D Gate 0 — VERIFIED / DECISION B

Goal was to decide with executable evidence whether Android standalone should use:

- A. original OpenMMO executable,
- B. same authoritative server core embedded in-process,
- C. narrower replacement only if critical dependencies are non-portable.

### Final decision

**B — embed/extract the pinned authoritative OpenMMO server core into the Tauri Rust process and preserve the current WebSocket protocol boundary.**

This is not because the original server failed on Android. Gate 0 proved the opposite.

Final verification branch/head:

`ci/idea2-m3d-android-server-feasibility-20260926`

`9b3cf532b371adc18e1312359130a0e4a4a23537`

Temporary PR:

`#9` — **CLOSED / merged=false**

Final runs:

- M3-D Android OpenMMO Server Feasibility `36303619258` — **SUCCESS**
- Pull Request Quality `36303619268` — **SUCCESS**

Evidence artifact:

`idea2-m3d-android-server-feasibility` / `10926178241`

Verified evidence:

- `onlinerpg-shared` compiles for `aarch64-linux-android`
- `onlinerpg-terrain` compiles for `aarch64-linux-android`
- original `onlinerpg-server` checks for `aarch64-linux-android`
- original server builds as Android ARM64 ELF
- emulator-matching Android x86_64 server builds
- original pinned server executes inside Android userspace
- server binds `127.0.0.1:10006`
- real WebSocket Upgrade returns `HTTP 101 Switching Protocols`
- SQLite/filesystem state is created successfully in the supplied Android state directory
- cleanup is bounded; final workflow completes normally

Probe state evidence included actual files such as:

- `game_data.db`
- SQLite journal/WAL-related files
- `network_metrics.db*`
- `npc_token`
- `cape-textures/`

Gate 0 CI/probe files promoted directly to `idea2` without PR merge:

- `.github/workflows/idea2-m3d-android-server-feasibility.yml`
- `scripts/ci/android_openmmo_server_runtime_probe.sh`

Promotion commit:

`1e52753e4759da8f89a3fe927f4b17c53b96b30b`

### Why B instead of production A

The raw server executable is technically Android-portable, but production taurin4 should not depend on owning a separate native child executable. Tauri already has the correct native lifecycle shape:

```text
Tauri command/native bootstrap
→ Rust controller
→ Tokio runtime/task
→ loopback WebSocket
→ explicit stop / persistence
```

Therefore M3-D will extract the upstream `main.rs` startup/lifecycle boundary into a reusable controller while keeping authoritative gameplay modules unchanged.

Target architecture:

```text
Android taurin4 APK
        ↓
Tauri Rust backend
        ↓
OpenMmoServerController
        ↓
embedded pinned OpenMMO authoritative core
 ├─ SQLite/state
 ├─ movement/combat
 ├─ monster AI
 ├─ dungeon/world
 └─ persistence/ticks
        ↓
127.0.0.1:<local port> WebSocket
        ↓
existing OpenMmoAdapter
        ↓
Text/Card UI
```

Detailed Gate record:

`docs/IDEA2_M3D_GATE0_FEASIBILITY.md`

---

## 7. Important pinned OpenMMO facts

Reference commit:

`950e081c178d920c10c51f2d31f60c1b3383c925`

Relevant old_crypt baseline:

- id: `old_crypt`
- entrance: `(-1450, 0.7, 4720)`
- kobold level 1 / HP 5 / guard 8
- kobold attack `1d4`
- attack cooldown `1900ms`
- chase range `20m`
- starter sword `worn_iron_sword`, damage `1d6`
- player attack cadence about `1380ms`, impact about `540ms`
- XP event carries optional `monster_id`

Real fixtures must not alter OpenMMO monster HP, damage, AI, spawn count, cooldown or server authority.

---

## 8. Next exact action — M3-D Slice 1

**M3-D Gate 0 is closed. Do not reopen the architecture investigation without contradictory executable evidence.**

Slice 1 goal:

```text
launch Android taurin4
→ choose/enter Singleplayer bootstrap
→ Tauri Rust starts embedded authoritative OpenMMO
→ app-private state/data paths
→ receives loopback endpoint + in-memory local auth token
→ existing OpenMmoAdapter connects automatically
→ Character Lobby
→ safe stop
→ restart
→ persistent authoritative state
```

First implementation scope:

1. establish reusable `OpenMmoServerConfig` + `OpenMmoServerController/Handle` boundary from pinned OpenMMO startup code,
2. keep all authoritative game modules/protocol unchanged,
3. map mutable state to Tauri/Android app-private storage,
4. own server Tokio task through native lifecycle rather than a raw child executable,
5. expose only endpoint/readiness/token handoff required by native bootstrap,
6. keep token memory-only on the JS side,
7. reuse existing `OpenMmoAdapter / OpenMmoGameSession`,
8. prove explicit stop + persistence restart,
9. then prove the complete path with an actual Android APK acceptance Gate.

Accurate embedded runtime RSS/CPU measurement is deferred to Slice 1 acceptance because the Gate 0 probe's early memory sample targeted the adb keepalive shell rather than the actual server process. No incorrect memory value is treated as verified.

---

## 9. New-chat bootstrap

> Continue `js603/taurin4` on branch `idea2`. Read `docs/IDEA2_MASTER_RECORD.md` first and treat it as canonical. M3-C is VERIFIED/COMPLETE. M3-D Gate 0 is VERIFIED with Decision B: embed the pinned OpenMMO authoritative server core in-process inside Tauri while preserving the WebSocket protocol and server authority. Continue from `M3-D Slice 1 — embedded OpenMmoServerController skeleton`. Preserve exact OpenMMO pin `950e081c178d920c10c51f2d31f60c1b3383c925`, memory-only JS auth-token policy, G: storage constraint for large desktop runtime data, temporary-PR-no-merge policy, and anti-delay/no-unbounded-polling rules.
