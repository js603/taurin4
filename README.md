# MAFIA · taurin4 · submain

`submain`은 Dimma Davidoff의 Original Mafia 규칙을 디지털 게임으로 구현하는 개발 브랜치입니다.

기존 Tauri v2 멀티플랫폼 베이스는 유지합니다.

- Web / PWA
- Windows
- Android
- iOS
- React + TypeScript + Vite
- Tauri v2

## Original Rules Lock

이 모드는 변형 마피아가 아닙니다.

- Mafia vs Honest 두 진영만 사용
- 경찰/의사/보안관/특수직업 없음
- Mafia만 서로의 정체를 앎
- 사망자의 진영은 라운드 종료까지 공개하지 않음
- 낮에는 자유 토론과 고발
- 피고를 제외한 생존자의 과반으로 제거
- Mafia Night는 자동 시작이 아니라 생존자 과반 동의가 필요
- Night에는 Honest는 HONEST 쪽지, Mafia는 표적 이름을 제출
- 살아 있는 모든 Mafia가 같은 표적을 적어야 살인이 성립
- Night의 이름 쪽지 수로 살아 있는 Mafia 수가 공개됨
- 마지막 Mafia를 낮에 제거해도 즉시 승리하지 않음
- 다음 Mafia Night에서 총성 0이 확인되어야 Honest 승리
- 모든 Honest가 제거되면 Mafia 승리

상세 규칙과 구현 의도:

- [Original Mafia GDD](docs/mafia/ORIGINAL_MAFIA_GDD.md)
- [GPT Asset Generation Prompts](docs/mafia/ASSET_GENERATION_PROMPTS.md)

## Current Vertical Slice

현재 `submain`에는 다음이 구현되어 있습니다.

- 6–16명 Original Mafia 배역 배분
- 비밀 역할 확인
- Sunrise 의식
- 자유 Day
- 고발자 / 피고 선택
- 피고 변론 이후 비밀 표결
- 피고 제외 과반 판정
- 제거 후 정체 비공개
- Mafia Night 제안 및 과반 표결
- 개인별 비밀 쪽지
- Mafia 전원 표적 일치 여부 판정
- Night 총성 수 공개
- 원작 승리조건
- 공개 정보만 기록하는 Chronicle
- 모바일/데스크톱 반응형 다크 시네마틱 UI
- 룰 핵심 unit test

## Tension Layer

룰을 바꾸지 않고 다음 연출만 강화합니다.

- 심장박동
- 비밀 카드 봉인/공개
- 패스-디바이스 전환
- 투표 직전 긴장 연출
- 종이 쪽지 의식
- Night 결과 공개 연출
- 공개 기록
- 사망자 정체 미공개를 강조하는 UI

새 정보, 새 능력, 새 승리조건은 Original Rules 모드에 추가하지 않습니다.

## Local

```bash
npm install
npm run dev
```

검증:

```bash
npm run check
```

## Branch CI

`submain`에 Push할 때:

- lint
- unit tests
- existing core tests
- Web build
- `submain-web-preview` artifact

를 자동 생성합니다.

정식 멀티플랫폼 산출물과 GitHub Pages 배포는 기존 `main`의
`.github/workflows/build-all.yml` 정책을 유지합니다.

## Repository

- GitHub: https://github.com/js603/taurin4
- Development branch: `submain`
- Production/base branch: `main`

## AI Coding Contract

수정 전 다음 문서를 확인합니다.

- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/mafia/ORIGINAL_MAFIA_GDD.md`

Original Rules 모드에서는 게임 규칙을 변경하는 기능 제안을 구현하지 말고,
별도의 Variant 모드로 분리합니다.
