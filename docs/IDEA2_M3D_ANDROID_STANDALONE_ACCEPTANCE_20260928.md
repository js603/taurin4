# IDEA2 M3-D — Android Standalone User-Flow Acceptance

Status: **VERIFIED / COMPLETE**

Date: 2026-09-28 (Asia/Seoul)

Repository: `js603/taurin4`

Canonical branch: `idea2`

Pinned OpenMMO: `950e081c178d920c10c51f2d31f60c1b3383c925`

Final verified implementation head:

`44669b89d0ddb863ea19f6865fbf73ffa344f1fa`

## Gate objective

Prove the real Android standalone path with executable runtime evidence rather than compile/APK evidence only:

```text
Android APK launch
→ Singleplayer
→ embedded pinned authoritative OpenMMO auto-start
→ no server URL/token input
→ automatic loopback connection/auth
→ Character Lobby
→ persistent character/state
→ EnterGame
→ server-authoritative gameplay
→ graceful embedded shutdown
→ app relaunch
→ persisted authoritative state
```

The existing LAN/remote OpenMMO path had to remain green at the same time.

## Final standalone acceptance evidence

Workflow: `idea2 M3-D Android Standalone E2E`

Run: `36382704727` — **SUCCESS**

Job: `108801570224` — **SUCCESS**

The job passed all required executable stages, including:

- exact pinned embedded OpenMMO source preparation
- pinned browser codec build and pin verification
- Android project initialization
- x86_64 standalone Android APK build
- standalone APK linkage inspection
- actual Android emulator launch
- actual standalone user-flow acceptance
- evidence artifact upload

The runtime acceptance starts from an empty app-private state, launches Singleplayer without external server/token input, creates/observes the standalone character, performs a user-visible safe stop, force-stops/relaunches the app, verifies the character persisted, enters the real game screen and checks the `SERVER AUTHORITATIVE` world marker.

The generated evidence state records:

- `standalone_without_server_input = true`
- `embedded_authoritative_core = true`
- `safe_stop_completed = true`
- `relaunch_character_persisted = true`
- `server_authoritative_game_screen = true`
- `external_credentials_persisted = false`

## Regression evidence on the same final head

All required PR workflows passed on `44669b89d0ddb863ea19f6865fbf73ffa344f1fa`:

- Pull Request Quality `36382705005` — SUCCESS
- Windows Playable Entry `36382704760` — SUCCESS
- Android OpenMMO Client `36382704720` — SUCCESS
- OpenMMO Adapter Integration `36382704686` — SUCCESS
- Android OpenMMO Runtime E2E `36382704872` — SUCCESS
- Windows Human Acceptance E2E `36382704747` — SUCCESS
- M3-D OpenMMO Tauri Link `36382704778` — SUCCESS
- M3-D Android Standalone E2E `36382704727` — SUCCESS
- Android OpenMMO Lifecycle E2E `36382704657` — SUCCESS

The existing external/reachable-server Android path also passed its real runtime job `108801570976`, including APK install and play against the real pinned OpenMMO server.

## Final compatibility correction

The first final-head attempt exposed a test-harness-only regression in the older M3-C external-server UI automation. After the new Singleplayer section lengthened the entry screen, Android's soft keyboard covered the second credential field. The automation then tapped the wrong field and overwrote the server URL with the token.

The fix was limited to the Android acceptance driver: after setting each field, dismiss the IME before locating the next field. No OpenMMO network, auth, gameplay or UI product rule was changed.

Fix commit:

`44669b89d0ddb863ea19f6865fbf73ffa344f1fa`

The corrected external-server Runtime E2E then passed.

## Canonical promotion / PR #13 semantics

Verification branch:

`ci/idea2-m3d-android-standalone-20260928`

Temporary draft PR #13:

`feat(idea2): verify Android standalone OpenMMO flow`

After all nine workflows were green, `idea2` was advanced with a **non-force fast-forward** from `f5ad5f570fed63a760bf24107bf6d9df9c412944` to the exact verified head `44669b89d0ddb863ea19f6865fbf73ffa344f1fa`.

No PR merge action and no merge commit were used. Because the base branch already contained the PR head when PR #13 was closed, GitHub automatically reported the closed PR as `merged=true` with the head itself as `merge_commit_sha`. This is a repository-state classification by GitHub, not a merge commit produced by the project workflow.

## Security and authority boundaries preserved

- OpenMMO remains authoritative for movement, combat, monsters, rewards, inventory, persistence and world state.
- Exact upstream pin remains fixed.
- No authoritative gameplay rules were recreated in React/Tauri.
- Standalone token handoff remains native-memory/JS-memory only.
- No token is persisted in URL, localStorage or sessionStorage.
- Android standalone mutable state uses app-private storage.
- Existing LAN/remote external-server entry remains available and regression-tested.
- `LocalGameSession` remains available.

## Gate result

M3-D Android standalone user-flow acceptance is **VERIFIED / COMPLETE**.

The Android app can now run OpenMMO standalone without requiring a PC-hosted server, server address or manually entered auth token, while continuing to support the existing external-server mode.

## Next exact action

Move from infrastructure proof to **OpenMMO gameplay-surface expansion in the Text/Card/TUI client**.

Start with a vertical gameplay audit of the currently reachable standalone experience and compare it against the pinned OpenMMO gameplay surface. Identify the highest-value missing player-facing systems that can be exposed through the existing semantic-event/session boundary without duplicating server authority.

Priority order for the next Gate:

1. verify what the standalone TUI can actually play now beyond lobby/entry/basic combat,
2. map missing OpenMMO systems to existing authoritative protocol/events,
3. select one coherent next playable slice,
4. implement only presentation/input adaptation in taurin4,
5. prove it on Windows and Android standalone while keeping LAN/remote regressions green.
