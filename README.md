# taurin4

GitHub `js603/taurin4` 용으로 사전 설정된 Tauri v2 + React + TypeScript + Vite 멀티플랫폼 기본 설계입니다.


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

## Preserved preview branch

`main`은 `595b799`의 Taurin4 기본 앱을 복원한 개발 기준선입니다. 기존 실험 작업은
`submain`에 보존되며 `https://js603.github.io/taurin4/submain/`에서 별도로 배포됩니다.
루트 Pages 주소에는 `main`의 기본 앱만 배포됩니다.
