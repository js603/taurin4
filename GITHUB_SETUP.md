# GitHub Actions / Pages Setup

이 프로젝트는 아래 GitHub 저장소를 기준으로 사전 설정되어 있습니다.

- Owner: `js603`
- Repository: `taurin4`
- Remote: `https://github.com/js603/taurin4.git`
- Pages: `https://js603.github.io/taurin4/`

## 목표

```text
main Push
  ├─ Quality Gate
  ├─ Web/PWA -> downloadable artifact
  ├─ GitHub Pages -> automatic deploy
  ├─ Windows -> MSI + NSIS setup EXE
  ├─ Android -> installable debug APK
  │             + optional signed APK/AAB
  └─ iOS -> unsigned IPA/archive
            + optional signed IPA
```

## 1. Push

```bash
git init
git add .
git commit -m "Initial taurin4"
git branch -M main
git remote add origin https://github.com/js603/taurin4.git
git push -u origin main
```

## 2. GitHub Pages

Repository:

`Settings -> Pages -> Build and deployment -> Source -> GitHub Actions`

Workflow가 repository 이름을 기준으로 Vite `base`, PWA `start_url`, `scope`를 자동 설정합니다.

일반 project repository의 Pages 주소:

`https://js603.github.io/taurin4/`

## 3. Secrets 없이 생성되는 Artifact

- `web-pwa`
- `windows-x64-installers`
- `android-debug-apk`
- `ios-unsigned`

다운로드:

`Actions -> Build All + Deploy Pages -> Run -> Artifacts`

Windows installer는 코드서명 전이므로 SmartScreen 경고가 표시될 수 있습니다.

Android debug APK는 실제 테스트 단말 설치용입니다.

iOS는 Apple 정책상 실기기 설치 및 App Store 배포에 코드서명이 필수입니다.
Secret이 없을 때는 unsigned iOS 산출물을 생성합니다.

## 4. Android signed APK/AAB

Actions Secrets:

- `ANDROID_KEY_BASE64`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_STORE_PASSWORD`

Actions Variable:

- `ANDROID_SIGNING_ENABLED` = `true`

Windows PowerShell base64:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("upload-keystore.jks"))
```

설정 후 `android-release-signed` artifact가 추가됩니다.

## 5. iOS signed IPA

필요 사항:

- Apple Developer Program
- `tauri.conf.json` identifier와 동일한 registered Bundle ID
- Apple Distribution certificate
- App Store Connect provisioning profile

Actions Secrets:

- `IOS_CERTIFICATE`
- `IOS_CERTIFICATE_PASSWORD`
- `IOS_MOBILE_PROVISION`
- `APPLE_DEVELOPMENT_TEAM` (권장)

Actions Variable:

- `IOS_SIGNING_ENABLED` = `true`

`.p12`와 `.mobileprovision`은 base64 문자열로 저장합니다.

설정 후 `ios-signed-ipa` artifact가 추가됩니다.

## 6. 반드시 변경할 값

`src-tauri/tauri.conf.json`

```json
{
  "productName": "중세재판",
  "identifier": "com.js603.taurin4",
  "version": "0.1.0"
}
```

## 7. Workflow

- `.github/workflows/build-all.yml`: main Push 전체 파이프라인
- `.github/workflows/pull-request.yml`: PR lint/test/web build
