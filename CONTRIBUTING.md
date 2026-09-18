# Contributing

작은 PR/작은 커밋을 권장합니다.

기본 검증:

```bash
npm run check
```

새 기능을 만들 때는 `src/features/notes`를 복제하지 말고 구조만 참고하세요.
도메인 명칭을 먼저 정한 후 기능 폴더를 만들고, repository interface를 application 계층에 둡니다.

플랫폼별 API가 필요하면 UI에 직접 넣지 말고 infrastructure adapter를 추가합니다.
