# M2 UX / Screen Contracts

Branch: `submain`  
Status: UX contract layer only. React/CSS visual UI is intentionally unchanged.

## Goal

M2 converts the deterministic M1 engine into a finite set of **screen contracts**.

The contract boundary is:

```text
Authoritative GameState
        ↓
PlayerView
        ↓
ScreenContract
        ↓
M3 Visual UI
```

M2 never reads `GameState` directly.

The implementation entry point is:

```text
src/features/mafia-classic/ux/screenContract.ts
```

and its public function is:

```ts
buildScreenContract(view: PlayerView): ScreenContract
```

The M3 UI must not recreate Mafia rules by switching directly on engine internals.
It renders the contract produced here.

---

## Screen Contract shape

Every contract defines:

- current screen identity
- engine phase
- semantic mode: ACTION / WAITING / RESULT / TERMINAL / ENGINE
- current situation
- player objective
- PlayerView fields this screen is allowed to present
- primary authoritative Actions
- secondary authoritative Actions
- forbidden authoritative Actions
- target-selection policy
- waiting state
- exit condition

The contract does **not** define:
- colors
- typography
- panel sizes
- animation
- sound
- final copywriting
- desktop/mobile layout

Those belong to M3/M4.

---

## Stable Screen Matrix

| Screen | Situation | Visible private/public information | Actions | Waiting | Exit |
|---|---|---|---|---|---|
| ROLE_REVEAL | Own secret role reveal | self role/alignment only through `self` | CONFIRM_ROLE | Other players | All role confirmations -> NIGHT 1 |
| NIGHT_CITIZEN_WAIT | Citizen at night | phase/night/public player state | none | Night roles | Night Resolver |
| NIGHT_DOCTOR | Doctor night action | previous protected target, own current target | SELECT_NIGHT_TARGET, CONFIRM_NIGHT_ACTION | Other night roles after confirm | Night Resolver |
| NIGHT_DETECTIVE | Detective night action | own investigation history, own current target | SELECT_NIGHT_TARGET, CONFIRM_NIGHT_ACTION | Other night roles after confirm | Night Resolver |
| NIGHT_MAFIA | Mafia night action | Mafia members, own target, Mafia confirmation progress | SELECT_NIGHT_TARGET, CONFIRM_NIGHT_ACTION | Other night roles after confirm | Night Resolver |
| DAWN | Public night result | public events, player public death/role state | CONFIRM_RESULT | Other living players after confirm | DAY_DISCUSSION |
| DAY_DISCUSSION | Free discussion | public events / player list | host: END_DISCUSSION | Host for non-hosts | NOMINATION |
| NOMINATION | Execution candidate nomination | candidates, own nomination, public events | NOMINATE_PLAYER; host may END_NOMINATION | Host when no action | DAY_VOTE, or WIN_CHECK if no candidate |
| DAY_VOTE | Secret execution vote | nominee list, own selected vote, aggregate completion progress | SELECT_VOTE, CONFIRM_VOTE | Other living players after confirm | VOTE_RESULT |
| VOTE_RESULT | Public final tally | tally, execution target, public events | CONFIRM_RESULT | Other living players | EXECUTION or WIN_CHECK |
| EXECUTION | Execution result | execution result, death + revealed role | CONFIRM_RESULT | Other living players | WIN_CHECK |
| DEAD_PLAYER | Spectator | public information only for the screen | none | Spectating | GAME_OVER |
| GAME_OVER | Terminal result | winner, all public roles/events | none | terminal | none |
| ENGINE_TRANSITION | Automatic Resolver phase | minimal stable context | none | Engine | next stable player phase |

LOBBY also has a minimal contract for pre-game readiness/start, but multiplayer lobby UX is not finalized until M5.

---

## Role-specific NIGHT contracts

### Citizen

```text
Situation
Night is in progress.

Objective
No night ability exists.

Allowed authoritative Action
none

Forbidden
target selection
night confirmation
nomination
vote
discussion-end control

Waiting
Other night-role Actions.
```

### Doctor

```text
Situation
Doctor night action.

Visible
self
living/public player list
doctorLastProtectedTargetId
ownNightTargetId

Primary flow
SELECT_NIGHT_TARGET
→ selection may change
→ CONFIRM_NIGHT_ACTION

Target policy
alive player including self
except previous night's protected player

After confirm
No further Action.
Wait for other night roles.
```

### Detective

```text
Situation
Detective night action.

Visible
self
players
detectiveHistory
ownNightTargetId

Primary flow
SELECT_NIGHT_TARGET
→ selection may change
→ CONFIRM_NIGHT_ACTION

Target policy
alive player except self

After confirm
No further Action.
```

### Mafia

```text
Situation
Mafia attack choice.

Visible
self
living Mafia members
ownNightTargetId
mafiaNightProgress

Primary flow
SELECT_NIGHT_TARGET
→ selection may change
→ CONFIRM_NIGHT_ACTION

Target policy
living non-Mafia only

After confirm
No further Action.
```

---

## Vote contract

The UI must be able to restore a vote after refresh/reconnect without reading GameState.

For this reason M2 added to `PlayerView`:

```ts
ownNominationTargetId
ownVoteTargetId
```

DAY_VOTE therefore supports:

```text
candidate selection
→ change candidate
→ choose no execution
→ confirm
→ WAITING
```

After confirmation, `PlayerView.availableActions` is empty.
The Screen Contract becomes WAITING automatically.

Individual votes are still not exposed to other PlayerViews.

---

## Dead Player contract

M2 found a latent core stall:

- a dead original host could still own `END_DISCUSSION`
- a dead original host could still own `END_NOMINATION`
- dead players were included in public-result acknowledgement gates

That violated the intended spectator contract and could make the game depend on a dead participant.

The core was corrected:

1. dead players cannot execute day-control Actions,
2. when the current host player dies, phase-control authority transfers to the next living player,
3. public result progression requires confirmations from living connected players only,
4. dead PlayerViews expose no authoritative gameplay Actions.

Network authority is a separate M5 concern.
This transfer only prevents the gameplay state machine from depending on a dead player.

---

## PlayerView-only rule

`screenContract.ts` is architecture-tested to ensure it:

- imports `PlayerView`,
- does not import `GameState`,
- does not import `gameState.ts`,
- does not import `engine.ts`,
- does not import React.

This preserves:

```text
GameState -> PlayerView -> ScreenContract
```

and prevents:

```text
GameState -> UI rules
```

---

## Contract consistency rules

Every generated contract is checked for:

1. contract phase equals PlayerView phase,
2. primary + secondary Actions equal `PlayerView.availableActions`,
3. no Action appears in both allowed and forbidden sets,
4. every GameAction is either allowed or forbidden,
5. no duplicate visible-field declaration,
6. a WAITING contract exposes no Action,
7. an ACTION contract cannot be actionless,
8. ENGINE_TRANSITION exposes no user Action,
9. DEAD_PLAYER exposes no user Action.

If PlayerView starts exposing an Action that M2 has not designed for, contract construction fails with:

```text
SCREEN_CONTRACT_UNEXPECTED_ACTION
```

This is intentional.

---

## Runtime simulation integration

The 1,000-game simulation now audits, after **every successful GameAction**:

```text
GameState invariants
+
PlayerView secret safety
+
ScreenContract correctness for all 8 players
```

The simulation result includes:

```text
Screen Contract Violations
```

and M2 requires that value to be zero.

---

## CI Gate

`submain` CI now runs:

```text
npm run check
npm run mafia:m1:sim
npm run mafia:m2:contracts
npm run build
```

M3 Visual UI must not begin unless all of these are green.

---

## M3 implementation rule

When M3 begins, React components should receive:

```text
PlayerView
ScreenContract
```

and render the semantic shell.

They should not duplicate rules such as:

```text
if phase === NIGHT_ACTION && role === DOCTOR ...
```

inside arbitrary components.

That decision already belongs to M2.

The expected M3 shell remains stable while the Main Stage and Action Area change:

```text
┌─────────────────────────────────────┐
│ Phase / Day / Alive status          │
├─────────┬───────────────────────────┤
│ Players │ Main Stage                │
│         │ Current event / decision  │
├─────────┴───────────────────────────┤
│ Public context / chat surface       │
├─────────────────────────────────────┤
│ Action Area from ScreenContract     │
└─────────────────────────────────────┘
```

Visual styling is deliberately not part of M2.
