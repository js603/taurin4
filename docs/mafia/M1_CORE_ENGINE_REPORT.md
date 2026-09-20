# M1 Core Engine Report

Branch: `submain`  
Scope: Core only. UI was intentionally not modified.

## Source of Truth

Implementation follows the user-provided **Mafia Game Specification v1**.

Architecture:

```text
Player Input
→ GameAction
→ Action Validator
→ Game Engine
→ GameState
→ PlayerView Builder
→ Client / Bot
```

## Implemented

### GameState / PlayerState
- authoritative phase/day/night/revision
- player role/alignment/alive/ready/connected/death state
- night actions
- nominations
- day votes
- vote result / pending execution
- private detective result history
- doctor previous protection memory
- public events
- winner
- replay log

### State Machine
- LOBBY
- ROLE_ASSIGNMENT
- ROLE_REVEAL
- NIGHT_START
- NIGHT_ACTION
- NIGHT_RESOLVE
- WIN_CHECK
- DAWN
- DAY_DISCUSSION
- NOMINATION
- DAY_VOTE
- VOTE_RESULT
- EXECUTION
- GAME_OVER

Illegal phase transitions throw.

### Action Validator
Validates:
- current phase
- known/connected player
- alive/dead permission
- role permission
- legal target
- host-only actions
- selected-before-confirmed
- duplicate confirmation
- game-over lock

### Role Engine
v1 base composition:
- Mafia 2
- Detective 1
- Doctor 1
- Citizen 4

Only the fully specified 8-player composition is enabled in M1.
The specification says minimum 5 and recommended 7–10, but does not define the role distribution for those counts.
M1 therefore returns `UNSUPPORTED_PLAYER_COUNT` instead of inventing a rule.

### Night Resolver
- Mafia cannot attack Mafia.
- Each Mafia selects and confirms.
- unique plurality determines the attack.
- first tie -> Mafia-only reselect.
- second tie -> attack fails.
- Doctor may self-protect.
- Doctor cannot protect the same target on consecutive nights.
- Detective cannot self-investigate.
- Detective gets only MAFIA / NOT_MAFIA privately.
- all night actions resolve together.
- protected attack produces only the public no-death result.
- death role is publicly revealed.

### Vote / Execution Resolver
- nomination precedes voting.
- only nominees or no-execution are legal choices.
- living players only.
- self-voting is legal.
- choice can change before confirmation.
- individual vote is not placed in PlayerView.
- unique top candidate is executed.
- top tie -> no execution.
- execution is separate from vote result.
- death role is publicly revealed.

### Win Resolver
- no living Mafia -> TOWN.
- living Mafia >= living Town -> MAFIA.
- Game Over blocks further actions.

### PlayerView
GameState is never returned directly.

Town cannot receive:
- hidden roles
- Mafia membership
- Mafia night choices
- Doctor target
- Detective target/result

Mafia additionally receives:
- living Mafia membership
- own target
- Mafia action completion progress

Detective additionally receives:
- own investigation history only

Doctor additionally receives:
- own previous protection target

### Bot Simulation
Bots:
- receive only PlayerView
- choose intents
- dispatch the same GameAction API as human clients
- have no kill/set-phase/set-winner bypass

Simulation asserts engine invariants after every successful Action.

## Automated Gate

Command:

```bash
npm run mafia:m1:sim
```

Fixed test seed:

```text
20260921
```

Latest verified result:

```json
{
  "status": "PASS",
  "suite": "MAFIA_M1_CORE_SIMULATION",
  "games": 1000,
  "townWins": 78,
  "mafiaWins": 922,
  "maxActions": 529,
  "maxNights": 11,
  "averageActions": 235.569,
  "seed": 20260921
}
```

All 1,000 games reached GAME_OVER without:
- exceeding 5,000 actions
- illegal bot action
- unresolved winner
- invariant violation
- replay/action count mismatch

The win distribution is **not a balance result**. Current bots are deliberately simple deterministic test agents. This Gate proves termination, permissions, transitions, and resolver integrity, not competitive balance.

## CI Gate

`.github/workflows/submain-mafia-ci.yml` now requires:

1. `npm run check`
2. `npm run mafia:m1:sim`
3. Web preview build

M1 core regression blocks the branch before UI work can be considered valid.

## UI Status

No Mafia UI file was changed as part of M1.

The existing V2 UI/application layer is still present, but it is legacy code and is **not yet wired to M1 Core**.

That integration belongs to M2 after M1 approval.
