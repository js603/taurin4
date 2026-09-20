# MAFIA — GPT Asset Generation Prompts

This file is a production prompt pack for generating original assets with image/audio GPTs.
The game rules do not depend on these assets.

## 0. Shared Art Bible

Use this block at the beginning of every visual prompt.

```text
Create an original production asset for a social-deduction game called MAFIA.

Visual identity:
- original 1980s Eastern European social thriller atmosphere
- intimate apartment / back-room meeting mood, not a gangster-action cliché
- analogue paper, worn playing cards, dark wood, frosted glass, tungsten desk lamps
- near-black charcoal, aged ivory, oxblood burgundy, cold blue-gray accents
- restrained cinematic lighting, heavy negative space, subtle film grain
- tension, paranoia, secrecy, quiet dread
- realistic material texture but clean enough for modern game UI
- mature and serious, not horror gore
- no copyrighted characters, logos, brands, or existing game UI
- no readable text unless the prompt explicitly asks for it
- no watermark
- composition must remain legible on both mobile portrait and desktop landscape
```

---

## 1. Main Menu / Key Art

Use with an image-generation GPT.

```text
[SHARED ART BIBLE]

Create a 16:9 cinematic key art background.

Scene:
A dim apartment dining table after midnight.
Six to ten empty chairs form a tense circle around a dark wooden table.
At the center are identical folded paper notes, two playing cards turned face down,
a pencil, and a single tungsten lamp casting a hard pool of light.
No people are clearly visible; only vague human silhouettes beyond the light.
A red card edge and a black card edge are subtly visible but must not reveal roles.
The room should feel silent, conspiratorial, and psychologically tense.

Composition:
- center of table remains clear enough for menu UI
- darker left/right edges for buttons
- no text
- no logos
- no weapons
- no gore
- strong depth, realistic materials
- export at 3840x2160
```

Suggested filename:
`assets/mafia/backgrounds/menu-keyart.webp`

---

## 2. Day Discussion Background

```text
[SHARED ART BIBLE]

Create a 16:9 background plate for the Day discussion screen.

A cramped but believable late-1980s apartment meeting room at dawn.
A circular dining table, mismatched chairs, cold early daylight entering through blinds,
one lamp still on, cigarette-smoke-like atmospheric haze without showing active smoking.
The emotional tone is suspicion after a sleepless night.
No identifiable people; use soft silhouettes only.

Gameplay requirements:
- center 55% must be low-detail enough for dialogue/action UI
- left and right zones may hold roster and public log panels
- no text
- no icons
- no role clues
- no gore
- export 2560x1440 and a mobile-safe 1440x2560 crop
```

Suggested filename:
`assets/mafia/backgrounds/day-room.webp`

---

## 3. Mafia Night Background

```text
[SHARED ART BIBLE]

Create a night-phase background plate.

Same room and camera family as the Day background, now almost completely dark.
Only moonlight through blinds and a dim desk lamp remain.
Identical folded paper notes sit in the center of the table.
The table should feel like a ritual space rather than a crime scene.
Use cold blue-black shadows with a very small oxblood accent.
No visible faces, no readable writing, no gore.

Keep the central UI area uncluttered.
Export 2560x1440 and 1440x2560.
```

Suggested filename:
`assets/mafia/backgrounds/night-room.webp`

---

## 4. RED / BLACK Role Cards

Generate as a matched pair.

```text
[SHARED ART BIBLE]

Create two original playing-card backs/front-style role cards as a matched production set.

Card A:
- deep muted red / aged burgundy
- communicates HONEST only through color and abstract geometry
- simple embossed border and subtle paper wear

Card B:
- charcoal black
- communicates MAFIA only through color and abstract geometry
- same border, dimensions, wear, lighting, and material

Requirements:
- absolutely no readable words or letters
- no skull, gun, fedora, dollar sign, or gangster stereotype
- flat front-facing orthographic presentation
- transparent background
- identical card dimensions
- clean silhouette suitable for UI animation
- 1024x1536 each
```

Suggested filenames:
- `assets/mafia/cards/red-card.png`
- `assets/mafia/cards/black-card.png`

---

## 5. Player Portrait Silhouette Set

```text
[SHARED ART BIBLE]

Create a sprite/portrait sheet of 16 anonymous adult player silhouettes.

Requirements:
- diverse hairstyles, head shapes, jackets, shirts, glasses, posture
- every portrait neutral enough that appearance gives zero clue about role
- bust framing, straight-on or slight 3/4 view
- same lighting direction, same scale, same camera
- dark cinematic realism simplified for small UI thumbnails
- no celebrity likeness
- no text
- transparent background
- arrange on a strict 4x4 grid with equal cells
- 2048x2048 master sheet
```

Suggested filename:
`assets/mafia/portraits/player-silhouettes-sheet.png`

---

## 6. UI Ornament / Icon Sheet

```text
[SHARED ART BIBLE]

Create one production-ready transparent UI icon sheet.

Include:
- accusation marker
- sealed note
- folded paper
- vote hand
- empty chair
- heartbeat pulse
- eye closed
- eye open
- sunrise
- night
- public record / ledger
- muted audio
- haptic pulse
- pass-device handoff

Style:
- minimal engraved / stamped shapes
- ivory, muted burgundy, cold gray only
- consistent stroke weight
- readable at 20–32 px
- no text
- no decorative frame
- strict grid with generous spacing
```

Suggested filename:
`assets/mafia/ui/ui-icons-sheet.png`

---

## 7. Tension FX Sheet

```text
[SHARED ART BIBLE]

Create a transparent 2D FX sheet for restrained social-thriller UI transitions.

Include:
- soft red vignette pulse
- paper dust motes
- lamp flicker bloom
- thin heartbeat line pulse
- stamped ink bleed
- subtle dark radial shutter
- paper-fold shadow
- result-reveal flash

Requirements:
- effects only, no objects, no characters
- subtle and elegant, not fantasy magic
- no gore
- no text
- 4x2 grid
- each cell consistent size
- alpha-ready transparent background
```

Suggested filename:
`assets/mafia/fx/tension-fx-sheet.png`

---

## 8. App Icon

```text
Create an original app icon for a game titled MAFIA.

Concept:
Two overlapping playing cards represented only by geometric red and black fields,
with a thin aged-ivory edge between them.
The shape should suggest secrecy and divided loyalties without showing people,
weapons, skulls, or gangster clichés.

Style:
minimal, premium, dark cinematic, extremely legible at 32 px,
no text, no letter M, no existing logo resemblance.

Generate a centered square master at 1024x1024 with safe margins.
```

Suggested filename:
`assets/mafia/app-icon/master-1024.png`

---

## 9. Sound Effect Prompt Pack

Use with a sound-effect/music generation GPT.

### Card reveal

```text
0.8 second dry playing-card flip on a wooden table,
close-mic paper friction, tiny low-frequency thump,
quiet apartment room tone, no music, no voice, no reverb tail.
```

### Seal note

```text
1.0 second folded paper and firm fingertip press,
slight pencil scrape, tense dry room,
subtle heartbeat-like low impact at the end,
no voice, no melody.
```

### Guilty vote lock

```text
0.7 second restrained wooden desk impact,
one low heartbeat transient,
paper vibration, serious social-thriller tone,
not a courtroom gavel, not cinematic boom.
```

### Night result — unanimous shot

```text
1.2 second abstract low percussive crack representing a Mafia hit,
followed by a short room-tone vacuum and distant low heartbeat.
No realistic gun recording, no scream, no gore, no action-movie sound.
```

### Night result — split target

```text
1.1 second sequence of two soft paper taps moving in opposite stereo directions,
ending unresolved with a faint room creak.
Communicate disagreement without voices.
```

### Zero shots / Honest victory

```text
3 second silence-forward cue:
night room tone, distant morning air gradually appearing,
one soft exhale-like tonal swell,
no triumphant fanfare, no choir, restrained relief.
```

---

## 10. Background Music Prompt

```text
Create a seamless 3-minute background loop for a psychological social-deduction game.

Mood:
quiet paranoia, social tension, restrained anticipation,
1980s Eastern European apartment at night,
analogue tape texture, sparse low piano resonance,
sub-bass heartbeat motif used very rarely,
soft clock-like percussion far in the background,
long stretches of near-silence.

Rules:
- no vocals
- no melody that draws attention away from conversation
- no action trailer drums
- no horror stingers
- no gangster-jazz stereotype
- loop point must be clean
- designed to sit under human voice chat
```

Suggested filename:
`assets/mafia/audio/bgm-table-tension.wav`

---

## 11. Generation QA Prompt

After generating any visual asset, ask the image GPT:

```text
Audit this asset against the MAFIA art bible.

Check:
1. Does it accidentally reveal or imply a player's hidden role?
2. Does it contain readable accidental text or watermark?
3. Is the silhouette readable on mobile?
4. Does it preserve the charcoal / aged ivory / oxblood / cold gray palette?
5. Is it original and free of recognizable copyrighted game branding?
6. Will UI remain readable over it?
7. Is the light direction consistent with the rest of the asset family?

Return PASS/FAIL per item and provide a corrected generation prompt for every FAIL.
```

## 12. Asset Rule

Generated art may increase tension and atmosphere only.

It must never encode:
- player alignment
- individual vote
- private night target
- hidden surviving-Mafia information before the public shot-count reveal

The visual system is subordinate to the original rules.
