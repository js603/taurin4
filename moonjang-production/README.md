# 문장가 (MOONJANG-GA) 1.0

좋은 문장을 남기고, 발견하고, 간직하는 Android/iOS 글쓰기 커뮤니티입니다.

## Release scope: Phase 0–4

- 오늘 Feed / 신규 작성자 노출 보호
- 발견 / 오래 읽힌 문장 / 편집부 / 우연히 발견
- 문장·글 작성, 기기 SQLite + 서버 Draft 자동 저장
- 간직하기, 개인/공개 서랍
- 계속 읽기, 프로필, 다른 글 탐색
- 한마디
- 검색
- 알림
- 나의 기록(독자/간직/교차 읽기)
- Long-tail/Revisit 기반 Reputation 표시
- 신고·차단
- SQLite 개발/내부테스트 서버
- Cloudflare Workers + D1 운영 백엔드
- Android/iOS Tauri v2 빌드

기업 탐색, 제안, 견적, 결제, 광고, Paid Boost, 작가 랭킹은 포함하지 않습니다.

## 내부 테스트

### 1. SQLite API 실행

```bash
python server/local_sqlite_server.py --host 0.0.0.0 --port 8787
```

Android/iOS 앱의 `설정 > API 서버 주소`에 같은 Wi‑Fi의 PC 주소를 입력합니다.

```text
http://192.168.x.x:8787
```

내부 테스트 APK는 cleartext LAN 접속을 허용하도록 CI에서 debug manifest를 패치합니다. Store release 빌드는 HTTPS API만 사용합니다.

### 2. API 자체 검증

```bash
python server/smoke_test.py
```

### 3. WebView E2E

```bash
npm ci
npx playwright install chromium
python server/local_sqlite_server.py --db /tmp/moonjang-e2e.db --port 8787 &
npm run e2e
```

## Production backend: Cloudflare D1

`cloudflare/` 참고. 무료 한도를 넘을 때 자동 과금으로 전환되지 않도록 Cloudflare Free Plan과 Billing 설정을 유지하고, 운영 지표를 확인하세요.

## Mobile builds

GitHub Actions `Moonjang Mobile Release`가 다음을 생성합니다.

- `moonjang-android-debug-apk`: 내부 테스트용 설치 APK
- `moonjang-ios-unsigned`: unsigned IPA/XCArchive

iOS 실기기 설치 및 App Store 제출에는 사용자의 Apple Developer 인증서/Provisioning Profile로 서명해야 합니다. CI는 해당 비밀키가 등록된 경우 signed IPA도 만들 수 있도록 확장 가능합니다.
