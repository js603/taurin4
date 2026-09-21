# Original Mafia Chat-First Rebuild

Branch: `submain`

## Active architecture

```text
Human / Bot
   ↓
OriginalAction
   ↓
Original Action Validator
   ↓
Original Game Engine
   ↓
OriginalGameState
   ↓
OriginalPlayerView
   ↓
OriginalScreenContract
   ↓
Chat-first React UI
```

The active rule authority lives in:

```text
src/features/mafia-classic/original/
```

Legacy Doctor/Detective Mafia code remains temporarily for migration history only.

## Original rules implemented

- HONEST / MAFIA only
- Mafia count:
  - 6–7: 2
  - 8–10: 3
  - 11–13: 4
  - 14–16: 5
- Mafia partners are revealed only to Mafia at SUNRISE
- death roles remain hidden until GAME_OVER
- DAY is chat-first
- any living player may accuse another living player
- accusation keeps PUBLIC chat open for evidence and defense
- only the accuser opens the guilty vote
- accused player is excluded from their own guilty vote
- strict majority of eligible voters is required
- passed or failed guilty vote returns to DAY
- execution does not automatically start night
- any living player may propose Mafia Night
- Mafia Night requires strict majority of all living players
- PUBLIC chat closes during Mafia Night
- living Honest submits HONEST
- living Mafia submits one living player name
- no Mafia private night chat
- public count of name-bearing notes reveals surviving Mafia count
- murder requires all surviving Mafia names to match
- split names mean no murder
- zero Mafia name notes mean HONEST wins
- removing the last Mafia during DAY does not immediately reveal HONEST victory
- Mafia wins when no Honest players remain
- GAME_OVER reveals all roles and the full chat history

## Authoritative chat policy

Channels:

```text
PUBLIC
DEAD
SYSTEM
```

### Living player

During DAY_DISCUSSION / ACCUSATION:

```text
PUBLIC read/write
SYSTEM read
DEAD unavailable
```

Other gameplay phases:

```text
PUBLIC read
SYSTEM read
PUBLIC write closed
DEAD unavailable
```

### Dead player

Before GAME_OVER:

```text
PUBLIC read
SYSTEM read
DEAD read/write
PUBLIC write forbidden
```

### GAME_OVER

All players may read:

```text
PUBLIC
DEAD
SYSTEM
```

Gameplay writes are closed.

## Chat as gameplay

The DAY loop is:

```text
PUBLIC CHAT
  ↓
ACCUSE_PLAYER
  ↓
ACCUSATION CHAT
  ↓
CALL_GUILTY_VOTE
  ↓
CAST_GUILTY_VOTE
  ↓
SYSTEM RESULT
  ↓
PUBLIC CHAT resumes
```

Night is a separate proposal from DAY:

```text
PUBLIC CHAT
  ↓
PROPOSE_MAFIA_NIGHT
  ↓
CAST_NIGHT_PROPOSAL_VOTE
  ├─ fail → PUBLIC CHAT resumes
  └─ pass → MAFIA_NIGHT
                 ↓
          SUBMIT_NIGHT_NOTE
                 ↓
            SYSTEM RESULT
                 ↓
          DAY PUBLIC CHAT
```

The UI must not require Discord, KakaoTalk, voice conversation or offline intervention.

## System timeline

Important transitions are stored as SYSTEM chat entries:

- GAME_STARTED
- SUNRISE_STARTED
- DAY_STARTED
- PLAYER_ACCUSED
- GUILTY_VOTE_OPENED
- GUILTY_VOTE_PASSED / FAILED
- PLAYER_EXECUTED
- NIGHT_PROPOSED
- NIGHT_PROPOSAL_PASSED / FAILED
- NIGHT_STARTED
- NIGHT_NOTES_REVEALED
- NIGHT_MURDER / NIGHT_NO_MURDER
- GAME_WON

A player should be able to understand the complete match history from the timeline.

## Chat-first UI

Desktop:

```text
┌───────────┬───────────────────────────────┬─────────────┐
│ PLAYERS   │             CHAT              │ CONTEXT     │
│           │                               │             │
│ alive/out │ player messages               │ my card     │
│ selection │ system transition cards       │ accusation  │
│           │ vote decision cards           │ proposal    │
├───────────┴───────────────────────────────┴─────────────┤
│ CHAT COMPOSER                                           │
├─────────────────────────────────────────────────────────┤
│ CURRENT AUTHORITATIVE ACTION                            │
└─────────────────────────────────────────────────────────┘
```

Mobile:

- compact player rail
- chat consumes the main viewport
- composer remains directly below chat
- current authoritative action remains reachable without opening a separate screen
- context panel is removed from the default mobile surface

## Gate Mafia-C

Required commands:

```bash
npm run check
npm run mafia:original:test
npm run mafia:original:sim
npm run mafia:m3:ui
npm run build
```

The 1,000-game Original simulation must finish with:

```text
Completed                     1,000
Stalled                           0
Illegal Actions                   0
Invalid Transitions               0
Secret Leaks                      0
Chat Policy Violations            0
Dead -> Living Leaks              0
Missing System Transitions        0
Offline Intervention Required     0
Infinite Loops                    0
Other Failures                    0
```

Only after this Gate passes should animation/sound work continue.
