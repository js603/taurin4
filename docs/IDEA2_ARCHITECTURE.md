# idea2 — Floating Text MMO architecture

> Canonical project state: `docs/IDEA2_MASTER_RECORD.md`

## Goal

Build a text-first, asset-light RPG/MMO client that can eventually drive real OpenMMO
systems while remaining runnable as a normal React/Vite web application.

The target is not "ASCII-rendered 3D". The target is a semantic projection of a
server-authoritative world into cards, focused modals, critical reaction UI, and event
history.

## Fixed principles

1. **Web-first client** — gameplay UI must work without Tauri IPC.
2. **Optional/native Tauri runtime** — Tauri provides packaging, Host lifecycle, local
   storage, LAN integration, and OS integration.
3. **Server authority** — multiplayer truth belongs to the Host/server.
4. **Text-first presentation** — no mandatory dependency on character art, GLB models,
   sprite sheets, or giant world-texture packages.
5. **Attention-driven UI**:
   - ordinary event → log
   - contextual interaction → floating card
   - meaningful choice → focus card
   - immediate reaction → critical modal
6. **Compressed travel** — routine movement can be summarized while meaningful
   interruptions are expanded.
7. **Backend isolation** — React talks to `GameSession`; local simulation and
   OpenMMO-backed sessions share this boundary.
8. **Incremental migration** — prove original OpenMMO runtime first, then reproduce one
   full original gameplay cycle through taurin4 before redesigning systems.

## Current client boundary

```text
React UI
   ↓
GameSession
   ├─ LocalGameSession        ← implemented
   └─ OpenMmoGameSession      ← future
   ↓
Semantic GameEvent
   ↓
Attention presentation
```

## Current native Host boundary

```text
Tauri Windows / Android
        ↓
host_start / host_stop / host_status
        ↓
taurin4-game-server-core
        ↓
Tokio WebSocket Host
```

Shared crates:

- `crates/game-network`
- `crates/game-server-core`
- `crates/game-persistence`

The shared Host Core does not depend on Tauri.

## OpenMMO reference boundary

Reference repository:

`Julian-adv/OpenMMO`

Migration reference pin:

`950e081c178d920c10c51f2d31f60c1b3383c925`

Relevant protocol shape:

```text
OpenMMO Client
   ↓
shared Rust WASM codec
   ↓
MessagePack WebSocket
   ↓
OpenMMO Rust Server
```

The future adapter should use the shared codec/protocol contract rather than inventing
an independent interpretation of the wire format.

OpenMMO source remains external reference material during the early stages. Its
PolyForm Noncommercial 1.0.0 license must be considered before direct source
incorporation into a distributable product.

## Milestone sequence

### M0 — Floating Text Vertical Slice — COMPLETE

Implemented:

- deterministic LocalGameSession
- semantic location cards
- compressed travel
- encounter interruption
- reaction-oriented local combat slice
- reward flow
- Attention UI
- responsive Web/PWA/Tauri-compatible React UI

This is a local simulation, not real OpenMMO gameplay.

### M0.5 — Cross-platform Host Foundation — COMPLETE

Implemented:

- shared LAN bootstrap protocol
- embedded Rust WebSocket Host
- Host lifecycle controller
- Tauri Host commands
- Windows Tauri compile
- Android Tauri Debug APK compile
- responsive Host status UI

### M0.6 — Character / World Contract — FOUNDATION COMPLETE

Implemented:

- CharacterPassport schema
- WorldSave schema
- baseline validation

Still required later:

- filesystem persistence
- character import/export
- authoritative reconciliation after multiplayer sessions

### M1 — Windows PC ↔ Windows PC LAN — NEXT

Implement and verify actual LAN Client connectivity using the existing Host Core.

Initial proof may use a manual Host address.

Required flow:

```text
PC A Host
 ↓
PC B connect
 ↓
HostHello
 ↓
Hello
 ↓
ClientAccepted
 ↓
Ping/Pong
 ↓
disconnect
 ↓
reconnect
```

LAN automatic discovery comes after this proof.

Current runtime test Gate excludes Android↔Windows and Android↔Android LAN.

### M1.5 — Original OpenMMO Runtime & Flow Audit

Before writing the real adapter, execute the original game as the control/reference.

#### M1.5-A Runtime

Launch original OpenMMO Server + Client locally.

Determine minimum requirements and blockers:

- build dependencies
- authentication
- DB
- ports
- terrain
- assets
- minimum playable dataset

Avoid casually downloading the full large terrain/assets.

#### M1.5-B User journey

Actually execute:

```text
login
→ character select
→ character create
→ class/gender/stat roll/name
→ select
→ EnterGame
→ world load
```

#### M1.5-C Character lifecycle

Verify:

- create
- select
- delete
- rename
- logout
- reconnect
- persistence

#### M1.5-D Character actions

Verify through actual play:

- movement
- player/NPC presence
- monster encounter
- attack
- abilities
- loot
- inventory
- equipment
- chat
- death
- respawn
- reconnect state

#### M1.5-E Migration matrix

Classify original systems:

- KEEP
- ADAPT
- REPLACE
- DROP

Do not make broad redesigns before this matrix exists.

### M2 — taurin4 + Real OpenMMO Backend

Implement `OpenMmoGameSession` / `OpenMmoAdapter`.

First success definition:

```text
taurin4
→ character list
→ create/select character
→ real EnterGame
→ Text/Card world
→ real gameplay action
→ real encounter/combat
→ real loot/inventory
→ logout
→ reconnect
→ same durable character state
```

M2 is the first milestone where **our UI drives real OpenMMO systems**.

### M3 — Controlled Native Migration

After M2 end-to-end works, replace systems one at a time where the final design differs.

Examples:

- coordinate locomotion → semantic destination travel
- 3D presentation → Text/Card presentation
- original combat input/presentation → attention/reaction interaction
- original auth → local/LAN-friendly identity where needed
- original persistence → Character Passport approach where appropriate

### M4 — Durable Character Passport + Host World

Implement real persistence, validation, import/export, Host-authoritative updates,
disconnect/reconnect handling, and recovery.

## Runtime/platform validation

Windows:

- native compile
- gameplay
- Host
- Client
- PC↔PC LAN runtime test

Android:

- APK build
- shared Rust Host Core compile/link
- play/build foundation
- LAN runtime tests currently deferred

See `docs/IDEA2_PLATFORM_POLICY.md` for the exact Gate.

## Presentation architecture

```text
Simulation / server event
        ↓
Semantic GameEvent
        ↓
AttentionDirector
        ↓
┌─────────────┬────────────┬──────────────┬──────────────┐
│ Event Log   │ Floating   │ Focus Modal  │ Critical     │
│             │ Card       │              │ Modal        │
└─────────────┴────────────┴──────────────┴──────────────┘
```

A modal changes attention, not necessarily world simulation time.

## Documentation rule

Material architecture changes must update this file and the canonical
`docs/IDEA2_MASTER_RECORD.md`.
