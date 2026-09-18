# Architecture

Goal: 하나의 React/TypeScript UI와 application layer를 Web/PWA, Windows, Android, iOS에서 공유한다.

```text
UI -> Application -> Domain
          ^
          |
   Infrastructure
```

Feature:

```text
src/features/<feature>/
  domain/
  application/
  infrastructure/
  ui/
```

`src/shared/runtime/runtime.ts`가 Web/Tauri 구분의 단일 진입점이다.

플랫폼 차이가 커지면 UI 조건문 대신 port + adapter를 추가한다.

`src-tauri`는 native boundary다.

main Push:

```text
Quality
  ├─ Web/PWA + Pages
  ├─ Windows
  ├─ Android
  └─ iOS
```
