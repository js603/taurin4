# idea2 M2 — OpenMMO Adapter Integration

> Canonical project state: `docs/IDEA2_MASTER_RECORD.md`
>
> Status: **STARTED — Phase 1 adapter boundary implemented**

## Goal

Make taurin4 drive the real pinned OpenMMO backend without leaking the original
wire protocol, WASM module, or WebSocket details into React gameplay code.

Target architecture:

```text
React / Text-Card UI
        ↓
GameSession
        ↓
OpenMmoGameSession
        ↓
OpenMmoAdapter
        ├─ OpenMmoCodec
        └─ OpenMmoTransport
              ↓
     binary WebSocket
              ↓
   pinned OpenMMO server
```

## Phase 1 — implemented

Files:

- `src/openmmo/types.ts`
- `src/openmmo/codec.ts`
- `src/openmmo/transport.ts`
- `src/openmmo/adapter.ts`
- `src/openmmo/adapter.test.ts`
- `src/openmmo/real.integration.test.ts`
- `.github/workflows/idea2-openmmo-adapter.yml`

Implemented lifecycle:

```text
connect
→ ClientInfo(protocol_version + layout-stamped client version)
→ AuthenticateNpc OR Authenticate
→ AuthSuccess + character list
→ RollCharacterStats
→ CreateCharacter / DeleteCharacter / RenameCharacter
→ EnterGame
→ JoinSuccess
→ WorldReady
→ GameTimeSync → Heartbeat
```

Also exposed first gameplay commands:

- ChatMessage
- PlayerAttack
- RequestRespawn

## Important boundary

`OpenMmoCodec` is an interface. taurin4 application code does not directly import
the original OpenMMO WASM package.

The production codec adapter accepts the same four original shared WASM functions:

- `protocol_version()`
- `stamp_layout_version()`
- `serialize_client_message()`
- `deserialize_server_message()`

This preserves the pinned OpenMMO protocol implementation as a replaceable boundary.

## Transport

`WebSocketOpenMmoTransport`:

- uses binary WebSocket frames
- exposes only binary bytes to the adapter
- rejects non-binary server control frames
- keeps socket lifecycle outside React
- can be replaced by a fake transport in tests

## Tests

The adapter unit test verifies:

1. `ClientInfo` is the first transmitted message.
2. protocol version comes from the injected codec.
3. layout fingerprinting comes from the injected codec.
4. NPC auth occurs only after handshake.
5. AuthSuccess updates account/character state.
6. stat roll uses the original two-phase character creation contract.
7. CreateCharacter updates the character list.
8. EnterGame waits for JoinSuccess.
9. JoinSuccess automatically sends WorldReady.
10. GameTimeSync automatically sends Heartbeat.

These tests use a fake codec/transport. They prove orchestration, not the real
MessagePack/WASM/server path.

## M2 real-codec Gate — PASS

The real integration Gate is now implemented. It builds the exact pinned OpenMMO
shared crate as Node-target WASM, boots the exact pinned OpenMMO server with an empty
terrain directory, and runs taurin4's adapter against it through a real binary WebSocket.

Workflow: `.github/workflows/idea2-openmmo-adapter.yml`

Verified by workflow run `35888983232` (**SUCCESS**):

Required proof:

```text
taurin4 OpenMmoAdapter
        ↓
real OpenMMO WASM codec
        ↓
binary WebSocket
        ↓
real pinned OpenMMO server
        ↓
ClientInfo accepted
NPC-token audit auth accepted
existing character returned
EnterGame accepted
WorldReady accepted
Heartbeat maintained
```

NPC-token auth is acceptable for the automated integration harness only. It is not the
final player identity policy.

After the real adapter path is proven:

1. map server world/player/monster messages into semantic idea2 state
2. create `OpenMmoGameSession`
3. expose character select/create in Text/Card UI
4. replace M0 fake combat/travel events one system at a time
5. preserve deterministic local `LocalGameSession` for isolated UI testing

## Not yet complete

- real pinned WASM codec/server integration workflow: **PASS**
- production runtime packaging of the pinned codec is not yet wired into the normal taurin4 app
- `OpenMmoGameSession` semantic state mapper is not yet implemented
- character UI is not yet wired to the adapter
- movement/combat/loot/inventory event translation is not yet implemented
- final local/LAN player identity replacement is not yet implemented

Do not call M2 complete until the taurin4 UI completes the full real OpenMMO gameplay
cycle defined in the MASTER RECORD.


## Phase 2 — semantic GameSession mapping

Implemented:

- `OpenMmoAdapter.subscribeMessages()`
- `OpenMmoGameSession`
- dynamic encounter support in shared `GameState`
- dynamic Attention cards for OpenMMO monsters
- semantic event mapping for:
  - JoinSuccess
  - GameTimeSync
  - ManaUpdate
  - PlayerHealthUpdate
  - MonsterSpawned
  - MonsterAttackedPlayer
  - PlayerAttacked
  - MonsterDead
  - GroundItemSpawned
  - ChatMessage
  - SystemMessage
  - PlayerDead
  - PlayerRespawned
  - XpGained

The same idea2 `GameSession` contract can now represent either deterministic local
simulation or semantic OpenMMO state.

Phase 2 is not yet wired as the default app runtime. The next step is character/lifecycle
UI and runtime bootstrap selection.


## Phase 3 — runtime/lobby bridge

Implemented:

- `src/openmmo/runtime.ts`
  - creates a production `OpenMmoAdapter + OpenMmoGameSession` pair from injected pinned WASM exports
- `GameScreen` now accepts an optional `GameSession`
  - LocalGameSession remains the default
  - OpenMmoGameSession can render through the same UI
- `OpenMmoCharacterLobby`
  - character list
  - stat roll
  - create
  - select / EnterGame
  - delete
  - rename
  - 3-slot limit matching the audited original UI

Current limitation:

The normal app bootstrap still defaults to LocalGameSession. The next step is an explicit
OpenMMO bootstrap path that loads/provides the verified pinned codec and transitions from
the character lobby into the same GameScreen.
