# MAFIA Expert Audit V2

Branch: `submain`  
Audit target: first playable Original Mafia vertical slice  
Audit trigger: human playtest reported that the game did not progress naturally and the UI did not feel like a complete Mafia game.

## Executive conclusion

The first vertical slice implemented many isolated rules correctly but failed as a game product.

It was a **rule calculator wrapped in a pass-and-play form**, not a self-running social-deduction game.

The most important failure was not visual polish. It was the absence of a durable game-session state machine that owns:

- who is acting now
- what information is public/private
- what legal actions exist now
- who makes decisions if the human does not
- how the round exits the current phase
- how a dead human continues observing
- how a single playtester can finish a full round on GitHub Pages

V2 makes the session state machine the source of truth and adds a complete 1-human + AI table so every core rule can be exercised from start to finish.

---

## P0 findings — game-breaking

### P0-1 Accusation setup was unreachable

Previous code:

- `beginAccusation()` set `voteIndex = 0`
- accusation/defense setup UI rendered only when `voteIndex === -1`

Result:

Pressing **고발한다** skipped the accusation setup and moved directly into a private ballot for a default target.

Impact:

- no meaningful accuser selection
- no deliberate accused selection
- no defense rhythm
- no comprehension of why voting began
- the user experiences the game as broken

Fix:

The V2 session uses explicit phases:

```text
discussion
  -> defense
  -> vote
  -> verdict
  -> discussion
```

No render-only index can create or skip a gameplay phase.

### P0-2 The app had no actual opponents

The first build asked the user to type 6–16 names but supplied:

- no network players
- no AI players
- no automated moderator
- no autonomous speech
- no autonomous accusations
- no autonomous ballots
- no autonomous Mafia choices

One tester therefore had to operate the entire table manually.

That is not a playable digital Mafia game.

Fix:

V2 has a **Solo Table**:

- 1 human
- 5–9 AI players
- AI discussion
- AI accusations
- AI verdict ballots
- AI Mafia Night proposal votes
- AI Mafia night notes
- dead-human spectator continuity

The original Mafia rule engine remains unchanged.

### P0-3 No authoritative session state machine

The previous UI mixed gameplay truth across many React variables:

- `dayAction`
- `voteIndex`
- `votes`
- `nightIndex`
- `nightOpen`
- `nightTargetId`
- `nightTargets`
- `lastReveal`

This allowed impossible state combinations and made UI state itself determine game legality.

Fix:

V2 adds `SoloMafiaSession.phase`.

Legal phases are explicit:

```text
role-card
sunrise
discussion
defense
vote
verdict
night-vote
night-note
night-result
ended
```

React local state now handles only temporary presentation choices such as which seat is selected.

### P0-4 There was no complete digital core loop

Previous experience:

```text
role reveal
-> static sunrise card
-> empty day screen
-> manual form actions
```

The social game never came alive because nobody said or did anything unless the tester manually entered it.

V2 loop:

```text
secret role
-> Sunrise information
-> AI opening discussion
-> human statement / AI reactions
-> human or AI accusation
-> defense
-> hidden ballots
-> public tally
-> continue day
-> Mafia Night proposal
-> majority ballot
-> sealed note
-> public shot count
-> murder/no murder
-> next day
-> victory
```

---

## P1 findings — Mafia identity failures

### P1-1 Sunrise knowledge was delivered at the wrong time

Previous private role screen told a Mafia player all teammate names **before Sunrise**.

This made Sunrise decorative rather than the mechanism through which Mafia obtains shared identity knowledge.

Fix:

- Role card shows only the human's own alignment.
- Mafia teammate identities are shown during the Sunrise phase.
- Honest receives no extra identity knowledge.

### P1-2 The social deduction layer did not exist

Mafia is not primarily a voting game.
Its main play surface is:

- persuasion
- pressure
- hesitation
- coalition formation
- memory of previous statements
- interpreting voting behavior

The previous UI had no actual statements, replies, or social pressure.

Fix:

V2 creates a public discussion feed.

AI dialogue is generated only from:

- public table momentum
- public behavior
- the speaking Mafia member's own teammate knowledge

Honest AI does not read hidden alignments.

### P1-3 Hidden information protection was too weak

The previous pass-and-play night flow had visibly different interaction cost:

- Honest: open and immediately seal HONEST
- Mafia: open a target selector and spend longer choosing

People physically watching device handoff could infer roles from timing and interaction.

This is a critical pass-and-play problem.

Decision:

V2's main playtest mode is no longer one-device 6-human pass-and-play.
It is 1 human + AI, which provides a valid hidden-information boundary for development testing.

Future Table Mode must add a dedicated neutral handoff screen and fixed interaction envelope before shipping.

### P1-4 There was no dead-player continuity

A digital game must define what happens when the human is removed.

Previous architecture had no intentional spectator experience.

Fix:

V2:

- removes human speech and vote actions after death
- keeps AI simulation progressing
- lets the player observe discussion, accusations, ballots and night results
- preserves team result until the round ends

### P1-5 The page could not survive refresh

Losing a Mafia round because the browser refreshed is unacceptable, especially on mobile.

Fix:

V2 serializes the plain session state to:

`taurin4.mafia.solo.v2`

The active round restores after reload.

---

## P1 UI findings

### P1-6 The UI looked like an admin dashboard

Previous desktop UI permanently displayed:

- left roster panel
- large central panel
- right public log panel
- full header
- footer

This made screenshots read like an application dashboard rather than a tense social table.

Fix:

V2 UI budget:

- compact day/phase header
- one public-information strip
- one horizontal seat rail
- one dominant social/game surface
- public history collapsed in a drawer

The center is now conversation and current decision, not layout chrome.

### P1-7 No single current-action hierarchy

Previously the screen frequently showed generic phase prose plus multiple controls without making the current required action obvious.

Fix:

Each non-discussion phase has one focused decision card:

- defense
- private ballot
- verdict result
- night proposal ballot
- sealed note
- night result

### P1-8 The screen did not explain why something happened

A good Mafia interface must always answer:

- who accused whom
- who is allowed to vote
- what majority means
- why someone was or was not removed
- what information is now public

V2 surfaces:

- accuser
- accused
- eligible voter count
- strict-majority threshold
- final aggregate vote
- shot count
- murder/no-murder result
- identity-hidden reminder

---

## P2 findings — tension/polish

### P2-1 Decorative heartbeat before functional tension

The first build added a heartbeat indicator even though the decision flow itself was unclear.

Tension only works when the player understands the stakes.

V2 priority order:

1. clear phase
2. clear stakes
3. hidden information
4. irreversible choice
5. delayed public result
6. audiovisual tension

Audio/haptics remain a later production layer.

### P2-2 English/Korean hierarchy was inconsistent

English labels were often dominant and Korean explanatory text secondary.

V2 keeps English only as short ritual/game terms:

- MAFIA
- HONEST
- GUILTY
- MAFIA NIGHT
- SUNRISE

Korean owns instructions and causal explanation.

---

## AI integrity rules

The AI table must not cheat.

### Honest AI may use

- public discussion
- public accusations
- public aggregate votes
- public deaths
- public Mafia-shot count
- deterministic personality/noise

### Honest AI may NOT use

- another player's alignment
- Mafia teammate list
- another player's secret vote before reveal
- another Mafia night target

### Mafia AI may additionally use

- its own Mafia alignment
- identities of other Mafia members

This is equivalent to legal player knowledge.

---

## Current V2 implementation

Implemented:

- complete solo session state machine
- 1 human + AI table
- original role counts
- own-role reveal
- Sunrise teammate acquisition timing
- public conversation
- human suspicion/question/defense speech
- AI reactions
- human accusation
- AI accusation
- accused defense
- hidden bot ballots
- accused excluded from own verdict
- aggregate vote reveal
- day continues after verdict
- Mafia Night proposal and majority
- sealed Honest/Mafia note
- AI Mafia targets
- public shot count
- unanimous murder rule
- no-role-reveal death
- dead-human spectating
- local session persistence
- low-chrome responsive UI
- full session transition tests

---

## Non-negotiable regression gates

Any future Mafia change must satisfy all of the following:

1. A deterministic automated test can move from game creation through every phase type.
2. Every phase has at least one legal exit.
3. No UI index or animation flag defines game legality.
4. Honest bot policy never reads hidden alignment.
5. Dead players cannot speak or vote.
6. The accused cannot vote on their own daytime verdict.
7. Eliminated alignment is not revealed before round end.
8. Mafia Night requires living-player majority.
9. Public Mafia count changes only through Night shot-count information.
10. GitHub Pages solo mode can be completed by one human tester.

