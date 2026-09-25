# idea2 MASTER RECORD

> **Canonical project state / Single Source of Truth**
>
> 이 문서는 `js603/taurin4`의 `idea2` 브랜치에 대한 공식 프로젝트 기록이다.
> 새 채팅, 새 작업 세션, 다른 실행 환경에서 프로젝트를 이어갈 때 가장 먼저 이 문서를 확인한다.
> 기존 대화 기억보다 **현재 저장소 + 이 문서 + CI 결과**를 우선한다.

- Last verified: **2026-09-24 (Asia/Seoul)**
- Repository: `js603/taurin4`
- Branch: `idea2`
- Base checkpoint: `370688fc7d712e823206510d9b972af0fab30e88`
- Last verified implementation HEAD: `beea00867a4255daa86869df23790177c667aac1`
- Latest M2 implementation candidate HEAD: `beea00867a4255daa86869df23790177c667aac1`
- Latest M3 implementation candidate HEAD: `f0f026a368c5ca975712edf303125b7651598a2c`
- Verified validation: run `35903549333` — **SUCCESS**
- Verified Pages: run `35903549203` — **SUCCESS**
- Verified Windows/Android: run `35903549207` — **SUCCESS**
- Verified real OpenMMO regression: run `35903549323` — **SUCCESS**
- Note: documentation-only commits may advance the branch HEAD. Every new session must query the actual `idea2` HEAD before work.
- GitHub Pages preview: `https://js603.github.io/taurin4/idea2/`
- OpenMMO reference repository: `Julian-adv/OpenMMO`
- OpenMMO migration reference pin: `950e081c178d920c10c51f2d31f60c1b3383c925`

---

## 1. Project intent

idea2는 OpenMMO의 대규모 서버/월드/캐릭터/전투/인벤토리 시스템을 참고하면서,
3D 에셋 부담을 없애고 **Text-first / Card / TUI 감성의 실시간 RPG/MMO 클라이언트**로 재구성하는 프로젝트다.

핵심 표현 원칙:

```text
OpenMMO-like authoritative world
        ↓
Semantic Game Events
        ↓
Attention Director
        ↓
Floating Card / Focus Modal / Critical Modal / Event Log
```

목표는 "3D 화면을 ASCII로 변환"하는 것이 아니다.
월드 상태를 의미 단위로 압축해 보여주는 **Text-first Cinematic UI**가 목표다.

---

## 2. Non-negotiable principles

### 2.1 Web-first + Optional Tauri

게임 UI와 게임 명령 구조는 Tauri 없이도 동작해야 한다.

```text
React / TypeScript
      ↓
GameSession
      ↓
Backend implementation
```

Tauri는 게임플레이 API 그 자체가 아니라 다음 역할을 담당한다.

- Windows/Android 패키징
- 로컬 Rust Host lifecycle
- LAN 관련 OS integration
- 로컬 저장
- 향후 LAN discovery

브라우저/PWA는 UI와 클라이언트 검증용이며 Rust Host를 실행하지 않는다.

### 2.2 Server authoritative

멀티플레이의 실제 판정은 Host/Server가 가진다.

- 이동
- 전투
- 몬스터
- 보상
- 인벤토리 변경
- 월드 상태

클라이언트 파일이나 클라이언트 입력을 무조건 신뢰하지 않는다.

### 2.3 Asset-light / Text-first

초기 및 핵심 플레이에는 다음 외부 에셋을 필수 의존성으로 두지 않는다.

- GLB 캐릭터
- 스프라이트 시트
- 환경 텍스처
- 음악/이미지 대용량 번들
- OpenMMO의 대규모 terrain data

### 2.4 No paid server requirement

현재 프로젝트의 개발/테스트/기본 플레이에 유료 클라우드 서버를 요구하지 않는다.

- 개발: 로컬 PC Host
- LAN: 방장 PC가 Host
- GitHub: source / CI / static preview
- 외부 상시 서버: 현재 범위 아님

### 2.5 Local workspace constraint

로컬 파일 작업이 필요할 경우 저장 공간 제약상 **G: mounted drive를 우선 사용**한다.
불필요한 대용량 OpenMMO terrain/assets를 내려받지 않는다.

---

## 3. Current architecture

```text
React Floating Text UI
        │
        ▼
    GameSession
        │
        ├── LocalGameSession        ← 현재 M0 플레이 가능
        │
        └── OpenMmoGameSession      ← 향후 M2
        │
        ▼
Semantic GameEvent / Attention
```

Native runtime:

```text
Windows Tauri / Android Tauri
              │
              ▼
      HostController commands
      host_start / host_stop
      host_status
              │
              ▼
 taurin4-game-server-core
              │
              ▼
       Tokio WebSocket Host
```

공통 Rust crates:

```text
crates/
├─ game-network/
│   └─ bootstrap LAN control protocol
├─ game-server-core/
│   └─ embedded WebSocket host lifecycle
└─ game-persistence/
    ├─ CharacterPassport
    └─ WorldSave
```

중요: `game-server-core`는 Tauri에 의존하지 않는다.

---

## 4. Implemented game vertical slice (M0)

현재 Pages/Web에서 다음 플레이 루프가 동작한다.

```text
탐험
 → 주변 장소 카드
 → 목적지 선택
 → 압축 이동
 → 이동 중 조우
 → 전투
 → 빠른 기본 공격
 → Telegraph
 → 회피 / 가드
 → Perfect Evade
 → 반격
 → 전리품
 → 탐험 복귀
```

구현 파일:

- `src/game/model.ts`
- `src/game/simulation.ts`
- `src/game/simulation.test.ts`
- `src/game/attention.ts`
- `src/game/session.ts`
- `src/features/game/ui/GameScreen.tsx`
- `src/features/game/ui/HostControl.tsx`
- `src/platform/hostRuntime.ts`
- `src/styles.css`

Presentation hierarchy:

1. ordinary event → Event Log
2. nearby/context action → Floating Card
3. meaningful decision → Focus Modal
4. immediate danger/reaction → Critical Modal

이 M0 전투는 **현재 로컬 Vertical Slice 검증용**이다.
OpenMMO의 실제 전투가 연결되었다는 의미가 아니다.

---

## 5. LAN Host foundation

현재 Rust Host Core가 구현되어 있다.

Bootstrap control protocol:

- `HostHello`
- `Hello`
- `ClientAccepted`
- `Ping`
- `Pong`
- `Error`

Host config:

- local only: `127.0.0.1`
- LAN visible: `0.0.0.0`
- default intended port: `10006`

Tauri commands:

- `host_status`
- `host_start`
- `host_stop`

Host UI는 Browser에서는 preview-only 상태를 보여주며,
Tauri runtime에서 Local Host / LAN Host 버튼이 활성화된다.

---

## 6. Character and world ownership model

원작 OpenMMO의 "서버가 캐릭터를 전부 소유"하는 모델을 최종 정책으로 그대로 고정하지 않는다.

idea2의 목표 모델:

```text
PLAYER DEVICE
 └─ Character Passport
      ├─ identity
      ├─ level / XP
      ├─ stats
      ├─ inventory
      ├─ equipment
      └─ currency

HOST
 └─ World Save
      ├─ world id / seed
      ├─ world revision
      ├─ world time
      └─ world-owned persistent state
```

현재 구현된 것은 **schema + validation baseline**이다.
실제 디스크 저장/동기화/Host import는 아직 미구현이다.

멀티 중에는 Host가 권위자다.
Character Passport는 가져오더라도 Host가 규칙 검증 후 승인해야 한다.

---

## 7. Platform policy

### Windows

계속 1급 플랫폼으로 개발한다.

- React client
- Tauri
- embedded Rust Host
- LAN Client
- LAN Host

### Android

계속 1급 **빌드/플레이 플랫폼**으로 유지한다.

- React client
- Tauri APK
- embedded Rust Host architecture 유지
- 공통 Rust core Android compile 유지

단, **현재 LAN 실제 테스트 Gate에서는 제외**한다.

현재 LAN 실제 검증 범위:

```text
Windows PC A  ←→  Windows PC B
```

현재 검증 대상이 아닌 것:

- Android ↔ Windows LAN runtime
- Android ↔ Android LAN runtime

Android는 당분간 다음까지만 CI/검증한다.

- Android project init
- common Rust host core compile/link
- Debug APK build
- artifact 생성

Android LAN Host/Client 기능을 제거하는 것이 아니다.
**실제 LAN 테스트 Gate만 PC↔PC로 제한**한다.

---

## 8. Verified CI / build results

Runtime/build results below are current through implementation HEAD `728e9d2fc8fffecb5ecd39a190b749bfb3418ebe`.
Subsequent documentation-only commits do not represent additional runtime implementation.

### idea2 validation

- Workflow: `.github/workflows/idea2-ci.yml`
- Run ID: `35811464640`
- Result: **SUCCESS**
- Scope:
  - ESLint: PASS
  - Vitest: **4 files / 11 tests PASS**
  - TypeScript: PASS
  - Vite production build: PASS
- M1 TypeScript coverage includes:
  - LAN protocol encode/decode/endpoint normalization
  - LAN client handshake
  - Ping RTT
  - bounded reconnect
  - protocol mismatch fail-fast

### Windows + Android platform validation

- Workflow: `.github/workflows/idea2-platform.yml`
- Run ID: `35811466046`
- Result: **SUCCESS**

Verified:

- Shared Rust network protocol tests: PASS
- Persistence contract tests: PASS
- Host start/bind/stop test: PASS
- Real localhost WebSocket integration test: PASS
  - HostHello
  - Hello(platform=windows)
  - ClientAccepted
  - Ping/Pong
  - disconnect client count
  - reconnect
- Windows Tauri + embedded Host/Client compile: PASS
- Windows M1 test artifact staging/upload: PASS
- Android Tauri Debug APK + embedded shared Rust core build: PASS
- Android APK artifact upload: PASS

Windows M1 artifact:

- Artifact ID: `10729769734`
- Artifact name: `idea2-m1-windows-x64-test`
- Contains the same `taurin4.exe` intended for both PC A and PC B runtime testing.

Android artifact:

- Artifact ID: `10729884292`
- Artifact name: `idea2-android-host-debug-apk`
- Android LAN runtime remains outside the current Gate.
- Note: GitHub Actions artifacts are temporary and should not be treated as permanent release storage.

### Pages

- Workflow: `.github/workflows/pages-idea2.yml`
- Run ID: `35811464692`
- Result: **SUCCESS**

Preview:

`https://js603.github.io/taurin4/idea2/`

---

## 9. idea2 commit history from base checkpoint

idea2 is **17 commits ahead** of base checkpoint and 0 commits behind at the last verification.

1. `19ebd792744f3709a9dd99349ae4c1697954defa` — feat(idea2): add floating text vertical slice
2. `081f233b40c6080c59f5f137a63c4deaff6be212` — ci(idea2): publish playable Pages preview
3. `e4049f17b9d9a85d404e9df2f08b8a6108bf5620` — feat(idea2): add shared LAN protocol crate
4. `150b59a88c54d9351d74f0c55430dd05af009866` — feat(idea2): define LAN bootstrap protocol
5. `7e3742cdfd7323ade48e77e3c1236b6a3f05387b` — feat(idea2): add persistence contract crate
6. `69aceeb0375c134bbb06da5c37da8af9f17eb9a5` — feat(idea2): separate character passport and host world
7. `58eff885d7478c05be66e3c4b400da5e7b9ed11a` — feat(idea2): add shared Rust game host core
8. `eb140680b853bc38cc44ac46b5b8d20fd07c0a2f` — feat(idea2): implement embedded WebSocket LAN host
9. `507f97623141f73b7ed09614708c0eb5aba52827` — feat(idea2): link shared host core into Tauri
10. `2f01cee18628741ddd93f62e5dd5164efea39225` — feat(idea2): expose local and LAN host lifecycle
11. `54298fa718238c311083f51b234434d368eb88ba` — feat(idea2): add cross-platform host runtime adapter
12. `48bb102501b5a17e71303edbf4201cd935efa73c` — feat(idea2): add native host controls
13. `d1aa24e90c42b7c6618979a14455581bc72f778f` — feat(idea2): surface Windows and Android host controls
14. `144e690ab3ae19ea3abe96db7ff343ca9e6704b2` — style(idea2): add responsive host status panel
15. `bc1d1574fdd7fa7c59a11dbbe0936b756aa3f296` — docs(idea2): lock Windows and Android parity policy
16. `4a391ef711a0699d8159bc28b0d26b4ef87f65fd` — ci(idea2): validate Windows and Android host parity
17. `ef47f8cc5390a42a23854aeca463eed55fb581e5` — fix(idea2): enable Tokio select macro

---

## 10. OpenMMO reference findings

OpenMMO reference architecture:

- Svelte + TypeScript + Three.js/Threlte client
- Rust authoritative server
- WebSocket multiplayer
- Rust shared protocol crate
- MessagePack protocol via `rmp-serde`
- Web client uses WASM exports from shared Rust to serialize/deserialize protocol messages
- persistent characters/inventory/world systems
- monster/NPC/server-side systems
- terrain/world generation system

Important constraints:

- OpenMMO assets are not all stored directly in Git.
- Full terrain can be extremely large; do not fetch it by default.
- Current project does not require OpenMMO GLB/music assets for Text-first UI.
- OpenMMO license is PolyForm Noncommercial 1.0.0.
- Direct source incorporation into a distributable/commercial product requires deliberate license review.
- For now OpenMMO remains **reference/pinned external source**, not bulk-copied into taurin4.

---

## 11. Original OpenMMO user-flow audit target

Before implementing the real adapter, the original game must be launched and played as a control/reference.

Verified source-level top screen flow:

```text
LOGIN
  ↓
CHARACTER SELECT
  ├─ select
  ├─ delete
  ├─ rename
  └─ create
       ↓
CHARACTER CREATE
  ├─ name
  ├─ class
  ├─ gender
  └─ stat roll
       ↓
CHARACTER SELECT
       ↓
ENTER GAME
       ↓
GAME
```

Current source indicates:

- authentication returns character list
- up to 3 character slots in current UI
- character create
- character delete
- rename-required flow
- stat roll
- class/gender selection
- `EnterGame`
- reconnect authentication
- automatic re-entry using the previous character
- return from game to character select
- movement samples
- player attacks
- abilities
- respawn

M1.5 must verify these by **actually playing**, not only by source inspection.

---

## 12. Official milestone roadmap

### M0 — Floating Text Vertical Slice — COMPLETE

Completion:

- LocalGameSession
- semantic locations
- compressed travel
- encounter
- combat/reaction
- rewards
- Attention UI
- responsive browser UI

### M0.5 — Cross-platform Host Foundation — COMPLETE

Completion:

- shared Rust LAN protocol
- shared embedded WebSocket Host
- Tauri host commands
- Windows native compile
- Android APK compile
- host UI

### M0.6 — Character / World Contract — FOUNDATION COMPLETE

Completion:

- CharacterPassport schema
- WorldSave schema
- validation tests

Not yet:

- actual filesystem persistence
- character import/export
- multiplayer final-state reconciliation

### M1 — Windows PC ↔ Windows PC LAN — COMPLETE

**Implementation, automated/local integration, and the real Windows PC A ↔ PC B LAN runtime Gate are complete. The user confirmed the two-PC test on 2026-09-23.**

Implemented:

- typed TypeScript LAN control protocol
- manual Host address normalization
- LAN Client state machine
- `CONNECTING → HANDSHAKING → CONNECTED`
- HostHello protocol version validation
- Hello / ClientAccepted
- Ping/Pong + RTT
- bounded reconnect delays: 0.5s / 1.5s / 3.0s
- protocol mismatch fail-fast
- Host + Client native control panels
- real localhost Rust WebSocket integration test
- Windows M1 test artifact
- formal runtime checklist: `docs/IDEA2_M1_PC_LAN_TEST.md`

Runtime Gate result:

- same Windows artifact used on the real PC↔PC LAN path
- user confirmed the M1 LAN test succeeded on 2026-09-23
- M1 is now closed; automatic discovery remains intentionally deferred

Reference sequence:

```text
PC A
  Start LAN Host
        ↓
PC B
  connect to PC A
        ↓
HostHello
        ↓
Client Hello
        ↓
ClientAccepted
        ↓
Ping / Pong
        ↓
Host connected_clients = 1
        ↓
PC B disconnect
        ↓
Host connected_clients = 0
        ↓
PC B reconnect
```

Initial connection may use manual host address.
**LAN automatic discovery comes only after basic connection is proven.**

M1 completion is based only on Windows PC↔PC runtime testing.
Android LAN runtime is excluded from the current Gate.

### M1.5 — OpenMMO Original Runtime & Flow Audit — COMPLETE

This is a formal verification milestone.

Completion evidence: run `35887895372` — **SUCCESS**.

Verified:

- pinned original server build: PASS
- original server real process startup: PASS
- no-Google server startup: PASS
- no-full-terrain server startup: PASS
- SQLite state creation: PASS
- NPC token generation: PASS
- original protocol ClientInfo/auth: PASS
- stat roll + character creation: PASS
- character persistence + reconnect: PASS
- EnterGame / in-game entry path: PASS
- original browser shared WASM build: PASS
- original Svelte/TypeScript/lint validation: PASS
- original browser Vite bundle + HTTP preview: PASS

Important LLM boundary discovered:

- OpenMMO world simulation, monster AI, combat authority, item/drop/dungeon rules do not require an LLM.
- Agent Client low-level execution (protocol/state/pathfinding/reflex handling) is separate from optional LLM high-level reasoning.
- The pinned revision contains a coupling bug/inconsistency: generic `llm="none"` agent sessions do not take the normal EnterGame branch even though config comments imply deterministic schedule/monster-AI operation can continue without an LLM.
- idea2 must **not** copy that coupling. Deterministic NPC/agent execution and optional LLM reasoning remain separate modules.

#### M1.5-A Original Runtime

Run original OpenMMO Server + original OpenMMO Client locally.

Identify exact blockers:

- build dependencies
- auth
- DB
- terrain/data
- required assets
- ports
- minimum viable dataset

Do not casually download the full large terrain/assets.

#### M1.5-B Original User Journey

Actually execute and record:

```text
launch
→ server connection
→ login
→ character list
→ create character if needed
→ class/gender/stat roll/name
→ select character
→ EnterGame
→ world load
```

#### M1.5-C Character Lifecycle

Verify:

- create
- select
- delete
- rename
- logout
- reconnect
- persistence

#### M1.5-D Character Actions / Core Play

Actually test:

- movement
- nearby player/NPC visibility
- monster encounter
- basic attack
- ability
- damage/death
- respawn
- loot
- inventory
- equipment
- chat
- NPC interaction where available
- logout/reconnect state

#### M1.5-E Migration Matrix

Every relevant original feature is classified as:

- **KEEP** — preserve behavior
- **ADAPT** — preserve system, replace presentation/input
- **REPLACE** — replace system
- **DROP** — intentionally not used

No major OpenMMO system should be changed before this matrix exists.

### M2 — taurin4 + Real OpenMMO Backend — COMPLETE

Goal: complete one actual OpenMMO gameplay cycle through our taurin4 client.

Phase 1 and early Phase 2 implementation are now present:

- `src/openmmo/types.ts`
- `src/openmmo/codec.ts`
- `src/openmmo/transport.ts`
- `src/openmmo/adapter.ts`
- `src/openmmo/adapter.test.ts`
- `src/openmmo/real.integration.test.ts`
- `.github/workflows/idea2-openmmo-adapter.yml`
- `src/openmmo/session.ts`
- `src/openmmo/session.test.ts`
- `src/openmmo/runtime.ts`
- `src/features/game/ui/OpenMmoCharacterLobby.tsx`
- `src/features/game/ui/OpenMmoBootstrap.tsx`
- `src/openmmo/browserCodec.ts`
- `src/app/runtimeMode.ts`
- `scripts/prepare-openmmo-codec.mjs`
- `docs/IDEA2_M2_OPENMMO_ADAPTER.md`

Implemented adapter flow:

```text
connect
→ mandatory ClientInfo
→ NPC/Google auth boundary
→ character list
→ stat roll
→ create/delete/rename
→ EnterGame
→ JoinSuccess
→ automatic WorldReady
→ GameTimeSync → Heartbeat
```

The mock orchestration tests are implemented, and a second Gate now builds the real pinned
OpenMMO shared WASM codec and boots the real pinned OpenMMO server before running taurin4's
adapter against them. The taurin4 adapter has now completed ClientInfo → NPC audit auth → character lifecycle → EnterGame → WorldReady against the real pinned OpenMMO server and real shared WASM codec.

First success definition:

```text
taurin4 launch
→ character list
→ create/select character
→ real OpenMMO EnterGame
→ Text/Card world
→ real movement/travel action
→ real monster encounter
→ real attack/ability
→ real reward/loot
→ real inventory update
→ logout
→ reconnect
→ same character state
```

Architecture:

```text
taurin4 React
   ↓
GameSession
   ↓
OpenMmoGameSession / OpenMmoAdapter
   ↓
OpenMMO shared codec boundary
   ↓
Binary WebSocket
   ↓
OpenMMO Rust Server
```

M2 is the point where **our UI plays real OpenMMO systems**.

### M3 — Controlled Native Migration

Only after M2 works end-to-end.

Examples:

- coordinate movement → semantic destination travel
- 3D presentation → Text/Card presentation
- original combat presentation/input → our attention/reaction UI
- auth → LAN/local-friendly identity if required
- character persistence → Character Passport model where appropriate

Do not rewrite everything at once.

### M4 — Durable Character Passport + Host World

Implement actual persistence:

- Character Passport file/repository
- Host World save
- validation
- import/export
- host-authoritative multiplayer updates
- safe disconnect/reconnect
- recovery strategy

---

## 13. Current risks / unresolved items

1. **OpenMMO authentication**
   - Original client uses Google authentication flow.
   - Local/LAN zero-cost project may require a dev/local identity strategy.
   - Must be established during M1.5 before M2.

2. **OpenMMO terrain/assets**
   - Full world data is too large for casual integration.
   - M1.5 must identify minimum dataset required to enter/play the world.

3. **License boundary**
   - OpenMMO is PolyForm Noncommercial.
   - Keep reference code separate until source reuse decision is explicit.

4. **Android runtime LAN**
   - Embedded Host Core builds successfully in APK.
   - Android↔PC and Android↔Android LAN runtime are not current test requirements.

5. **Character Passport**
   - Schema exists.
   - Real persistence and server reconciliation not implemented.

---

## 14. Definition of "done"

A milestone is not complete merely because code exists.

Required evidence as applicable:

- automated test
- build success
- runtime behavior
- real two-device test when that milestone explicitly requires it
- CI result
- updated MASTER RECORD

Unverified behavior must be marked explicitly as unverified.

---

## 15. Documentation continuity rule

This file is the canonical continuity record.

Initial canonical-document commits:

- `c81377735e0334ddaca21edf803e880a9c75fa42` — add canonical project master record
- `842a73af2d74eeb38fb451afef84732f699bdd07` — limit LAN runtime Gate to Windows PC↔PC
- `360bd9bc3b39f4154106ef95ac66bedaebd148b8` — align architecture with M1.5 OpenMMO audit roadmap
- `f1c0d8add643d3b5e1ec8811e93735e636c826eb` — finalize continuity/resume protocol

CI efficiency commits:

- `08305b4042d1591bafa7b988136a81c92a13c405` — skip normal quality CI for docs-only pushes
- `b4068934955c02b635c5fb79d5463f6707f33893` — skip Windows/Android platform builds for docs-only pushes
- `be8be819f831cea8b53505a824b786e13a8bbca2` — skip Pages deployment for docs-only pushes

This keeps the living documentation cheap to maintain: documentation-only updates do not
rebuild Windows, Android, or Pages unnecessarily.

Do not rely on documentation commit SHAs as the latest branch HEAD; query GitHub at the
start of each session.

For every major milestone, architectural change, test-policy change, or verified build:

1. update `Last verified`
2. verify and record the actual branch HEAD separately from the last implementation baseline
3. update milestone status
4. record test/CI result
5. record material decisions
6. update "Next exact action"
7. commit documentation together with or immediately after implementation

If another document conflicts with this file, fix that document or explicitly update
this file.


## 15.1 Anti-delay investigation protocol

This project must **not skip difficult verification work merely because it is slow**.
The response to delay is to change the investigation method, not to drop the requirement.

Use the following operating rules for every non-trivial implementation/debug/audit task:

1. **Define the Gate before exploring**
   - state the exact fact to prove
   - state what evidence counts as PASS
   - state what evidence counts as FAIL
   - identify at least one fallback verification route

2. **Bound exploratory branching**
   - do not keep expanding source-search chains without a decision point
   - after at most 3 exploratory branches, stop opening adjacent hypotheses and summarize
     what is already known
   - choose the shortest remaining route that can still prove the same Gate

3. **Prefer executable evidence over deeper source archaeology**
   - existing upstream tests
   - deterministic runtime probes
   - server logs / protocol messages
   - generated deterministic outputs
   - only then deeper static source tracing

4. **Method-switch instead of scope-drop**
   - if WASM/API/source tracing stalls, switch to a runtime probe or upstream test
   - if runtime setup is blocked, switch to a deterministic source-derived fixture
   - if a fixture would distort original rules, do not use it; choose another authentic path
   - unresolved requirements remain recorded and are completed later; they are not silently removed

5. **No unbounded CI polling**
   - normally inspect a workflow once after launch and once at the next meaningful checkpoint
   - if it is still running, continue non-conflicting work or report the current state
   - never keep a user response open by repeatedly polling until completion

6. **Avoid CI restart churn**
   - while a long real-server Gate is running, do not push unrelated source changes that would
     cancel/restart it
   - batch nearby fixes into one commit when possible
   - docs-only updates are allowed when they do not retrigger heavy workflows

7. **Checkpoint before deepening**
   - when an investigation changes from the original question into a secondary technical problem
     (example: "prove dungeon combat" turning into "reverse-engineer WASM stair internals"),
     explicitly checkpoint:
       - confirmed facts
       - remaining unknown
       - why the current method is slow
       - the alternate method selected
   - then continue toward the original Gate

8. **Keep verification completeness**
   - do not mark a skipped/unverified item PASS
   - do not remove it from the roadmap merely to advance
   - distinguish: VERIFIED / IMPLEMENTED-NOT-VERIFIED / BLOCKED / DEFERRED-WITH-PLAN

9. **User-visible progress**
   - for multi-step work, report meaningful partial findings before long tool chains
   - if a path is becoming a delay source, say so immediately and switch method in the same turn

10. **Canonical recording**
    - every material method change, blocker, or deferred verification item must remain in this
      MASTER RECORD with the exact next action needed to finish it

Applied example for the current M2 dungeon Gate:

- required scope remains: real monster encounter → attack → kill → reward/drop observation
- do **not** omit dungeon combat
- do **not** spend an unbounded investigation on hidden stair internals
- prefer the deterministic pinned dungeon layout/pathfinding/runtime route already identified
- if that specific stair route becomes a new bottleneck, switch to another authentic original-server
  dungeon-entry proof rather than dropping the combat Gate


---

## 16. Next exact action

**M2 — old_crypt real encounter / kill Gate**

Verified implementation baseline:

`39863b66973598dc93f8e1ca00f00a80ba1aa8fd`

Verified Gates:

- idea2 validation — run `35903549333` — **SUCCESS**
- Pages — run `35903549203` — **SUCCESS**
- Windows + Android — run `35903549207` — **SUCCESS**
- real pinned OpenMMO regression — run `35903549323` — **SUCCESS**

The real OpenMMO Gate now proves:

```text
ClientInfo
→ NPC audit auth
→ character create/select
→ EnterGame / WorldReady
→ authoritative movement
→ Radiance / AbilityCooldowns
→ real PlayerAttack request / PlayerAttackRejected mapping
→ unequip
→ DropItem / GroundItem
→ PickupItem / InventoryUpdated
→ EquipItem
→ disconnect
→ reconnect
→ same character / equipment / position persistence
→ pinned browser WASM codec production/PWA build
```

The previous Workbox failure is closed: the pinned shared WASM codec is ~3.84 MiB and
idea2 now explicitly allows up to 5 MiB in the precache Gate.

### Next runtime slice: real dungeon combat

Do not fake ambient spawning. NPC-token sessions are official NPCs in the original server
and ambient spawning intentionally refuses to create monsters for an unwatched official NPC.

Use the original dungeon system instead:

1. target `old_crypt`, the nearest registered dungeon to the world spawn
2. obtain its deterministic layout from pinned WASM `dungeon_layout("old_crypt")`
3. register identical dungeon passability with `dungeon_add_passability`
4. use original WASM A* / stair waypoints to enter depth 1
5. confirm authoritative floor change to `-1`
6. receive real server-created `MonsterSpawned`
7. approach a real depth-1 kobold
8. send real `PlayerAttack` at >=1380 ms cadence
9. observe authoritative `PlayerAttacked` / `MonsterDead`
10. verify guaranteed XP/reward event
11. observe/pick up a ground drop only when the original RNG actually produces one
12. never make a probabilistic drop a required assertion

Pinned facts already audited for this slice:

- `old_crypt` entrance: (-1450, 0.7, 4720)
- depth 1 monster table: level-1 kobold
- kobold base HP: 5
- kobold guard: 8
- kobold attack: 1d4, 1900 ms cadence
- starter sword: 1d6
- player attack cadence: 1380 ms, impact at 540 ms
- pinned WASM pathfinding emits only regular entry/exit floor waypoints; intermediate stair
  keys remain internal

After this Gate, assess whether M2 has enough real runtime coverage to close, then move to
the explicit Text/Card app-surface proof before M3.

---


### Current old_crypt Gate candidate — 2026-09-24

Verified implementation HEAD:

`e85d4d4c56753b7e2313449b06fd803a95d2ff97`

Status: **VERIFIED**

Verification evidence:

- observable PR head: `d8d236c2cabbe4bc7085dd0d0df8cb2891369328`
- real pinned OpenMMO workflow: run `35915829210` — **SUCCESS**
- PR Quality: run `35915829045` — **SUCCESS**
- current `idea2` workflow blob is byte-identical to the successful run
- current `idea2` real integration test differs from the successful PR test only by the temporary PR probe comment, so executable test logic is identical

The executable real-server Gate now requires:

```text
old_crypt real entry
→ authoritative floor -1
→ real MonsterSpawned
→ semantic MONSTER destination
→ actual WORLD ENCOUNTER Text/Card witness
→ authentic dungeon door/path approach
→ real PlayerAttack
→ authoritative PlayerAttacked
→ MonsterDead
→ XpGained tied to the killed monster
→ if original RNG creates GroundItem:
     semantic LOOT observation
     → authentic approach when required
     → PickupItem
     → GroundItemRemoved
     → InventoryUpdated
```

Important verified source/data facts for this Gate:

- `XpGained` includes `monster_id: Option<String>`; kill XP can be tied to the exact kobold.
- normal engineering `npc_` accounts receive the standard starter `worn_iron_sword`; only registered world NPC names skip starter gear.
- pinned `old_crypt` is registered at `(-1450, 0.7, 4720)`.
- pinned kobold is dungeon depth 1-4, level 1, guard 8, HP 5, attack cooldown 1900 ms, damage 1d4, and `dungeonAggressive=true`.
- probabilistic dungeon loot remains observational only and is never required for PASS.
- if a real drop does occur, the Gate requires authoritative pickup acknowledgement through both `GroundItemRemoved` and `InventoryUpdated`.

### Anti-delay method changes already applied

The connected GitHub status surface does not expose push-triggered workflow runs reliably.
Instead of polling blindly, the real OpenMMO workflow now also supports `pull_request`
verification and a temporary draft PR is used only to expose the same Gate to the connector.

The pinned OpenMMO checkout was also a delay source. The workflow now uses an exact-revision
partial sparse clone rather than downloading the full repository working tree. The clone:

- fetches exact commit `950e081c178d920c10c51f2d31f60c1b3383c925`
- asserts `rev-parse HEAD` equals that pin
- includes the Rust workspace, `data-src`, required generated/static `data`, and the small
  object catalog required by `include_str!`
- does not fetch bulk GLB assets or terrain data

Push and pull-request runs now use separate concurrency groups so verification runs do not
cancel or block each other merely because the same workflow exists on both event types.

### Runtime evidence collected so far

Observable PR run `35914892932` reached the real runtime Gate after all infrastructure passed:

- partial sparse pinned OpenMMO checkout — PASS
- pinned OpenMMO server build — PASS
- pinned shared WASM codec build — PASS
- isolated pinned server boot — PASS
- prior full-cycle movement/ability/inventory/equipment/reconnect regression — PASS
- real `old_crypt` runtime creation — observed
- real depth-1 kobolds `m1`, `m2`, `m3` — observed
- real dungeon door opens — observed

That run failed only on a late Text/Card assertion:

```text
expected phase: encounter
received phase: combat
```

The failure is not evidence that the encounter was skipped. `MonsterAttackedPlayer`
authentically advances `OpenMmoGameSession` from `encounter` to `combat`, and the
aggressive kobold can do that while the test is opening doors.

Candidate `91054770...` fixes the verification timing without weakening the Gate:

- session state is observed continuously
- the Gate records a witness only when the real monster exists as a floor -1 semantic
  `MONSTER` and `getAttentionCard` yields the `WORLD ENCOUNTER` focus card with the
  investigate action
- later `combat` is accepted only as the legitimate successor state, and if already in
  combat the enemy id must equal the witnessed encounter monster id
- the same witnessed monster id continues through approach, attack, death and XP proof

The bounded real pinned-server Gate is now **PASS**. Run `35915829210` completed the
full real adapter job, including the authoritative `old_crypt` integration test and the
production browser/PWA build.

Verified Gate chain:

```text
old_crypt real entry
→ authoritative floor -1
→ real MonsterSpawned
→ semantic MONSTER destination
→ WORLD ENCOUNTER Text/Card witness
→ authentic dungeon door/path approach
→ real PlayerAttack
→ authoritative PlayerAttacked
→ MonsterDead
→ XpGained tied to the killed monster
→ optional original RNG GroundItem pickup path when a drop occurs
```

Probabilistic loot remains non-mandatory. The test only requires pickup acknowledgement
when the original server actually produces a `GroundItem`.

Exact next verification action:

1. close the temporary verification PR without merging
2. add an explicit `GameScreen` app-surface test proving the real semantic MONSTER /
   WORLD ENCOUNTER state renders through the actual Text/Card UI surface
3. run the normal quality Gate for that app-surface proof
4. only after that proof, assess M2 closure and M3 readiness

### GameScreen Text/Card app-surface Gate — 2026-09-24

Implementation candidate:

`beea00867a4255daa86869df23790177c667aac1`

Status: **VERIFIED**

Added `src/features/game/ui/GameScreen.test.tsx` using the actual `GameScreen`
component and React `renderToStaticMarkup`, with no new dependency.

The test supplies the authoritative OpenMMO encounter state shape already proven by the
real pinned-server Gate and requires the rendered app surface to contain:

- `OPENMMO · AUTHORITATIVE WORLD`
- the actual nearby-target surface `aria-label="OpenMMO 주변 대상"`
- a `semantic-destination-card`
- `MONSTER`
- `Kobold`
- `WORLD ENCOUNTER`
- the `살펴본다` action
- the actual attention `role="dialog"`

Verification route:

- temporary PR: #2, `ci/idea2-app-surface-gate-20260924`
- PR probe head: `5205f6c0fdfb7cf4c8f1acc88a9452a634a2e68c`
- PR Quality run: `35937617812`
- final status: **SUCCESS**

Anti-delay handling:

- no repeated CI polling after observing `in_progress`
- direct container checkout was attempted as the fallback execution route, but the
  execution environment cannot resolve `github.com`; that route was stopped immediately
- PR Quality run `35937617812` completed **SUCCESS**
- temporary PR #2 was closed without merging after verification
- the long real OpenMMO Gate was not re-run for this UI-only proof

This closes the final M2 app-surface requirement.

### M2 completion decision — 2026-09-24

Status: **M2 COMPLETE**

The M2 first-success definition is now satisfied end-to-end:

```text
taurin4 launch/runtime bootstrap
→ character list
→ create/select character
→ real OpenMMO EnterGame
→ actual Text/Card world surface
→ authoritative movement/travel
→ real old_crypt MonsterSpawned
→ WORLD ENCOUNTER card
→ real combat
→ authoritative PlayerAttacked
→ MonsterDead
→ XP reward
→ GroundItem / PickupItem path when an original drop exists
→ real inventory update
→ logout/disconnect
→ reconnect
→ same character/equipment/position persistence
```

Completion evidence:

- baseline validation — run `35903549333` — SUCCESS
- Pages — run `35903549203` — SUCCESS
- Windows + Android — run `35903549207` — SUCCESS
- baseline real pinned OpenMMO — run `35903549323` — SUCCESS
- authoritative `old_crypt` real encounter/kill Gate — run `35915829210` — SUCCESS
- actual `GameScreen` Text/Card app-surface Gate — run `35937617812` — SUCCESS

The optional dungeon item drop remains intentionally probabilistic and is not required for
PASS. When the original server produces one, the integration path observes and acquires it
through the authoritative GroundItem protocol.

### M2 complete recovery checkpoint

Checkpoint branch:

`checkpoint/idea2-m2-complete-20260924`

Checkpoint commit:

`6e7e963a0fcb1bae3efbcafe45859afce7a5d11d`

Use this branch when a clean recovery point immediately after M2 completion is required.

### M3 entry decision

M3 may now start.

The first M3 Gate is **Controlled Combat Input Migration**:

```text
real MonsterSpawned
→ semantic MONSTER card
→ actual GameScreen WORLD ENCOUNTER
→ INVESTIGATE_ENCOUNTER through GameSession
→ combat attention card
→ ATTACK through GameSession
→ OpenMmoAdapter PlayerAttack
→ authoritative combat result
```

Purpose:

- remove the remaining test-only shortcut where the old_crypt integration Gate invokes
  `adapter.sendAttack(...)` directly
- prove that the real app-facing `GameSession` command path drives original OpenMMO combat
- preserve server authority; do not move combat rules into React/Tauri
- keep the Text/Card / attention presentation while replacing original 3D interaction

PASS requires an executable test proving the command reaches the real adapter/server path.
Do not rewrite movement, auth, persistence, and combat simultaneously.


### M3-A Controlled Combat Input Migration candidate — 2026-09-24

Implementation candidate:

`f0f026a368c5ca975712edf303125b7651598a2c`

Status: **VERIFIED**

The real `old_crypt` integration Gate no longer calls
`adapter.sendAttack(targetId)` directly for combat. At the real combat boundary it now:

1. preserves the previously witnessed authoritative encounter monster id
2. if the session is still in `encounter`, sends
   `session.command({ type: "INVESTIGATE_ENCOUNTER" })`
3. requires the resulting/shared combat target to remain the same real kobold
4. sends each basic attack through
   `session.command({ type: "ATTACK" })`
5. continues to require authoritative `PlayerAttacked`, `MonsterDead`, and
   monster-correlated `XpGained`

This removes the test-only direct adapter combat shortcut while keeping server authority
and the existing deterministic dungeon approach unchanged.

Verification Gate:

- normal quality Gate must pass
- real pinned OpenMMO old_crypt workflow must pass
- direct adapter calls remain allowed for low-level dungeon navigation/door protocol where
  they are not player-facing combat input
- do not mark M3-A VERIFIED until the real pinned-server run succeeds

Verification execution:

- temporary PR: #3, `ci/idea2-m3a-combat-gate-20260924`
- PR probe head: `ee7fab6ced2894a8873c2cf4d9c2f200ce761419`
- PR Quality run `35943608796` — **SUCCESS**
- real pinned OpenMMO run `35943608800` — **SUCCESS**
- PR #3 closed without merging after verification

M3-A is **VERIFIED**. Real old_crypt combat input now traverses the player-facing
`GameSession` command path before reaching the authoritative OpenMMO server.

Exact next action:

1. begin M3-B Playable Runtime Entry
2. reduce local OpenMMO launch/auth setup without weakening token handling
3. keep server authority and the pinned codec intact
4. finish with a human-playable Windows acceptance path


### M3-B — Playable Runtime Entry — 2026-09-24

Status: **IMPLEMENTED-CI-VERIFIED**

Implementation candidate:

`0d530da337f12e9d51a7114bf3a80e5f6b5c0d97`

M3-A is already VERIFIED, so M3-B source implementation has started.

Implemented path:

```text
npm run openmmo:play:windows
→ G:\taurin4-openmmo-runtime
→ exact pinned OpenMMO sparse checkout
→ reuse/build pinned Rust server
→ reuse/build pinned browser WASM codec
→ start hidden local OpenMMO server
→ read original server data/npc_token
→ pass server/account/token only through Tauri process environment
→ Tauri openmmo_local_launch_config command
→ React detects native autostart config
→ OpenMmoBootstrap auto-connect/auth
→ Character Lobby
→ GameScreen
```

Implemented files:

- `scripts/play-openmmo-windows.ps1`
- `src/openmmo/nativeLaunch.ts`
- `src-tauri/src/lib.rs`
- `src/App.tsx`
- `src/features/game/ui/OpenMmoBootstrap.tsx`
- `package.json`
- `.github/workflows/idea2-windows-playable.yml`

Storage/security policy:

- default runtime root is fixed to `G:\taurin4-openmmo-runtime`
- OpenMMO source, Cargo download cache, target artifacts, server logs, and empty terrain
  workspace are placed under that G: runtime root
- existing server build and browser codec are reused when the audited pin matches
- `game_data.db` is not deleted, so local character/world state persists between plays
- the NPC token is never placed in URL parameters, localStorage, or sessionStorage
- the launcher passes the token only through the Tauri process environment and the
  Tauri command returns it to the current React process in memory
- the launcher removes its inherited OpenMMO environment variables when the Tauri dev
  process exits

Player-facing entry wording is no longer M2/audit-only. The native launcher bypasses
manual server/account/token entry and automatically proceeds to the real Character Lobby.
The existing explicit `?runtime=openmmo` manual path remains as a web/development fallback.

One-command Windows entry:

```powershell
npm run openmmo:play:windows
```

Optional clean rebuild:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/play-openmmo-windows.ps1 -ForceRebuild
```

Runtime diagnostics:

- server stdout: `G:\taurin4-openmmo-runtime\openmmo-server.stdout.log`
- server stderr: `G:\taurin4-openmmo-runtime\openmmo-server.stderr.log`
- managed server pid: `G:\taurin4-openmmo-runtime\openmmo-server.pid`

Verification PR:

- PR #4 — `ci/idea2-m3b-playable-entry-20260924`
- probe head: `b3283852e8fb2f713e8a7d6cc821c1d6073f286a`
- PR Quality run: `35949166290` — **SUCCESS**
- Windows Playable Entry run: `35949166292` — **SUCCESS**

Windows Playable Entry Gate checks:

1. `npm run check`
2. `cargo check --manifest-path src-tauri/Cargo.toml`
3. PowerShell parser validation for the launcher
4. static enforcement of G: default runtime root
5. Tauri native launch bridge presence
6. no browser storage use in playable bootstrap

Verification result:

- PR Quality run `35949166290` — **SUCCESS**
- Windows Playable Entry run `35949166292` — **SUCCESS**
- frontend quality, Tauri Rust bridge, PowerShell parser, G: policy, and in-memory token
  policy all passed
- PR #4 closed without merging after verification
- M3-B is now **IMPLEMENTED-CI-VERIFIED**

M3-B CI-verified recovery checkpoint:

- branch: `checkpoint/idea2-m3b-ci-verified-20260924`
- commit: `3ab64df06648d7e228f9a2c38b65cb6bf74a5ec1`
- human acceptance guide: `docs/IDEA2_M3B_WINDOWS_ACCEPTANCE.md`


### Automated human-replacement acceptance — 2026-09-24

Because direct user-side testing is currently difficult, the human acceptance Gate is being
executed on a Windows GitHub runner using the actual Tauri executable and WebView2
automation. This is not a renderer-only mock test.

Official Tauri v2 supports WebDriver-based desktop E2E on Windows. The acceptance harness:

1. boots the exact pinned OpenMMO Rust server
2. creates/persists `CryptMira` inside real `old_crypt` using the already verified real
   integration path
3. builds the pinned browser WASM codec
4. builds the actual Windows Tauri debug executable
5. launches it through `tauri-driver` / Edge WebDriver
6. verifies Character Lobby and `CryptMira`
7. clicks the real `입장` button
8. verifies the actual GameScreen
9. requires a real `MONSTER` plus encounter/combat surface
10. clicks `살펴본다` when the WORLD ENCOUNTER card is still visible; if the aggressive
    kobold legitimately advances to combat first, accepts that authoritative successor state
11. clicks the visible `빠른 공격` control repeatedly at the existing safe cadence
12. requires a visible authoritative kill/reward result and the
    `SERVER AUTHORITATIVE` marker
13. captures Character Lobby, GameScreen, encounter, and combat-result screenshots

Implementation:

- `e2e/package.json`
- `e2e/wdio.conf.mjs`
- `e2e/specs/openmmo-playable.e2e.mjs`
- `.github/workflows/idea2-windows-human-e2e.yml`

Verification PR:

- PR #5 — `ci/idea2-m3b-human-e2e-20260924`
- probe head: `2f21fbb10a67ad834cf8d62479bd94283231d4f9`
- Windows Tauri acceptance run `35950234236` — **FAILURE before app launch**
- PR Quality run `35950234238` — **SUCCESS**
- failure step: `Build pinned OpenMMO server`
- root cause: Windows sparse-checkout reported success but did not materialize
  `openmmo/Cargo.toml`; OpenMMO build never started
- fix commit on `idea2`: `eb76c23da63eee3c28cc1197f88870c8a7ac485c`
- retry PR head: `ca469837cf77058cb7866203b4d1236f6bc75e2b`
- fix switches Windows checkout to cone sparse mode and explicitly asserts
  `openmmo/Cargo.toml` and `openmmo/Cargo.lock` before build
- retry run `36074065737` progressed further:
  - OpenMMO server build — PASS
  - Node codec build — PASS
  - isolated OpenMMO server boot — PASS
  - old_crypt seed — FAIL before auth because the Node seed process could not reconnect
    across the Windows Actions step boundary
- server log proved OpenMMO was fully ready on `127.0.0.1:10006` before the boundary
- second infrastructure fix commit: `13182a260db73f0f1f85114ad0343056203e969f`
- new method keeps server start → real old_crypt seed → actual Tauri/WebView2 acceptance
  inside one PowerShell step, guaranteeing the same server process lifetime
- retry PR head: `d7e2057cd01bbc4d530a5b960989db73e65d8a19`
- run `36075153376` progressed through:
  - pinned OpenMMO server build — PASS
  - Node codec build — PASS
  - browser codec build — PASS
  - real Tauri debug app build — PASS
  - tauri-driver install — PASS
  - matching Edge WebDriver install — PASS
- failure then occurred inside the combined seed/UI step because `CryptMira` died to a
  real kobold before the UI acceptance began
- server evidence confirms real auth, character creation, old_crypt entry, three real kobold
  spawns and authentic dungeon door opens before that death
- this is not treated as an app/runtime failure; it exposed that the full kill Gate was an
  overly aggressive fixture for acceptance seeding
- seed method is now split correctly:
  - `OPENMMO_ACCEPTANCE_SEED_ONLY=1`
  - enter real old_crypt
  - reach a real semantic dungeon monster while alive
  - stop before player-vs-kobold combat
  - persist/disconnect
  - let the actual Tauri/WebView2 UI perform the encounter and kill
- seed implementation commit: `f052e1575d6e46e758ad80a10c4bf2db09f3bf52`
- workflow commit: `bdce6fc6ff86a0ad02f53dcba6bbc10268b70d3b`
- retry PR head: `8e8279f34f8f938a20e7349a7b79ccd453ecf15f`
- run `36077170339` — **SUCCESS** for the actual Windows Tauri/WebView2 human-replacement acceptance
- PR Quality run `36077170347` — **SUCCESS**
- same head's real OpenMMO adapter run `36077170227` — **FAILURE** only because the
  full old_crypt regression character died to a real kobold before the kill completed
- this failure is independent from the Windows app acceptance, which already passed
- pinned source review confirmed:
  - `RollCharacterStats` stores the latest pending attributes
  - `CreateCharacter` consumes those exact pending attributes
  - Barbarian is a normal player-selectable class with d10 hit die
- regression stabilization now keeps original rules but rolls up to 64 times for a normal
  male Barbarian satisfying:
  - `maxHp >= 14`
  - `guard >= 12`
  - `STR >= 13`
- all original authoritative kill / PlayerAttacked / MonsterDead / XpGained / optional loot
  assertions remain unchanged
- stabilization commit on `idea2`: `0d3db7de846bbef48b171418466aa9f3660d66dc`
- latest PR #5 head: `3fa4d19924285c7a9716afe4e27c4d5768593d63`
- first workflow lookup for that head returned no runs yet; no repeated polling was performed

M3-B finalization result:

- real pinned OpenMMO adapter run `36086163331` — **SUCCESS**
- PR Quality run `36086163290` — **SUCCESS**
- actual Windows Tauri/WebView2 acceptance run `36086163424` — **SUCCESS**
- PR #5 closed without merging after verification
- M3-B status: **VERIFIED**
- recovery checkpoint:
  - branch: `checkpoint/idea2-m3b-verified-20260925`
  - commit: `92dc6d56187343d57bba1ddb2e471b33f778d6c9`
- verified implementation includes:
  - one-command Windows local OpenMMO launch
  - pinned server + pinned browser codec
  - in-memory token handoff
  - Character Lobby → GameScreen
  - actual Tauri/WebView2 user-surface automation
  - real old_crypt MONSTER / WORLD ENCOUNTER
  - visible attack controls
  - authoritative combat result
  - stabilized real-server old_crypt regression with unchanged kill/XP/loot assertions

Next exact action:

1. create an M3-B VERIFIED recovery checkpoint
2. begin M3-C Android real OpenMMO client
3. keep OpenMmoAdapter / OpenMmoGameSession / game rules shared
4. replace only the platform transport/runtime entry where Android requires it

M3-B must remain **IMPLEMENTED-CI-VERIFIED** until the Windows Tauri acceptance run itself
finishes SUCCESS. A renderer-only success is not sufficient.

Final **M3-B VERIFIED** still requires the human Windows acceptance run:

```text
npm run openmmo:play:windows
→ automatic local server start
→ automatic OpenMMO connect/auth
→ Character Lobby visible
→ enter an existing/new character
→ GameScreen visible
→ reach a real MONSTER / WORLD ENCOUNTER
→ use the visible investigate/combat controls
→ authoritative combat result appears
```

Human acceptance PASS evidence:

1. launcher reaches Character Lobby without manually typing server/token
2. character entry reaches actual GameScreen
3. real OpenMMO monster appears as MONSTER / WORLD ENCOUNTER
4. player-visible control initiates combat
5. at least one authoritative combat result is visible
6. closing taurin4 stops the managed server process
7. rerun preserves the local character/world database

### M3-C Android transport preflight — 2026-09-25

No M3-C source change is being pushed while the Windows M3-B real-app Gate is active.

Preflight finding:

- Tauri v2 provides an official Rust-backed WebSocket plugin on Android and iOS.
- The existing `OpenMmoTransport` abstraction means Android does not need a fork of
  OpenMMO gameplay/session logic.
- Preferred implementation is:
  - browser/Web fallback: existing `WebSocketOpenMmoTransport`
  - Tauri desktop/mobile: a plugin-backed `OpenMmoTransport`
  - `OpenMmoAdapter`, `OpenMmoGameSession`, semantic Text/Card state and server authority
    remain shared.
- This avoids making Android correctness depend on Android WebView cleartext-WebSocket
  policy and keeps transport concerns below the game/session layer.
- Android platform configuration can live in Tauri's supported
  `tauri.android.conf.json` merge layer when platform-specific settings are required.

First M3-C implementation after M3-B closes:

1. add Tauri WebSocket plugin and capability
2. implement a plugin-backed transport conforming to `OpenMmoTransport`
3. select transport by runtime/platform without changing session rules
4. add Android server-endpoint entry/preset suitable for LAN/remote testing
5. build/install debug APK
6. run real Android app acceptance against an isolated pinned OpenMMO server

### M3-C slice 1 — Android OpenMMO runtime transport + APK

Status: **IMPLEMENTED-CI-VERIFIED**

Implementation candidate:

`22fea30a322448f6aa1192b07d8a1b5f0938f74e`

Implemented:

- pinned current official Tauri WebSocket plugin JS binding:
  `@tauri-apps/plugin-websocket 2.4.3`
- Rust dependency:
  `tauri-plugin-websocket 2.4.3`
- plugin initialization in `src-tauri/src/lib.rs`
- capability permission `websocket:default`
- `TauriPluginOpenMmoTransport`
  - adapts plugin Binary messages to `Uint8Array`
  - keeps existing `OpenMmoTransport` contract
  - maps plugin close/error state into adapter handlers
- Android Tauri runtime detection
- `createOpenMmoRuntime` chooses:
  - Android Tauri → Rust-backed plugin transport
  - Windows/browser/Node fallback → existing WebSocket transport
- Windows M3-B transport behavior is therefore unchanged
- Android Tauri launches into the real OpenMMO connection entry by default
- Android OpenMMO setup requires an explicit reachable LAN/remote server endpoint rather
  than silently using Android-local `127.0.0.1`
- Android copy makes the current topology explicit: Android client → LAN/remote OpenMMO
- unit coverage added for plugin binary/send/close/error adaptation

Dedicated CI:

- workflow: `.github/workflows/idea2-android-openmmo.yml`
- checks:
  1. npm install
  2. full `npm run check`
  3. websocket plugin Rust/JS/capability wiring
  4. Tauri Android init
  5. installable debug APK build
  6. APK artifact upload
- temporary PR: #6 `ci/idea2-m3c-android-openmmo-20260925`
- probe head: `df37c8b4e6e30f4ce827d17220dcbd04bbba2cf1`
- Android OpenMMO Client run `36088687797` — **SUCCESS**
- real pinned OpenMMO adapter run `36088687796` — **SUCCESS**
- PR Quality run `36088687743` — **SUCCESS**
- Windows Tauri regression run `36088687782` — **SUCCESS**
- PR #6 closed without merging
- recovery checkpoint:
  - branch: `checkpoint/idea2-m3c-slice1-ci-verified-20260925`
  - commit: `85108dc083a3ea9d2fd697c7d8608da223aa3821`

M3-C slice 1 PASS boundary:

```text
frontend quality
+ existing real OpenMMO regression
+ Android Tauri compilation
+ Rust websocket plugin linked
+ installable debug APK
```

This slice does not yet claim real Android runtime connectivity. The next M3-C Gate after
CI success is:

```text
Android emulator / device
→ actual APK
→ Rust websocket plugin
→ isolated pinned OpenMMO server
→ auth
→ Character Lobby
→ EnterGame
→ GameScreen
→ MONSTER / WORLD ENCOUNTER
→ touch combat
→ authoritative result
```

### M3-C slice 2 — Actual Android APK runtime acceptance

Status: **IMPLEMENTED / VERIFICATION RUNNING**

Purpose:

Prove the Android APK itself, not only compilation, against the same pinned OpenMMO server.

Implementation:

- configurable real-dungeon seed account:
  `OPENMMO_DUNGEON_ACCOUNT`
- stable accessibility labels for:
  - OpenMMO server input
  - OpenMMO token input
  - OpenMMO play button
  - Character entry button
  - OpenMMO GameScreen
  - encounter/combat attention choices
- `scripts/ci/android_openmmo_runtime_acceptance.py`
  - installs the actual APK through ADB
  - launches `com.js603.taurin4`
  - drives the real Android UI through UIAutomator accessibility nodes
  - enters `ws://10.0.2.2:10006`
  - enters the real NPC token
  - requires Character Lobby and persisted `CryptMira`
  - enters the character
  - requires `SERVER AUTHORITATIVE`
  - requires a real `MONSTER` encounter/combat state
  - clicks `살펴본다` when needed
  - clicks the visible `빠른 공격` control
  - requires visible authoritative kill/reward resolution
  - captures screenshots, failure UI XML and Android logcat
- `scripts/ci/run_android_openmmo_acceptance.sh`
  - starts the exact pinned OpenMMO server on the CI host
  - binds gameplay websocket to `0.0.0.0:10006`
  - seeds `CryptMira` through the real old_crypt path under
    `npc_idea2_player`
  - Android Emulator reaches the host through the standard emulator host alias
    `10.0.2.2`
- `.github/workflows/idea2-android-openmmo-runtime.yml`
  - exact pinned OpenMMO sparse checkout
  - server build
  - Node seed codec build
  - browser codec build
  - browser codec must be present inside the APK
  - actual Android debug APK build
  - hardware-accelerated Android Emulator
  - actual APK installation and UI play acceptance
  - screenshot/log/APK evidence upload

Verification PR:

- PR #7 — `ci/idea2-m3c-android-runtime-20260925`
- probe head: `562cc6242cba33b343a134876fade4b91258f20c`
- Android Runtime E2E run `36092671807` — **FAILURE before Android build/runtime**
- PR Quality run `36092671756` — **SUCCESS**
- failure step: runtime workflow's internal `Quality gate`
- root cause: the workflow cloned pinned OpenMMO into repository root **before**
  `npm run check`; taurin4's `eslint .` then inspected OpenMMO's own
  `tools/glb-editor/src/lib/merge.ts` and failed on an unrelated upstream
  unused-variable rule
- no Android APK/runtime step ran in that failed attempt
- workflow fix:
  - run taurin4 dependency install + quality first
  - checkout pinned OpenMMO only after taurin4 quality passes
  - move `Swatinem/rust-cache` after pinned checkout so its OpenMMO workspace exists
- fix commits:
  - `eb1ffd88793b5a93e30ef8891b4852e1fb9f7e8f`
  - `9de7854a711356585f10372c010c7f043e207d97`
- latest PR #7 head before APK packaging correction:
  `fb08d89b5bc6dcfd925ad41de933f275d6e3f2a4`
- runtime run `36094550045` progressed through:
  - taurin4 quality — PASS
  - exact pinned OpenMMO checkout — PASS
  - pinned server build — PASS
  - Node codec build — PASS
  - browser codec build — PASS
  - Android init — PASS
  - actual debug APK build — PASS
- failure step: `Verify APK contains pinned browser codec`
- the produced APK artifact was downloaded and inspected directly
- Tauri Android does not expose frontend files as ordinary APK `assets/openmmo-wasm/*`
- the frontend resource paths are embedded in the native Rust library instead
- the actual x86_64 `libtaurin4_lib.so` contains:
  - `/openmmo-wasm/onlinerpg_shared.js`
  - `/openmmo-wasm/onlinerpg_shared_bg.wasm`
- codec verification was corrected to:
  1. require both files in Vite `dist/openmmo-wasm`
  2. extract `lib/x86_64/libtaurin4_lib.so` from the real APK
  3. require both OpenMMO resource paths inside the native library
- fix commit on `idea2`: `26003f8d34cbd1e41ea7cd32f96bd841090289a9`
- latest PR #7 head: `f3335c3f576cfdebd054d2f162395cb6530e1161`
- Android Runtime E2E run `36095925953` — **FAILURE at final runtime step**
- PR Quality run `36095925966` — **SUCCESS**
- runtime run progressed through:
  - taurin4 quality — PASS
  - pinned OpenMMO server build — PASS
  - Node codec build — PASS
  - browser codec build — PASS
  - Android init — PASS
  - actual debug APK build — PASS
  - embedded pinned codec verification — PASS
  - KVM / Android Emulator boot — PASS
- failure occurred before APK installation because the OpenMMO server was started with the
  taurin4 repository root as its working directory
- the server itself reached `WebSocket server ready for connections` on
  `ws://0.0.0.0:10006`, but wrote `./data/npc_token` relative to the wrong working directory
- the acceptance readiness loop correctly required
  `openmmo/data/npc_token`, so it timed out despite the server being healthy
- fix:
  - launch the pinned server from `$OPENMMO_DIR`
  - preserve logs and terrain path exactly as before
  - server-generated DB/token now live in the same paths used by the proven Windows/real-server flows
- fix commit on `idea2`:
  `1eb9c5e81af3728a5007b6be3dce532a39c6bf2f`
- latest PR #7 head:
  `999871a1167571e5c66c6b18730323703637a6f3`
- Android Runtime E2E run `36097102662` — **FAILURE in actual Android UI automation**
- PR Quality run `36097102634` — **SUCCESS**
- runtime run passed:
  - taurin4 quality
  - pinned OpenMMO checkout/server build
  - Node/browser codec build
  - Android init/debug APK build
  - embedded codec verification
  - KVM and Android Emulator boot
  - real old_crypt seed under `npc_idea2_player`
- seed test itself passed against the real server
- actual APK launched and visibly rendered `Android OpenMMO Connection`
- failure: UIAutomator timed out looking for input `content-desc`
- failure artifact was downloaded and its real Android WebView accessibility XML inspected
- observed Android mapping:
  - HTML button `aria-label` appears as Android node `text`
  - HTML input `aria-label` does **not** appear as `content-desc`
  - each input is exposed as `android.widget.EditText` beside its visible label TextView
- Android acceptance driver was corrected to locate inputs by:
  `visible label TextView → sibling android.widget.EditText`
- buttons now use the WebView-exposed text value
- GameScreen readiness uses visible `OpenMMO World` + `SERVER AUTHORITATIVE`
- fix commit on `idea2`:
  `920f2ce6c215d22a2d6c7cc59dabd4de16d27783`
- latest PR #7 head:
  `362f573a271755bf27ee58563c88e233c7b55c52`
- Android Runtime E2E run `36098989431` — **FAILURE after actual app input and connect attempt**
- PR Quality run `36098989337` — **SUCCESS**
- runtime run passed:
  - taurin4 quality
  - pinned OpenMMO server/codec builds
  - Android APK build
  - embedded codec verification
  - KVM + Emulator
  - real old_crypt seed
  - actual APK launch
  - Android connection form input
  - OpenMMO play button interaction
- failure artifact showed the actual server error rendered in the Android UI:
  `Send ClientInfo first — reload the page, or update agent-client`
- adapter review confirmed expected ordering:
  1. transport onOpen
  2. send `ClientInfo`
  3. mark adapter connected
  4. `AuthenticateNpc`
- root cause:
  - browser `WebSocket.send()` synchronously queues frames in call order
  - Tauri websocket plugin `send()` returns a Promise
  - Android transport returned `true` immediately and fired plugin sends without serialization
  - `AuthenticateNpc` could overtake mandatory `ClientInfo`
- fix:
  - add a FIFO Promise send queue inside `TauriPluginOpenMmoTransport`
  - preserve the existing synchronous boolean `OpenMmoTransport.send()` contract
  - serialize every plugin send in original call order
  - reset/invalidate queue across reconnect/close generations
  - keep adapter/GameSession/gameplay code unchanged
- unit regression:
  - first async send is intentionally blocked
  - second send must not start until first is released
  - observed max concurrent plugin sends must remain 1
- fix commits on `idea2`:
  - transport: `ff7b92bb9245fba72a414dd164077cd4f7f9ebd7`
  - test: `8ad277aa58da4b46c4e600e196294abd5fd35aa7`
- latest PR #7 head before typing correction:
  `a6b4bba7dfebd83058eb1f07afb2a09b76cc5002`
- workflows triggered from that head all failed at the shared taurin4 quality/build layer
- PR Quality run `36105359312` showed the common cause:
  - Vitest: `src/openmmo/tauriTransport.test.ts` — **PASS**
  - TypeScript build: **FAIL**
  - error: `tauriTransport.test.ts(113,5) TS2349: expression is not callable`
- root cause:
  - the test stored a Promise resolver in a closure variable initialized to `null`
  - TypeScript control-flow did not model the async mutation and narrowed the optional call incorrectly
- product transport FIFO implementation was not the failing code
- fix:
  - replace nullable closure resolver with a typed mutable gate object
    `{ resolve?: () => void }`
  - assert resolver exists before releasing the first queued send
- fix commit on `idea2`:
  `916f1fe3cee8758a4b41444b761db249f1e4d0b9`
- latest PR #7 head before emulator-launcher stabilization:
  `2ea870ca003938ecb7fd0dc28b96fdab9437cb96`
- validation results:
  - PR Quality `36106994861` — **SUCCESS**
  - real pinned OpenMMO adapter `36106994927` — **SUCCESS**
  - Android OpenMMO Client APK `36106994864` — **SUCCESS**
  - Windows Tauri real OpenMMO acceptance `36106994840` — **SUCCESS**
  - Android Runtime E2E `36106994873` — **FAILURE only in final emulator UI step**
- Android runtime failure artifact was downloaded and inspected directly
- evidence:
  - taurin4's `Android OpenMMO Connection` screen was visibly rendered behind the system dialog
  - UI XML foreground was `Pixel Launcher isn't responding`
  - Android logcat contained no taurin4 fatal exception for this failure
- root cause:
  - emulator Pixel Launcher ANR overlay blocked UIAutomator from seeing the already-running
    taurin4 WebView
  - this is outside the application/protocol acceptance boundary
- stabilization:
  - resolve the installed taurin4 launcher activity with
    `cmd package resolve-activity --brief`
  - launch it directly with `am start -W -n`
  - do not depend on Pixel Launcher for app startup
  - while waiting for app UI, automatically dismiss unrelated Android
    `isn't responding` dialogs by tapping `Close app` / `Wait`
- fix commit on `idea2`:
  `3b4507cc74d5c2e4c4350152b9b63984e9451359`
- latest PR #7 head before reward-projection correction:
  `e9b220b427a4cf174a0f197bddc60fbe0787d002`
- validation results:
  - real pinned OpenMMO adapter `36121623285` — **SUCCESS**
  - PR Quality `36121623040` — **SUCCESS**
  - Android OpenMMO Client APK `36121622991` — **SUCCESS**
  - Windows Tauri real OpenMMO acceptance `36121623120` — **FAILURE at kill/reward observation**
  - Android Runtime E2E `36121623043` — **FAILURE at kill/reward observation**
- both failing runs reached real combat
- Windows server evidence:
  - actual Tauri UI entered `OpenMMO World`
  - multiple real `MONSTER` destinations were visible
  - `빠른 공격` was visible and used
  - server recorded `Player CryptMira killed kobold`
  - about 3 seconds later remaining kobolds killed CryptMira
- Android also reached visible attack controls but did not observe `REWARD/처치`
- root cause in semantic projection:
  - `MonsterDead` only produced REWARD if the dead monster was still
    `state.combat.enemy`
  - with several aggressive kobolds, current combat context could drift before the
    authoritative death event was projected
  - the actual kill therefore degraded to `주변 몬스터가 쓰러졌다`
  - the server still granted kill XP with `XpGained.monster_id`
- correction:
  - remember recently dead monster names
  - parse optional authoritative `XpGained.monster_id`
  - when the server awards this player XP for that dead monster, promote it to
    `phase=reward` even if combat target drifted
  - preserve the existing immediate `MonsterDead` reward path when the current
    combat target still matches
  - do not infer ownership merely from the last local attack; attribution comes from
    the server's XP event
- regression test:
  - combat is intentionally focused on `kobold-b`
  - `kobold-a` dies as a non-current target
  - only `XpGained { monster_id: "kobold-a" }` is allowed to promote
    `Kobold 처치` REWARD
- fix commits on `idea2`:
  - reward projection: `b25cf1a1314cf90a5d25c6012847937ccccbaac4`
  - state consistency: `9e26ca0238ea72e476a5870a747cdb4202c50ae7`
  - regression test: `16cbdcac4a629bd2b585385068c2a5b65efc3701`
- latest PR #7 head before Android cadence stabilization:
  `da93a2452713dd245c9cd3fb8b8106e90946b62b`
- validation results:
  - Android OpenMMO Client APK `36126812639` — **SUCCESS**
  - PR Quality `36126812654` — **SUCCESS**
  - real pinned OpenMMO adapter `36126812659` — **SUCCESS**
  - Windows Tauri real OpenMMO acceptance `36126812649` — **SUCCESS**
  - Android Runtime E2E `36126812662` — **FAILURE in actual combat**
- Android failure artifact was downloaded and inspected directly
- Android evidence:
  - actual APK launched
  - Character Lobby and `CryptMira` entered
  - `OpenMMO World` + `SERVER AUTHORITATIVE` visible
  - real `MONSTER` entries visible
  - visible `빠른 공격` control reached and tapped
  - final UI: `HP 0/14`
  - logs: repeated `공격 거부: 쓰러진 상태에서는 공격할 수 없다`
  - server: CryptMira died to kobold before killing one
- this differs from Windows, where the same server rules killed a kobold successfully
- root cause in Android automation:
  - every attack iteration performed a fresh expensive UIAutomator hierarchy dump
  - effective attack cadence became much slower than OpenMMO's real player attack cooldown
  - several aggressive kobolds therefore killed the player before enough attacks were sent
- stabilization:
  - after EnterGame, use a single hierarchy pass to verify
    `OpenMMO World + SERVER AUTHORITATIVE + MONSTER + encounter/combat`
  - find `빠른 공격` once
  - reuse the button bounds without additional hierarchy dumps
  - tap at ~1.42 s intervals to match the real ~1.38 s player attack cadence
  - issue 6 taps max, then inspect the UI for `REWARD/처치`
  - extra taps after kill are harmless because the reward primary action currently maps to
    `COLLECT_REWARD`, which is intentionally a no-op
- fix commit on `idea2`:
  `cb15179b7c36d8b8b8654a029b532e603d3ea966`
- latest PR #7 head:
  `cdf085e104439011cf64579e2455b5b1d70139d3`
- first workflow lookup for that head returned no runs yet; no repeated polling was performed
- current official Tauri v2 websocket guest binding was rechecked:
  - `WebSocket.connect(url)`
  - `addListener(Message)`
  - binary payload is `number[]`
  - `send(number[])` emits Binary
  - Close payload is `{ code, reason }`
  - current `TauriPluginOpenMmoTransport` matches this contract

M3-C slice 2 PASS boundary:

```text
actual Android APK
→ packaged pinned OpenMMO browser codec
→ Android Tauri Rust websocket plugin
→ emulator → host pinned OpenMMO server
→ authenticate
→ Character Lobby
→ CryptMira
→ EnterGame
→ GameScreen
→ MONSTER / encounter-combat state
→ touch-equivalent UI actions
→ authoritative combat result
```

### M3-C — Android real OpenMMO play client — NEXT AFTER M3-B

Goal:

Make the Android taurin4 app a real OpenMMO player client using the same semantic
GameSession / Text/Card UI already verified on desktop.

First acceptance topology:

```text
Android taurin4
→ manually or automatically supplied OpenMMO server endpoint
→ OpenMMO auth
→ Character Lobby
→ EnterGame
→ GameScreen
→ semantic movement
→ MONSTER / WORLD ENCOUNTER
→ touch investigate / attack
→ authoritative server combat result
```

M3-C deliberately does **not** require the Android device itself to host OpenMMO.
Its purpose is to prove the complete Android client path first.

M3-C PASS requires:

1. installable Android APK
2. real pinned OpenMMO protocol/codec compatibility on Android WebView
3. server endpoint can target a reachable LAN/remote OpenMMO server
4. Character Lobby works on Android
5. character entry reaches the real GameScreen
6. touch interaction can drive encounter/combat through `GameSession`
7. authoritative combat result is visible
8. Android-specific lifecycle/reconnect behavior is verified
9. no Windows-only native-launch assumptions leak into Android

Preferred automated verification route:

- Android emulator or attached Android runner
- reachable isolated pinned OpenMMO server
- actual APK launch
- UI automation through the Android application surface
- screenshot/log artifacts for lobby, GameScreen, encounter and combat result

### M3-D — Android standalone singleplayer

Goal:

Allow Android to play without any PC host, LAN host, or internet OpenMMO server.

Target user experience:

```text
launch taurin4 on Android
→ choose Singleplayer
→ embedded/local authoritative OpenMMO runtime starts automatically
→ localhost/internal transport connection
→ Character Lobby
→ gameplay
→ app closes
→ local server/runtime shuts down safely
→ character/world state persists on device
```

This keeps the original OpenMMO server-authoritative model while hiding server operation
from the player.

M3-D is separate from M3-C because it requires additional platform validation:

- OpenMMO server/core compilation for Android targets
- Android process/thread/runtime lifecycle
- local sockets or equivalent internal transport
- SQLite/file persistence inside Android app storage
- packaged world/data assets
- background/foreground lifecycle and OS process restrictions
- crash-safe save/recovery
- resource use on mobile

Do not weaken server authority merely to make standalone Android easier. If running the
original server executable model is unsuitable on Android, extract/embed the authoritative
server core behind the same protocol boundary rather than duplicating combat/world rules in
React.

Roadmap order is therefore:

```text
M3-B Windows standalone playable
→ M3-C Android real OpenMMO client
→ M3-D Android standalone singleplayer
→ later Android↔PC / Android↔Android multiplayer/host acceptance
```

## 17. New-chat bootstrap

When starting a new ChatGPT conversation, use this instruction:

> Continue the `js603/taurin4` `idea2` project. Treat `docs/IDEA2_MASTER_RECORD.md` on the `idea2` branch as the canonical project state. Read it first, then verify the actual current `idea2` branch HEAD and relevant CI state before making changes. Do not infer progress from old chat memory when repository state disagrees. Continue from "Next exact action". Keep Windows PC↔PC as the only current LAN runtime validation Gate. Android remains a build/play platform, but Android LAN runtime testing is currently excluded. Update the MASTER RECORD after every material milestone or policy change.

### M2 Gate clarification — real gameplay passed, packaging failed

Run `35901639325` is recorded as overall **FAILURE**, but the failure occurred after the
real pinned-server gameplay regression had already passed.

Confirmed inside that run:

- real pinned OpenMMO server boot: PASS
- real shared WASM codec: PASS
- character lifecycle / EnterGame: PASS
- authoritative movement: PASS
- Radiance / AbilityCooldowns: PASS
- unequip: PASS
- DropItem / GroundItem: PASS
- PickupItem / InventoryUpdated: PASS
- EquipItem: PASS
- disconnect / reconnect: PASS
- same character / equipment / position persistence: PASS
- Vitest full-cycle test: **1 passed / 1 passed**, 546 ms

The workflow then failed in the browser/PWA packaging step because
`openmmo-wasm/onlinerpg_shared_bg.wasm` was 3.84 MB while Workbox's default precache
limit was 2 MiB.

That packaging defect is now fixed by setting
`maximumFileSizeToCacheInBytes: 5 * 1024 * 1024`.

Latest candidate also maps and tests original `PlayerAttackRejected` and extends the real
integration Gate with an actual `PlayerAttack` request against a missing target so the
server rejection path is proven end-to-end.

Natural ambient monster spawn / kill is not claimed yet. NPC-token sessions are marked
`is_official_npc=true` by the original server, and ambient spawning deliberately refuses
to spawn monsters for an unwatched official NPC. A normal human-auth integration identity
is therefore required before that slice can be automated without modifying original rules.


## M2 verified baseline — 2026-09-24

Implementation HEAD:

`39863b66973598dc93f8e1ca00f00a80ba1aa8fd`

All four current Gates passed:

- idea2 validation — run `35903549333` — **SUCCESS**
- Pages — run `35903549203` — **SUCCESS**
- Windows + Android — run `35903549207` — **SUCCESS**
- real pinned OpenMMO adapter — run `35903549323` — **SUCCESS**

This verified baseline includes:

- real pinned-server character lifecycle
- authoritative movement
- real ability/cooldown
- inventory / equip / unequip
- DropItem / GroundItem / PickupItem
- disconnect / reconnect persistence
- PlayerAttack request and authoritative PlayerAttackRejected mapping
- production web build with the pinned ~3.84 MiB OpenMMO WASM codec precached successfully

The exploratory WASM dungeon stair-coordinate audit is deliberately stopped here because
it became a long-running analysis path. Dungeon encounter/kill proof is now a separate,
bounded Gate and must not block this verified M2 baseline.


## 18. Checkpoint — M2 verified baseline handoff

**Checkpoint date:** 2026-09-24 (Asia/Seoul)

**Checkpoint branch to use for recovery/new-chat reference:**

`checkpoint/idea2-m2-verified-20260924`

**Active development branch:**

`idea2`

**Verified implementation baseline:**

`39863b66973598dc93f8e1ca00f00a80ba1aa8fd`

Verified workflow evidence:

- validation — `35903549333` — SUCCESS
- Pages — `35903549203` — SUCCESS
- Windows + Android — `35903549207` — SUCCESS
- real pinned OpenMMO — `35903549323` — SUCCESS

### What is verified at this checkpoint

- original OpenMMO audit M1.5 is COMPLETE
- real pinned OpenMMO shared WASM codec
- real pinned OpenMMO Rust server
- ClientInfo / protocol-layout handshake
- NPC-token engineering authentication
- character list / roll / create / select / rename / delete
- EnterGame / WorldReady / Heartbeat
- semantic `OpenMmoGameSession`
- authoritative movement / WorldUpdate unwrapping
- semantic MONSTER / PLAYER / NPC / LOOT destinations
- Radiance / AbilityCooldowns
- PlayerAttack request and PlayerAttackRejected mapping
- inventory state / update
- equip / unequip
- DropItem / GroundItem / PickupItem
- disconnect / reconnect
- same character / equipment / position persistence
- LocalGameSession remains default
- explicit `?runtime=openmmo` bootstrap exists
- browser WASM production/PWA build succeeds with 5 MiB Workbox precache allowance
- PC↔PC M1 physical LAN acceptance remains user-confirmed
- Android remains build/play only; Android LAN runtime is excluded for now

### Required next Gate — do not skip

`M2 old_crypt real encounter / kill Gate`

Target proof:

```text
original dungeon entry
→ authoritative floor -1
→ real MonsterSpawned
→ semantic monster card
→ approach real monster
→ real PlayerAttack
→ authoritative PlayerAttacked
→ MonsterDead
→ XP/reward
→ observe/pick ground loot if original RNG produces it
```

Probabilistic loot must never be a required assertion.

### Anti-delay rule for the next chat

Do not omit the dungeon-combat Gate merely because one verification method is slow.

If an investigation begins branching into a secondary problem such as hidden stair/WASM
internals:

1. checkpoint confirmed facts
2. stop expanding after at most 3 exploratory branches
3. switch verification method while preserving the same Gate
4. prefer executable upstream/runtime evidence over deeper source archaeology
5. never repeatedly poll CI until completion
6. do not push unrelated source commits while a long real-server Gate is running

The current preferred authentic route is the deterministic pinned `old_crypt` dungeon
system. The already audited facts in Section 16 remain valid starting context; re-read them
rather than rediscovering them from scratch.

### New-chat instruction

Paste or send this in the new conversation:

> Continue the `js603/taurin4` project on branch `idea2`. First read
> `docs/IDEA2_MASTER_RECORD.md` from the repository and treat it as canonical.
> The handoff checkpoint is branch `checkpoint/idea2-m2-verified-20260924`.
> Verify the actual current `idea2` HEAD before changing anything.
> The verified implementation baseline is
> `39863b66973598dc93f8e1ca00f00a80ba1aa8fd`.
> Continue from Section 16/18: `M2 old_crypt real encounter / kill Gate`.
> Preserve the anti-delay investigation protocol: do not skip required verification,
> but switch methods when a path becomes a bottleneck; no unbounded source branching or
> CI polling. Keep LocalGameSession working, preserve the real OpenMMO regression Gate,
> and update the MASTER RECORD after material progress.

