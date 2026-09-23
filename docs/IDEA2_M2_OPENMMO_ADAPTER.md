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

## M2 real-codec Gate — IMPLEMENTED / RUNNING

The real integration Gate is now implemented. It builds the exact pinned OpenMMO
shared crate as Node-target WASM, boots the exact pinned OpenMMO server with an empty
terrain directory, and runs taurin4's adapter against it through a real binary WebSocket.

Workflow: `.github/workflows/idea2-openmmo-adapter.yml`

The Gate must prove:

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

- real pinned WASM codec/server integration workflow is implemented but its current run has not yet been declared successful
- production runtime packaging of the pinned codec is not yet wired into the normal taurin4 app
- `OpenMmoGameSession` semantic state mapper is not yet implemented
- character UI is not yet wired to the adapter
- movement/combat/loot/inventory event translation is not yet implemented
- final local/LAN player identity replacement is not yet implemented

Do not call M2 complete until the taurin4 UI completes the full real OpenMMO gameplay
cycle defined in the MASTER RECORD.
