# AI Task Template

목표:
<한 문장>

수정 허용 범위:
- src/features/<feature>/**
- 필요한 shared 파일 최소 범위

수정 금지:
- 다른 feature의 공개 contract
- Tauri capability 확대 (별도 승인 없이는 금지)

완료 조건:
- 기능 동작
- 타입 오류 없음
- 테스트 추가/수정
- npm run check 통과

구현 원칙:
- AGENTS.md 준수
- 기존 패턴 재사용
- UI에 플랫폼 API 직접 호출 금지
