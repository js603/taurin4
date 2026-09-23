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
- `OpenMmoGameSession` semantic mapper: implemented
- Text/Card character lifecycle UI: implemented
- explicit app bootstrap: implemented, current validation pending
- movement mapping: not yet implemented
- combat translation: initial attack/damage/death mapping implemented, deeper ability/reaction mapping pending
- loot translation: initial GroundItem semantic event implemented, inventory UI/update mapping pending
- final local/LAN player identity replacement: not yet implemented

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

The normal app intentionally still defaults to LocalGameSession.

## Phase 4 — explicit real app bootstrap

Implemented candidate:

```text
taurin4 launch
  ├─ default → LocalGameSession
  └─ ?runtime=openmmo
       ↓
     OpenMmoBootstrap
       ↓
     browser WASM codec load
       ↓
     real OpenMMO WebSocket
       ↓
     temporary NPC-token M2 authentication
       ↓
     Text/Card Character Lobby
       ↓
     EnterGame
       ↓
     OpenMmoGameSession
       ↓
     same GameScreen
```

Files:

- `src/features/game/ui/OpenMmoBootstrap.tsx`
- `src/openmmo/browserCodec.ts`
- `src/app/runtimeMode.ts`
- `scripts/prepare-openmmo-codec.mjs`

Local codec preparation deliberately uses a separate OpenMMO checkout:

```powershell
$env:OPENMMO_SOURCE_DIR = "G:\path\to\OpenMMO"
npm run openmmo:codec
```

The script refuses any OpenMMO checkout whose HEAD is not exactly:

```text
950e081c178d920c10c51f2d31f60c1b3383c925
```

Generated files go to `public/openmmo-wasm/` and are gitignored.

Development bootstrap URL:

```text
?runtime=openmmo
```

Default fields:

- server: `ws://127.0.0.1:10006`
- codec: `<BASE_URL>/openmmo-wasm/onlinerpg_shared.js`
- account: `npc_idea2_player`
- NPC token: entered manually and never persisted

NPC-token authentication is still an M2 engineering path, not the final player identity policy.


## Phase 5 — authoritative movement mapping

Candidate implementation:

```text
GameSession MOVE_TO
      ↓
OpenMmoGameSession
      ↓
OpenMmoAdapter.sendMove
      ↓
original PlayerMove
      ↓
real OpenMMO server authority
      ↓
PlayerMoved / PlayerTeleported
      ↓
GameState.player.position
```

Important rule:

idea2 does **not** update the visible authoritative position when it sends the movement
request. Position changes only when the original server sends `PlayerMoved` or
`PlayerTeleported`.

Mapped movement state:

- x / y / z
- rotation
- floor level
- sprinting

The local deterministic M0 backend ignores the new `MOVE_TO` command so the common
GameSession contract stays backward-compatible.

The real OpenMMO integration test has been extended to:

1. EnterGame
2. read the initial position from JoinSuccess
3. issue a small `MOVE_TO`
4. wait for the real pinned server's movement update
5. verify that OpenMmoGameSession changes position from that authoritative response

Candidate HEAD: `8536ff86487c003826a9c6bf996f50eba10223f1`.

At the time this section was written, the new validation/integration run had started but
had not yet been declared successful.
