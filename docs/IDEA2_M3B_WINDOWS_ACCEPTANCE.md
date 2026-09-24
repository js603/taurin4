# M3-B Windows Human Acceptance

This is the final acceptance gate for M3-B Playable Runtime Entry.

## Run

From the taurin4 repository root on Windows:

```powershell
npm run openmmo:play:windows
```

The launcher uses:

```text
G:\taurin4-openmmo-runtime
```

for the pinned OpenMMO checkout, Cargo cache/target output, runtime logs, and local server data.

The first run may build the pinned OpenMMO server and browser codec. Later runs reuse them
when the audited commit still matches.

## Expected flow

```text
launcher starts
→ pinned OpenMMO local server becomes ready
→ taurin4 Tauri window opens
→ automatic OpenMMO connect/auth
→ Character Lobby appears
→ enter an existing character or create one
→ GameScreen appears
→ real MONSTER destination / WORLD ENCOUNTER appears
→ use "살펴본다"
→ use the visible attack control
→ authoritative combat result appears
```

## PASS checklist

- [ ] No manual server URL entry is required.
- [ ] No manual NPC/local auth token entry is required.
- [ ] Character Lobby appears.
- [ ] Character entry reaches the real GameScreen.
- [ ] A real OpenMMO monster appears as `MONSTER`.
- [ ] The encounter surface shows `WORLD ENCOUNTER`.
- [ ] The visible `살펴본다` action enters combat.
- [ ] The visible attack action produces an authoritative combat result.
- [ ] Closing taurin4 stops the managed local OpenMMO server.
- [ ] Running the launcher again preserves the local character/world state.

## If startup fails

Check:

```text
G:\taurin4-openmmo-runtime\openmmo-server.stdout.log
G:\taurin4-openmmo-runtime\openmmo-server.stderr.log
```

Do not delete the runtime directory by default because it contains the local OpenMMO
database and reusable build output.

For a rebuild of the pinned server/codec without intentionally deleting the database:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/play-openmmo-windows.ps1 -ForceRebuild
```

## Acceptance reporting

Report the first failing checkpoint, if any, using one of these labels:

```text
LAUNCHER
SERVER_READY
AUTO_AUTH
CHARACTER_LOBBY
ENTER_GAME
GAME_SCREEN
MONSTER_CARD
WORLD_ENCOUNTER
INVESTIGATE
ATTACK
SERVER_RESULT
SHUTDOWN
PERSISTENCE
```

If all items pass, report:

```text
M3-B HUMAN ACCEPTANCE PASS
```
