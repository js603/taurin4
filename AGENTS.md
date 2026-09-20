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


## Mafia V2 운영 규칙

`src/features/mafia-classic` 변경 시 다음을 반드시 지킨다.

1. 게임 진행의 source of truth는 application session의 명시적 `phase`다.
2. React의 index, modal open 여부, animation flag로 phase를 암묵적으로 표현하지 않는다.
3. 모든 phase는 최소 하나의 합법적인 exit transition을 가져야 한다.
4. 한 명의 테스터가 GitHub Pages에서 AI와 라운드를 끝까지 진행할 수 있어야 한다.
5. Honest AI는 공개 정보만 사용한다. 다른 플레이어의 alignment를 읽어 의사결정하면 안 된다.
6. Mafia AI는 자신의 진영과 Mafia 동료 정체만 추가로 사용할 수 있다.
7. 제거된 플레이어는 발언/고발/표결/Night note를 제출할 수 없다.
8. 피고는 자신의 낮 제거 표결에 참여하지 않는다.
9. 제거된 사람의 alignment는 라운드 종료 전 UI/로그에 공개하지 않는다.
10. Mafia Night는 생존자 과반 동의가 있어야 시작된다.
11. 살아 있는 Mafia 수는 Night의 이름 쪽지 수가 공개된 뒤에만 갱신한다.
12. 기능 변경 후 `soloSession.test.ts`에서 전체 흐름 회귀를 검증한다.
13. 플레이 중 공개 기록에는 공개 정보만 저장한다.
14. 긴장 연출은 진행 명확성보다 우선하지 않는다.
15. Mafia UI는 대시보드가 아니라 대화와 현재 결정을 중심으로 구성한다.

상세 결함 기록:
`docs/mafia/EXPERT_AUDIT_V02.md`
