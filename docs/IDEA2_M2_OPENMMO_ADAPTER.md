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


## Phase 6 — WorldUpdate + semantic destination layer

Candidate HEAD lineage culminates in:
`253fc4b57cb3d75412b80d4dcd2dd1b06cafe1e7`.

### Why the first movement Gate failed

The first real movement roundtrip test timed out after a successful `PlayerMove`.
The pinned OpenMMO server does not guarantee that the mover consumes a standalone
`PlayerMoved` frame in the shape idea2 initially expected.

The authoritative movement/state feed is delivered through the interest system as:

```text
WorldUpdate {
  position,
  floor_level,
  events: [
    {
      subject,
      revision,
      change,
      messages: [ ...ServerMessage ]
    }
  ]
}
```

The original browser client recursively dispatches each nested event message.

idea2 now mirrors that protocol boundary.

### Implemented

- typed `WorldUpdate` envelope
- world epoch / generation / sequence tracking
- stale-update rejection
- reset handling
- authoritative local-player position from `WorldUpdate.position`
- recursive nested message dispatch
- semantic AOI destination collection

Destination kinds:

- `monster`
- `player`
- `npc`
- `loot`

Official OpenMMO NPC/Agent sessions are distinguished with
`Player.is_official_npc`.

### Semantic travel

`TRAVEL_TO_DESTINATION` converts a semantic target into an original OpenMMO
`PlayerMove` approach request.

The client:

- never exposes raw coordinates as the primary UX
- never commits local position optimistically
- keeps the destination label in semantic travel state
- decides arrival from authoritative world position only

Approximate interaction radii in the idea2 projection:

- monster: 2.5 m
- player / NPC: 1.5 m
- loot: 0.8 m

These are UI approach radii; the server still performs the real rule/range validation.

## Phase 7 — abilities, loot, inventory and equipment

Implemented protocol boundary:

### Ability

Original ability IDs:

- `guardian_ward`
- `radiance`
- `bow_mark`
- `dagger_double_slash`
- `auscultation`

Mapped messages:

- client `UseAbility`
- server `AbilityCooldowns`
- server `AbilityRejected`

The UI displays server-provided remaining cooldowns and disables buttons while a
cooldown is active.

### Loot

Mapped messages:

- `GroundItemSpawned`
- `GroundItemAppeared`
- `GroundItemQuantityChanged`
- `GroundItemRemoved`
- client `PickupItem`

Ground items become semantic LOOT destinations. When the authoritative player position
is close enough, the destination action changes from travel to pickup.

### Inventory / equipment

Mapped messages:

- `InventoryState`
- `InventoryUpdated`
- client `EquipItem`
- client `UnequipItem`

The current Text/Card panel renders:

- equipped items
- bag items
- quantity
- enchantment level
- locked state
- active server-backed equip / unequip requests

This is still an implementation candidate until the current CI and real OpenMMO
regression workflow finish successfully.

## Remaining M2 proof gaps

Code presence is not considered runtime proof.

Still required:

1. confirm the new WorldUpdate-based movement roundtrip against the real pinned server
2. confirm at least one real ability request and server response
3. prove real ground loot → pickup → InventoryUpdated
4. prove real equip/unequip mutation
5. prove the same cycle through the explicit app bootstrap / Text-Card UI
6. prove logout → reconnect → same character state


## Current candidate verification snapshot

Implementation candidate:

`253fc4b57cb3d75412b80d4dcd2dd1b06cafe1e7`

Confirmed:

- idea2 validation — run `35898869607` — **SUCCESS**
- Pages preview — run `35898869614` — **SUCCESS**

Still running at the last deliberate status check:

- Windows + Android — run `35898869592`
- real OpenMMO adapter regression — run `35898863607`

No repeated polling is performed. The remaining Gates must be checked once at the next
verification point before promoting the candidate to the verified implementation baseline.


## Phase 8 — real gameplay and persistence cycle Gate

Latest implementation candidate:

`b57d96a37d62bd74cb0421132db08c8251cc7047`

The real pinned-server integration test no longer stops at lifecycle/movement. It now
exercises a self-contained gameplay/persistence cycle using the original starter kit.

### Server-backed scenario

```text
EnterGame
→ InventoryState
→ worn_iron_sword equipped / worn_torch in bag
→ MOVE_TO
→ authoritative WorldUpdate position
→ UseAbility(radiance)
→ AbilityCooldowns(radiance > 0)
→ UnequipItem(main_hand)
→ InventoryUpdated: sword in bag
→ DropItem(sword)
→ InventoryUpdated + GroundItemSpawned
→ semantic LOOT destination
→ PickupItem(ground instance)
→ InventoryUpdated: sword in bag
→ GroundItemRemoved
→ EquipItem(picked sword)
→ InventoryUpdated: main_hand
→ disconnect
→ reconnect same account
→ same character
→ EnterGame
→ InventoryState still has sword in main_hand
→ persisted position restored
```

### Why Radiance

Pinned server source shows Radiance has no class, target, or equipment requirement.
It only requires a live unmounted player, then sets the original server cooldown and
returns `AbilityCooldowns`. This makes it a stable real-server ability proof.

### Persistence synchronization

Pinned server disconnect flow is:

```text
connection close
→ end_account_session
→ cleanup_player_session
→ persist_and_detach_player
→ save_batch
→ unregister / remove player
```

If a reconnect races the old socket teardown, account-session replacement uses the same
session/persistence locks and persists the replaced player before the new character list
is loaded. The integration test therefore uses reconnect itself as the persistence barrier
instead of sleeping for an arbitrary amount of time.

### New protocol action

idea2 now also maps:

- client `DropItem { instance_id }`
- GameSession `DROP_ITEM`

This action is currently primarily useful to prove the real loot/pickup loop and can later
be surfaced in inventory UI when the UX policy is finalized.

### Regression workflow coverage

The real OpenMMO workflow now triggers for semantic gameplay changes under:

- `src/openmmo/**`
- `src/game/**`
- `src/features/game/ui/OpenMmo*.tsx`
- `src/features/game/ui/GameScreen.tsx`
- `src/styles.css`

This closes the earlier gap where a GameScreen semantic-type regression could pass without
starting a new real OpenMMO run.

### Verification state

The full-cycle candidate workflows were running at the last deliberate check. Code presence
is not proof; this phase becomes verified only after the real pinned-server workflow and
normal quality/platform Gates succeed.


## Full-cycle candidate Gate status

For implementation candidate
`b57d96a37d62bd74cb0421132db08c8251cc7047`:

- quality validation — run `35901639317` — **SUCCESS**
- Windows + Android — run `35901639473` — **IN PROGRESS** at last check
- Pages — run `35901639397` — **IN PROGRESS** at last check
- real pinned OpenMMO full-cycle — run `35901639325` — **IN PROGRESS** at last check

At the last deliberate inspection, the real OpenMMO job had completed checkout,
Rust/tool installation, Node setup and Rust cache setup, and was installing taurin4
dependencies. The actual full-cycle test had therefore not yet run and must not be
reported as passed.


## Phase 8 verification clarification

Real workflow `35901639325` failed only after the gameplay regression completed.

The real test itself reported:

```text
src/openmmo/real.integration.test.ts
1 test passed
full gameplay/persistence cycle passed
546 ms
```

Server logs independently showed the real sword drop and pickup transfers, disconnect,
persistence, reconnect, and re-entry.

The later failure was PWA packaging:

```text
openmmo-wasm/onlinerpg_shared_bg.wasm = 3.84 MB
Workbox default precache maximum = 2 MiB
```

idea2 now sets a 5 MiB Workbox precache cap because the pinned shared codec is an explicit
OpenMMO web runtime dependency.

The latest candidate also covers `PlayerAttackRejected` semantically and sends a real
`PlayerAttack` for an invalid monster id in the pinned-server integration test. This proves
the basic attack request/rejection wire path without inventing a monster.

A real natural encounter/kill is still intentionally separate: the automated NPC-token
identity is an official NPC in the original server, and ambient spawning is suppressed for
an official NPC when no human player is watching. That original rule will not be patched
around merely to make the test green.
