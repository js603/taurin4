# Playtest report — 2026-09-18

## Scope

The published GitHub Pages build was exercised from opening night through
debate, accusation, defendants, and verdict. The uncommitted candidate build
was verified through production compilation and deterministic session tests,
but could not be opened by the cloud browser because local-loopback navigation
is blocked in that browser environment.

## Findings and fixes

### P1 — Evidence disappeared during the decision

- Reproduction: open the hall, start accusation, inspect the central column.
- Published behavior: testimony was visible during debate, then removed exactly
  when the player had to choose an accusation.
- Impact: the player had to remember evidence instead of comparing it while
  making the decision.
- Candidate fix: testimony remains visible in accusation, defendants, and
  verdict phases.

### P1 — Defense action produced placeholder text

- Reproduction: nominate a player, select “피고석의 변론 듣기,” then inspect
  both defendant cards.
- Published behavior: both still said “최후 변론을 기다리는 중.”
- Impact: the action appeared to do nothing and the verdict lacked new input.
- Candidate fix: each defendant now presents a concise defense based on their
  disclosed evidence, or a neutral reminder to compare public testimony.

### P1 — No role-specific human night choice

- Published behavior: night actions were automatic.
- Candidate fix: living murderers, investigators, and apothecaries select a
  legal target. Commoners and dead players skip the choice. Invalid targets do
  not mutate session state.

### P2 — Death could leave the player responsible for votes

- Candidate fix: dead humans enter observer mode; bot accusation and verdict
  can be advanced without fabricating a human vote.

## Automated acceptance evidence

- 300 seeded interactive sessions reached a real winner within 200 UI actions.
- All four human roles were exercised, including legal night targets and dead
  observer voting.
- Core tests cover role distribution, victory parity, prologue nonlethality,
  protection rules, tied verdicts, strict voter/finalist validation, hidden-role
  isolation, evidence idempotence, and no fabricated timeout winner.
- Bot tests verify that a disclosed investigator can be prioritized and
  protected, while consecutive protection remains illegal.
- `npm run check` covers lint, Vitest, Node core tests, TypeScript, Vite, and PWA
  production output.

## Balance acceptance

The baseline policy is retained. A 50,000-game holdout run at seed 30000000
produced 53.62% resident and 46.38% murderer wins, with 3.3803 mean days.
Three additional 20,000-game sensitivity runs showed that reducing the
investigator “acted” weight moved resident wins to 52.68–53.78% but did not
materially reduce the apothecary's first-elimination share. That result argues
against tuning one coefficient to conceal a structural role-claim issue.

## Remaining acceptance gate

The candidate build still needs one human pass after it is deployed or run on a
machine with a browser: desktop and narrow-screen layout, visible target
selection, defense readability, and the apothecary's role-claim experience.
The dedicated `game-dev` evidence path is unavailable because that CLI is not
installed in this environment. No GPU, native-window, mobile, or candidate-build
screenshot evidence is claimed.
