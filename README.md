# 중세재판 · taurin4

`중세재판` 게임을 Web/PWA, Windows, Android, iOS에서 공유하는 Tauri v2 + React + TypeScript + Vite 프로젝트입니다. 개발 프로젝트와 저장소 이름은 `taurin4`를 유지합니다.

현재 규칙 개정 v0.2는 시작 안내·무작위 배역·아침 발표·선택형 공개 주장·근거가 표시되는 고발·과반수 판결/보류를 포함합니다. [상세 규칙·마피아 비교·검증과 한계](docs/MAFIA_FOUNDATIONS_V02.md)를 먼저 확인하세요. AI는 규칙 기반이며 자연어 토론 모델은 아닙니다.


## Preconfigured GitHub

이 프로젝트는 다음 저장소를 기준으로 미리 설정되어 있습니다.

- GitHub owner: `js603`
- Repository: `taurin4`
- Repository URL: `https://github.com/js603/taurin4`
- GitHub Pages: `https://js603.github.io/taurin4/`
- Tauri identifier: `com.js603.taurin4`

초기 Push:

```bash
git init
git add .
git commit -m "Initial taurin4"
git branch -M main
git remote add origin https://github.com/js603/taurin4.git
git push -u origin main
```

## One codebase

- Web
- PWA
- Windows
- Android
- iOS

## One Push

`main` Push 한 번으로:

1. lint / test / Web build
2. Web/PWA artifact
3. GitHub Pages
4. Windows MSI + NSIS setup EXE
5. Android installable debug APK
6. Android signing 설정 시 signed APK + AAB
7. iOS unsigned build
8. iOS signing 설정 시 signed IPA

를 처리합니다.

처음에는 `GITHUB_SETUP.md`를 읽으세요.

## Local

```bash
npm install
npm run dev
npm run check
```

Windows:

```bash
npm run tauri:dev
npm run tauri:build
```

Android:

```bash
npm run android:init
npm run android:dev
npm run android:build:debug
```

iOS(macOS + Xcode):

```bash
npm run ios:init
npm run ios:dev
npm run ios:build:unsigned
```

## Architecture

```text
src/features/<feature>/
  domain/
  application/
  infrastructure/
  ui/
```

```text
UI -> Application -> Domain
          ^
          |
   Infrastructure
```

Notes 예제:
- Web/PWA: localStorage
- Tauri: @tauri-apps/plugin-store

## AI Coding

AI에게 작업시키기 전에:

- `AGENTS.md`
- `ARCHITECTURE.md`
- `DECISIONS.md`

를 읽게 하세요.

권장 MCP는 `mcp_config.example.json`에 포함되어 있습니다.

## Artifacts

기본:
- web-pwa
- windows-x64-installers
- android-debug-apk
- ios-unsigned

서명 활성화:
- android-release-signed
- ios-signed-ipa

iOS 실기기/App Store 배포와 Android Play Store용 release에는 지속적인 코드서명 키가 필요합니다.
