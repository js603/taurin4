# AI Coding Contract

1. 기능은 `src/features/<feature>` 안에 최대한 완결한다.
2. UI에서 Tauri API, localStorage, fetch, OS API를 직접 호출하지 않는다.
3. 외부 시스템은 infrastructure adapter로 감싼다.
4. application은 interface/port에 의존한다.
5. 플랫폼 분기는 adapter factory에 격리한다.
6. 새 파일은 한 가지 책임만 가진다.
7. `any`를 사용하지 않는다.
8. 외부 데이터는 runtime validation을 적용한다.
9. 대규모 재작성보다 작은 변경을 우선한다.
10. 변경 후 `npm run check`를 통과시킨다.

Feature 순서:

```text
domain -> application -> infrastructure -> ui -> tests
```

CI contract:
- main Push -> Quality
- Web/PWA artifact
- GitHub Pages
- Windows MSI/NSIS
- Android debug APK
- optional signed APK/AAB
- iOS unsigned
- optional signed IPA

Workflow 수정 시 `GITHUB_SETUP.md`도 갱신한다.

## Original Mafia Authoritative Contract

`src/features/mafia-classic/original/` is the Single Source of Truth for the active Mafia game.

Architecture:

```text
Human / Bot
→ OriginalAction
→ Original Action Validator
→ Original Game Engine
→ OriginalGameState
→ OriginalPlayerView
→ OriginalScreenContract
→ Chat-first UI
```

Rules:

1. Active roles are only `HONEST` and `MAFIA`.
2. Mafia count: 6–7 players = 2, 8–10 = 3, 11–13 = 4, 14–16 = 5.
3. ROLE_REVEAL shows only the player's own role.
4. SUNRISE reveals Mafia teammates to Mafia only.
5. Dead roles remain hidden during the active game.
6. Day gameplay is chat-first. PUBLIC chat is an authoritative gameplay surface, not decorative UI.
7. During DAY_DISCUSSION any living player may `ACCUSE_PLAYER` or `PROPOSE_MAFIA_NIGHT`.
8. ACCUSATION keeps PUBLIC chat open for accusation evidence and defense.
9. Only the accuser may `CALL_GUILTY_VOTE`.
10. The accused does not vote in their own guilty vote.
11. Guilty execution requires a strict majority of eligible voters.
12. A guilty vote, whether passed or failed, returns to DAY_DISCUSSION unless Mafia has already eliminated all Honest players.
13. Execution does not automatically begin Mafia Night.
14. Mafia Night begins only after a living player proposes it and a strict majority of living players agree.
15. During Mafia Night PUBLIC chat is closed.
16. Every living Honest player submits exactly `HONEST`.
17. Every living Mafia player submits exactly one living player name.
18. There is no Mafia private night chat in Original mode.
19. The number of name-bearing notes is publicly revealed and therefore reveals the number of surviving Mafia.
20. A murder occurs only when every surviving Mafia submits the same target name.
21. Split Mafia names produce no murder.
22. Zero Mafia name notes produce an HONEST victory.
23. Eliminating the last Mafia during Day does not immediately reveal an Honest win; the zero-shot Mafia Night resolves it.
24. Mafia wins when no Honest players remain.
25. GAME_OVER reveals all roles and makes the full chat history readable.

Chat policy:

1. Living players may write PUBLIC only during DAY_DISCUSSION and ACCUSATION.
2. Dead players cannot write PUBLIC.
3. Dead players may write and read DEAD chat before GAME_OVER.
4. Living players must never receive DEAD chat data before GAME_OVER.
5. SYSTEM messages are authoritative transition history.
6. Major transitions must create SYSTEM records so the full game can be understood from the timeline.
7. External voice/chat/offline conversation must never be required for the game to progress.
8. Bots use the same OriginalAction API as humans and receive only OriginalPlayerView.

UI contract:

1. React never imports OriginalGameState or Original engine functions.
2. React receives LocalMafiaSnapshot containing OriginalPlayerView + OriginalScreenContract.
3. CHAT is the primary gameplay surface for DAY_DISCUSSION and ACCUSATION.
4. Accusation, guilty vote, Night proposal, Night result and Game Over must remain connected through the same timeline.
5. Buttons are rendered only from `view.availableActions`.
6. Hidden information is omitted from PlayerView, never hidden with CSS.
7. Mobile default view prioritizes chat, composer and current action; player/context panels may compress around them.

Required gates:

```text
npm run check
npm run mafia:original:test
npm run mafia:original:sim
npm run mafia:m3:ui
npm run build
```

`mafia:original:sim` must report all of these as zero:

- Stalled
- Illegal Actions
- Invalid Transitions
- Secret Leaks
- Chat Policy Violations
- Dead -> Living Leaks
- Missing System Transitions
- Offline Intervention Required
- Infinite Loops
- Other Failures

Legacy directories `core/`, `simulation/`, `ux/` and legacy Mafia application code may remain temporarily for migration/regression history, but they are not the active rule authority and must not be used by the active UI.

