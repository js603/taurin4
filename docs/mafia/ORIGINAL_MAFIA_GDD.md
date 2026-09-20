# MAFIA — Original Rules GDD

> Branch: `submain`  
> Ruleset: Dimma Davidoff original Mafia (1986 lineage)  
> Product target: Web/PWA + Windows + Android + iOS through the existing Tauri v2 base.

## 1. Product Pillar

This game must preserve the original information structure:

- informed minority: Mafia
- uninformed majority: Honest
- no Doctor, Detective, Sheriff, Angel, Seer, Don, or other power role
- no dead-role reveal during the round
- no artificial clue system
- persuasion, deception, memory, and group psychology are the game

The tension layer may change presentation, pacing feedback, audio, animation, and ergonomics.
It must not introduce new information, abilities, win conditions, or mandatory time pressure.

## 2. Source Rule Lock

Primary reference lineage:

- Dimma Davidoff, *The Original Mafia Rules*
- The Serving Library archive: https://www.servinglibrary.org/journal/2/the-original-mafia-rules
- Publicly archived scan/PDF reproductions of Davidoff's rules

Implementation rules locked for v1:

### Player count

| Players | Mafia | Honest |
| ---: | ---: | ---: |
| 6–7 | 2 | remainder |
| 8–10 | 3 | remainder |
| 11–13 | 4 | remainder |
| 14–16 | 5 | remainder |

All players know how many Mafia cards were included initially.

### Sunrise

1. Roles are assigned secretly.
2. Everyone closes their eyes and lowers their head.
3. Count 1–5 aloud.
4. Count 6–15 silently.
5. During that silent interval, Mafia open their eyes and identify each other.
6. Count 16–20 aloud.
7. Everyone opens their eyes.
8. Honest know only their own innocence; Mafia know their teammates.

The digital pass-and-play build uses private role screens and keeps the Sunrise ritual as the shared ceremony.

### Day

- Discussion is free-form.
- Any living player can accuse another living player.
- The accused can argue in their defense.
- When voting is called, the accused does not vote on their own case.
- A strict majority of eligible voters is required for execution.
- Failed accusations do not eliminate anyone and discussion continues.
- Any number of accusations can occur.
- Eliminated players do not reveal alignment and may not influence the game.

### Mafia Night proposal

Night does not automatically begin because someone was executed.

- A living player may propose a Mafia Night.
- All living players vote.
- A strict majority is required.
- If the proposal fails, Day continues.

### Mafia Night

Every living player submits a private note.

- Honest submits `HONEST`.
- Each surviving Mafia submits one living player's name.
- The count of name-bearing notes publicly reveals how many Mafia are still alive.
- A murder happens only if every surviving Mafia wrote the same target.
- If Mafia targets differ, nobody is murdered.
- The murdered player's alignment remains secret.

### Win conditions

Honest victory:
- a Mafia Night produces zero Mafia shots/name notes.

Important:
- eliminating the last Mafia during Day does **not** immediately announce an Honest victory.
- the table must call and approve a Mafia Night to discover that no Mafia remain.

Mafia victory:
- all Honest players are eliminated.

## 3. Core Loop

```text
Secret role assignment
       ↓
Sunrise recognition
       ↓
Free discussion
       ↓
Accusation
       ↓
Defense
       ↓
Private majority vote
       ↓
Continue discussion
       ├─────────────┐
       │             │
Night proposal   Another accusation
       ↓
Majority vote
       ↓
Private notes
       ↓
Shot-count reveal
       ↓
Unanimous target?
  ├─ yes -> murder
  └─ no  -> nobody dies
       ↓
Day / end condition
```

## 4. Rule-Locked Tension Layer

These additions are allowed because they do not alter information or probability.

### Heartbeat

A subtle heartbeat indicator intensifies around:

- the final vote in an accusation
- the vote that can pass a Mafia Night proposal
- the final sealed note
- the moment before the shot count is revealed

No numeric "suspicion meter" is allowed.

### Sealed information transitions

Private actions use:

1. pass-device screen
2. explicit reveal gesture
3. private choice
4. seal/close action
5. neutral handoff screen

This prevents accidental information leakage and makes every secret action ceremonial.

### Delayed public reveal

After a vote or Mafia Night, public results use a short dramatic reveal:

- paper shuffle
- breath/room-tone ducking
- one heavy heartbeat
- result text
- then return to the table

The delay is presentation-only and should remain short.

### Public chronicle

The UI records only information that every living player could know:

- accusations
- guilty vote totals
- executions
- whether a Mafia Night proposal passed
- number of Mafia shots
- whether a murder happened
- victim name

Never log hidden roles or individual private votes during the active round.

### Death remains ambiguous

Dead players are visibly crossed out but continue to display:

`제거됨 · 정체 비공개`

This ambiguity is a core source of paranoia and must not be weakened.

### Audio/Haptics

Recommended:

- low room tone
- paper/card foley
- distant clock
- restrained heartbeat
- single low impact on execution
- dry gunshot-like impact represented abstractly, not gore
- mobile haptic pulse during sealed reveal moments

All audio can be muted and all motion must respect `prefers-reduced-motion`.

## 5. UX Surface

### Setup

- 6–16 names
- original Mafia count shown before start
- no role customization in Original Rules mode

### Private role reveal

Each player sees only:

- RED CARD / HONEST
- BLACK CARD / MAFIA
- Mafia players may see teammate names because that knowledge is granted by Sunrise

### Main Day table

Three-column desktop layout:

- left: living/dead roster
- center: discussion / accusation / vote
- right: public chronicle

Mobile:

- center action surface first
- roster second
- chronicle third

### Vote

Votes are entered one player at a time in pass-and-play mode.
Only the final aggregate result becomes public.

### Night note

Honest has no choice: their private note is HONEST.
Mafia privately chooses one living target.

## 6. Current Implementation

Implemented on `submain`:

- pure original-rule engine
- player-count validation
- secret role assignment
- Sunrise flow
- free Day phase
- accusation and defense transition
- accused-excluded majority vote
- Mafia Night proposal majority
- private night notes
- unanimous-target murder resolution
- zero-shot Honest victory
- all-Honest-dead Mafia victory
- no dead role reveal
- public event log
- responsive dark-cinematic UI
- unit tests for rule-critical behavior

## 7. Next Production Steps

1. Run CI/tests on `submain`.
2. Add reconnect-safe state serialization.
3. Separate local pass-and-play transport from future LAN transport.
4. Add optional host/moderator display.
5. Add sound/haptic service adapters.
6. Produce the visual/audio assets defined in `ASSET_GENERATION_PROMPTS.md`.
7. Browser QA with Playwright.
8. Android QA with Maestro/ADB.
9. Windows Tauri QA.
10. LAN multiplayer without changing the rules engine.

## 8. Non-goals for Original Rules mode

Do not add:

- Doctor
- Detective
- Sheriff
- Don
- Lovers
- Serial Killer
- role reveals
- evidence cards
- random events
- buffs/debuffs
- hidden numeric suspicion
- mandatory discussion timer
- alternate victory conditions

Those belong only in a future separate variant mode.
