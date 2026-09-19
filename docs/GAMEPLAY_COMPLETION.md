# Gameplay and bot policy — 2026-09-18

> Historical v0.1 scope, not a current completion claim. See [v0.2 foundations and limitations](MAFIA_FOUNDATIONS_V02.md).

## Implemented scope

Existing React trial-hall design is preserved. Game rules remain in the core;
interactive sessions and simulations now share `application/botPolicy.ts`.

- Opening night (automatic, nonlethal) → testimony → accusation → two finalists
  → defense → verdict → role-specific night action → next day or victory.
- Human murderer selects the faction attack; investigator selects a non-self
  target; apothecary selects a legal protection target. Commoners and dead players
  skip night selection. Dead humans observe bot-only votes.
- Private panel shows the player's own role, murderer ally if applicable, own
  investigations and own testimony. Enemy roles are not exposed by session DTOs.
- Evidence remains readable during accusation and verdict. Defenses are
  evidence-based templates, not generated conversational dialogue.
- A new trial increments the seed; the same seed reproduces the same actions.

## Rules and validation

Eight seats: two murderers, one investigator, one apothecary, four commoners.
Residents win when no murderer survives. Murderers win at living-player parity.
Accusation disallows self-votes; verdict permits voting for either finalist.
Accusation ties rotate seat priority by seed and day; verdict ties execute nobody.
Protection forbids consecutive identical targets and allows one self-protection.
The automatic opening night also consumes protection usage under existing rules.
Investigation reveals activity, not faction: the apothecary also acts at night.
Votes require exactly the living voters and verdict finalists must match today's
accusation. Input vote objects are copied into history.

## AI information boundary

Bots score public testimony, public investigation and their own withheld clues.
Public evidence is not counted again as private evidence. Repeated evidence
processing is idempotent. Murderers know allies, protect them in votes, and can
withhold testimony. Attacks prioritize publicly disclosed investigators, not
hidden enemy roles. Investigators prefer uninvestigated targets. Apothecaries
prefer a legally protectable public investigator. Sharing and vote noise are
seeded policy parameters. Human testimony and investigation sharing remains
automatic; there is no manual lying, chat negotiation, or evidence-sharing UI.

## Measured balance

10,000 games per profile, starting seed 20260918:

| Profile  | Resident wins | Murderer wins | Average days |
| -------- | ------------: | ------------: | -----------: |
| lowInfo  |        45.17% |        54.83% |       3.4401 |
| baseline |        53.53% |        46.47% |       3.3827 |
| highInfo |        56.68% |        43.32% |       3.3256 |

Independent baseline validation: 50,000 games, starting seed 30000000.
Residents 26,810 (53.62%); murderers 23,190 (46.38%); mean 3.3803 days.
Protection success 28.80% of lethal-night protection attempts; average tied
verdicts 0.3475. Nonlethal opening nights are excluded from protection success.
Simulation limits now fail explicitly instead of assigning a fabricated winner.

These are all-bot results, not evidence of human-player balance. The default
baseline stays within a provisional 45–55% faction-win band. The high-information
profile favors residents; it is a sensitivity scenario, not a balanced mode.
Apothecaries account for 12,514 of 50,000 first executions, a remaining design
risk caused by activity clues. Human testing should assess whether their clue
ambiguity is understandable and enjoyable before tuning the rule itself.

Reproduction:

```sh
npm run check
npm run balance:profiles
node .core-dist/src/features/medieval-trial/simulation/cli.js --games 50000 --seed 30000000 --profile baseline
```

## Verification and remaining limits

Session tests exercise all four human roles across 300 seeds, including invalid
night actions, spectators, and terminal victory. Core regressions cover private
information, enemy-role swaps, forged voters/finalists, evidence idempotence,
self-protection, victory, deterministic outcomes, and simulation limits.

The published predecessor was browser-playtested through the full daytime flow;
that exposed disappearing decision evidence and placeholder defenses, both fixed
in this candidate. The candidate itself could not be opened by the cloud browser
because local-loopback navigation is blocked. The Game Development Studio
`game-dev` CLI is also unavailable. No native rebuilds, deployment, remote CI,
or candidate-build screenshots are claimed. See `PLAYTEST_REPORT.md` for the
acceptance evidence and remaining human pass. This is a completed deterministic
gameplay slice, not a claim that all production UX or conversational AI is finished.
