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

## Mafia M1 Core Contract

`src/features/mafia-classic`의 규칙 구현은 사용자가 제공한 **Mafia Game Specification v1**을 Single Source of Truth로 취급한다.

구조:

```text
Player Input
→ Action
→ Action Validator
→ Game Engine
→ GameState
→ PlayerView Builder
→ UI
```

절대 규칙:

1. UI, React state, modal, animation handler가 GameState를 직접 변경하지 않는다.
2. 클라이언트와 봇은 `GameAction`만 보낸다. `SET_PHASE`, `KILL_PLAYER`, `SET_WINNER` 같은 권한은 없다.
3. 모든 Action은 phase, alive/dead, role, permission, completion state를 Validator에서 검증한다.
4. GameState는 서버/호스트의 authoritative state다.
5. 클라이언트에는 GameState를 직접 보내지 않는다. 반드시 `buildPlayerView(playerId)` 결과만 전달한다.
6. CSS 숨김으로 비밀정보를 보호하지 않는다. 허가되지 않은 데이터 자체를 PlayerView에 넣지 않는다.
7. 봇은 인간과 같은 Action API를 사용하며, 의사결정은 자기 PlayerView만 사용한다.
8. 사망자는 생존자에게 영향을 주는 Action을 실행할 수 없다.
9. v1 기본 게임은 8인: Mafia 2, Detective 1, Doctor 1, Citizen 4다.
10. v1은 ROLE_REVEAL 이후 NIGHT 1부터 시작한다.
11. Mafia 공격은 생존 비-Mafia만 가능하다. 1차 동률은 재선택, 2차 동률은 공격 실패다.
12. Doctor는 자신 포함 생존자를 보호할 수 있지만 같은 플레이어를 2일 연속 보호할 수 없다.
13. Detective는 자신 외 생존자를 조사하며 결과는 MAFIA / NOT_MAFIA만 본인에게 공개한다.
14. 밤 행동 결과는 NIGHT_RESOLVE에서 동시에 처리한다.
15. 사망 시 역할은 공개한다.
16. Day Vote는 생존자만 가능하며 자기 자신에게 투표할 수 있다.
17. 지목된 후보 + 처형하지 않음만 투표할 수 있다.
18. 최다 득표 단독 1명만 처형한다. 최다 득표 동률은 처형 없음이다.
19. Town 승리: 생존 Mafia 0.
20. Mafia 승리: 생존 Mafia 수 >= 생존 Town 수.
21. winner가 정해진 뒤에는 GAME_OVER 외 상태로 이동하지 않는다.
22. 모든 성공 Action은 replay에 기록한다.
23. Core 변경 후 `npm run mafia:m1:sim` 1,000판을 통과해야 한다.
24. M1 Core가 승인되기 전에는 Mafia UI를 고도화하지 않는다.
25. 소스 문서에 정의되지 않은 규칙은 임의로 발명하지 않는다. 특히 5~7명/9~10명의 역할 배분은 별도 확정 전까지 구현하지 않는다.

M1 core:
- `src/features/mafia-classic/core/`
- `src/features/mafia-classic/simulation/`

현재 UI/application의 이전 V2 구현은 legacy adapter 대상이며 M1 Core의 규칙 기준이 아니다.
