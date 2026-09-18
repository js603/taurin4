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
