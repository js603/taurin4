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
- Last verified implementation HEAD: `dcdd42b927cc4b0c4a80284cdc25347575c383c0`
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

### M1.5 — OpenMMO Original Runtime & Flow Audit — IN PROGRESS

This is a formal verification milestone.

Verified so far:

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

### M2 — taurin4 + Real OpenMMO Backend — STARTED

Goal: complete one actual OpenMMO gameplay cycle through our taurin4 client.

Phase 1 implementation is now present:

- `src/openmmo/types.ts`
- `src/openmmo/codec.ts`
- `src/openmmo/transport.ts`
- `src/openmmo/adapter.ts`
- `src/openmmo/adapter.test.ts`
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

This is currently a tested orchestration layer using an injected codec/transport.
It is **not yet proof of taurin4 talking to the real OpenMMO server**. The next M2 Gate
must inject the real pinned shared WASM codec and connect to the real pinned server.

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

---

## 16. Next exact action

**M1.5 final Gate + M2 real-codec integration**

M1.5 gameplay-system workflow has been launched and must be checked once on the next
verification pass. Do not poll it repeatedly.

In parallel, M2 Phase 1 is implemented.

Next implementation order:

1. confirm the M1.5 original gameplay-system Gate result once
2. if successful, mark M1.5 COMPLETE
3. build/package the pinned OpenMMO shared WASM codec as an integration dependency
4. inject that real codec into `OpenMmoAdapter`
5. start the real pinned OpenMMO server in an isolated integration environment
6. connect taurin4 adapter through binary WebSocket
7. prove ClientInfo → NPC audit auth → character list → EnterGame → WorldReady → Heartbeat
8. only after that real path passes, implement `OpenMmoGameSession` semantic world mapping
9. then wire Text/Card character select/create UI
10. continue with movement/combat/loot/inventory translation

Do not claim M2 runtime integration success while the adapter is still using only mock codec/transport tests.

---

## 17. New-chat bootstrap

When starting a new ChatGPT conversation, use this instruction:

> Continue the `js603/taurin4` `idea2` project. Treat `docs/IDEA2_MASTER_RECORD.md` on the `idea2` branch as the canonical project state. Read it first, then verify the actual current `idea2` branch HEAD and relevant CI state before making changes. Do not infer progress from old chat memory when repository state disagrees. Continue from "Next exact action". Keep Windows PC↔PC as the only current LAN runtime validation Gate. Android remains a build/play platform, but Android LAN runtime testing is currently excluded. Update the MASTER RECORD after every material milestone or policy change.