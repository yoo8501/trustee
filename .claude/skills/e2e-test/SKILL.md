---
name: e2e-test
invocable: true
description: |
  Playwright MCP 기반 프론트엔드 E2E 화면 테스트.
  모든 페이지의 UI 구조, 폼 유효성, 네비게이션, 인터랙션을 검증한다.
  Triggers: e2e 테스트, 화면 테스트, screen test, UI 테스트, 페이지 테스트
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Write
  - mcp__playwright__browser_navigate
  - mcp__playwright__browser_snapshot
  - mcp__playwright__browser_take_screenshot
  - mcp__playwright__browser_click
  - mcp__playwright__browser_type
  - mcp__playwright__browser_fill_form
  - mcp__playwright__browser_press_key
  - mcp__playwright__browser_hover
  - mcp__playwright__browser_select_option
  - mcp__playwright__browser_evaluate
  - mcp__playwright__browser_console_messages
  - mcp__playwright__browser_network_requests
  - mcp__playwright__browser_wait_for
  - mcp__playwright__browser_tabs
  - mcp__playwright__browser_navigate_back
  - mcp__playwright__browser_close
  - mcp__playwright__browser_resize
  - mcp__playwright__browser_drag
  - mcp__playwright__browser_file_upload
  - mcp__playwright__browser_handle_dialog
  - mcp__playwright__browser_run_code
  - mcp__playwright__browser_install
---

# E2E Test Skill - Playwright MCP 기반 범용 프론트엔드 화면 테스트

## 사용법

```
/e2e-test                          # 대화형: 테스트 대상 페이지를 물어봄
/e2e-test /login                   # 특정 경로 테스트
/e2e-test /trustees                # 수탁사 목록 페이지 테스트
/e2e-test /trustees/new            # 수탁사 등록 폼 테스트
/e2e-test /trustees /contracts     # 여러 페이지 테스트
/e2e-test auth                     # 프리셋: 인증 관련 전체 (login, signup, forgot-password, reset-password)
/e2e-test dashboard                # 프리셋: 대시보드 관련 전체
```

## 사전 조건

1. 개발 서버가 실행 중이어야 한다 (`pnpm dev` → `http://localhost:3000`)
2. 서버가 실행 중인지 먼저 `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` 으로 확인
3. 실행 중이 아니면 사용자에게 `pnpm dev` 실행을 안내한다

## 기본 URL

```
BASE_URL = http://localhost:3000
```

## 스크린샷 저장

- 각 테스트 시나리오 완료 시 스크린샷 촬영
- 저장 경로: `docs/test-results/e2e-screenshots/`
- 파일명 형식: `{페이지명}-{테스트명}.png` (예: `trustees-list-page-structure.png`)
- 테스트 시작 전 `mkdir -p docs/test-results/e2e-screenshots/` 실행

---

## 테스트 실행 절차

### 1단계: 대상 페이지 결정

인자가 있으면 해당 경로를 테스트한다.
인자가 없으면 사용자에게 테스트할 페이지 경로를 물어본다.

프리셋 키워드가 주어지면 관련 페이지 그룹을 자동으로 테스트한다:
- `auth` → `/login`, `/signup`, `/forgot-password`, `/reset-password`
- `dashboard` → `/`, `/trustees`, `/contracts`, `/inspections`

### 2단계: 페이지 분석 (자동 탐지)

각 대상 페이지에 대해:

1. `browser_navigate`로 페이지 이동
2. `browser_snapshot`으로 페이지 구조 캡처
3. snapshot 결과를 분석하여 페이지 유형 판별:

| 감지 요소 | 페이지 유형 | 실행할 테스트 |
|-----------|------------|--------------|
| form, input, button[type=submit] | **폼 페이지** | 구조 확인 + 폼 유효성 + 제출 테스트 |
| table, DataTable, 목록형 데이터 | **목록 페이지** | 구조 확인 + 테이블 검증 + 페이지네이션 + 필터/검색 |
| 상세 정보, 읽기 전용 필드 | **상세 페이지** | 구조 확인 + 데이터 표시 + 액션 버튼 |
| 차트, 통계, 카드 | **대시보드** | 구조 확인 + 위젯 표시 + 데이터 로딩 |
| 링크만 있는 간단한 페이지 | **안내 페이지** | 구조 확인 + 링크 검증 |

### 3단계: 테스트 실행

페이지 유형에 따라 아래 테스트 모듈을 조합하여 실행한다.

---

## 테스트 모듈

### M-01: 페이지 구조 확인 (모든 페이지 공통)

1. 대상 URL로 이동
2. `browser_snapshot`으로 페이지 구조 캡처
3. 확인 항목:
   - 페이지 제목/헤딩이 존재하는지
   - 주요 UI 요소(버튼, 입력필드, 링크, 테이블 등)가 렌더링되었는지
   - 레이아웃이 깨지지 않았는지 (사이드바, 헤더 등)
4. 스크린샷: `{페이지명}-page-structure.png`

### M-02: 폼 유효성 검증 (폼이 있는 페이지)

1. **빈 폼 제출**: 제출 버튼 클릭 → 유효성 에러 메시지 확인
2. **개별 필드 검증**: snapshot에서 발견된 각 입력 필드에 대해:
   - 필수 필드: 비워두고 제출 → 에러 메시지 확인
   - 이메일 필드: 잘못된 형식 입력 → 에러 확인
   - 비밀번호 필드: 규칙 미달 입력 → 에러 확인
   - 숫자 필드: 문자 입력 → 에러 확인
   - 날짜 필드: 잘못된 날짜 → 에러 확인
3. **비밀번호 토글**: 비밀번호 필드가 있으면 표시/숨기기 토글 테스트
4. 스크린샷: `{페이지명}-form-validation.png`, `{페이지명}-empty-form-errors.png`

### M-03: 테이블/목록 검증 (목록 페이지)

1. 테이블 헤더 컬럼 확인
2. 데이터 행이 표시되는지 확인 (또는 "데이터 없음" 메시지)
3. 페이지네이션 존재 시:
   - 페이지 이동 동작 확인
   - 페이지당 행 수 변경 확인
4. 검색/필터 존재 시:
   - 검색어 입력 → 결과 반영 확인
   - 필터 선택 → 결과 반영 확인
5. 행 클릭 시 상세 페이지 이동 확인
6. 스크린샷: `{페이지명}-table-data.png`

### M-04: 네비게이션 검증 (모든 페이지 공통)

1. 페이지 내 모든 링크/네비게이션 요소 탐지
2. 각 링크 클릭 → 올바른 URL로 이동하는지 확인 (`browser_evaluate`로 `window.location.pathname`)
3. 브라우저 뒤로가기 → 원래 페이지 복귀 확인
4. 사이드바/헤더 네비게이션이 있으면 각 항목 클릭 검증

### M-05: 인터랙션 검증 (동적 요소가 있는 페이지)

1. **버튼**: 클릭 가능한 버튼 동작 확인
2. **모달/다이얼로그**: 열기/닫기 동작 확인
3. **드롭다운/셀렉트**: 옵션 선택 동작 확인
4. **체크박스/라디오**: 토글 동작 확인
5. **탭**: 탭 전환 동작 확인
6. 스크린샷: `{페이지명}-interaction-{동작}.png`

### M-06: 콘솔 에러 확인 (모든 페이지 공통)

1. `browser_console_messages`로 error 레벨 메시지 확인
2. warning 레벨 중 중요한 것 확인 (예: React key 에러, deprecated API 등)
3. 예상치 못한 에러가 있으면 이슈로 기록

### M-07: 반응형 검증 (선택적 - 사용자 요청 시)

1. 데스크톱 (1280x720): `browser_resize` → snapshot → 스크린샷
2. 태블릿 (768x1024): `browser_resize` → snapshot → 스크린샷
3. 모바일 (375x667): `browser_resize` → snapshot → 스크린샷
4. 각 뷰포트에서 레이아웃 깨짐 확인
5. 스크린샷: `{페이지명}-desktop.png`, `{페이지명}-tablet.png`, `{페이지명}-mobile.png`

---

## 프리셋: auth (인증 페이지)

`/e2e-test auth` 실행 시 아래 시나리오를 순서대로 실행한다.

### TC-AUTH-01: 로그인 페이지 (`/login`)
- M-01: 구조 확인 (제목, 이메일/비밀번호 필드, 로그인 버튼, 소셜 로그인, 링크)
- M-02: 빈 폼 제출, 잘못된 이메일, 비밀번호 토글
- M-04: 회원가입 링크, 비밀번호 찾기 링크
- M-06: 콘솔 에러

### TC-AUTH-02: 회원가입 페이지 (`/signup`)
- M-01: 구조 확인 (이름/이메일/비밀번호/비밀번호 확인 필드, 회원가입 버튼)
- M-02: 빈 폼 제출, 비밀번호 불일치, 비밀번호 규칙(숫자/영문/최소길이)
- M-04: 로그인 링크
- M-06: 콘솔 에러

### TC-AUTH-03: 비밀번호 찾기 페이지 (`/forgot-password`)
- M-01: 구조 확인 (이메일 필드, 발송 버튼)
- M-02: 빈 폼 제출, 잘못된 이메일
- M-04: 로그인 링크
- M-06: 콘솔 에러

### TC-AUTH-04: 비밀번호 재설정 페이지 (`/reset-password`)
- M-01: 토큰 없이 접근 → 유효하지 않은 링크 안내 확인
- M-01: 토큰 있는 접근 (`?token=test`) → 폼 표시 확인
- M-02: 빈 폼 제출, 비밀번호 불일치
- M-04: 로그인 링크, 비밀번호 찾기 링크
- M-06: 콘솔 에러

### TC-AUTH-05: 인증 페이지 간 네비게이션
- 로그인 → 회원가입 → 로그인 → 비밀번호 찾기 → 로그인
- 비밀번호 재설정(토큰 없음) → 비밀번호 찾기
- 비밀번호 재설정(토큰 있음) → 로그인

---

## 결과 리포트 형식

테스트 완료 후 다음 형식으로 결과를 출력한다:

```
## E2E 테스트 결과 리포트

**테스트 일시**: YYYY-MM-DD HH:MM
**대상 URL**: http://localhost:3000
**테스트 범위**: [테스트한 페이지 경로 목록]

### 결과 요약

| 페이지 | 테스트 모듈 | 테스트 수 | 통과 | 실패 | 결과 |
|--------|------------|-----------|------|------|------|
| /login | M-01,M-02,M-04,M-06 | N | ? | ? | PASS/FAIL |
| /trustees | M-01,M-03,M-04,M-06 | N | ? | ? | PASS/FAIL |
| ... | ... | ... | ... | ... | ... |
| **합계** | | **N** | **?** | **?** | **?/?** |

### 발견된 이슈

| # | 페이지 | 모듈 | 심각도 | 설명 | 스크린샷 |
|---|--------|------|--------|------|----------|
| 1 | /path | M-XX | High/Medium/Low | 이슈 설명 | 파일명.png |

### 콘솔 에러

(에러가 있을 경우 페이지별 목록)

### 스크린샷 목록

저장 경로: `docs/test-results/e2e-screenshots/`

- `{페이지명}-page-structure.png`
- `{페이지명}-form-validation.png`
- ...
```

---

## 주의사항

- 각 테스트 케이스는 독립적으로 실행 (이전 상태에 의존하지 않음)
- 폼 입력 시 `browser_fill_form`이나 `browser_click` + `browser_type` 사용
- 유효성 검증 에러는 snapshot에서 텍스트로 확인
- 네비게이션 테스트는 `browser_evaluate`로 `window.location.pathname` 확인
- 에러가 발생해도 다음 테스트 케이스를 계속 진행
- 페이지에 데이터가 없을 수 있음 (빈 목록) → 이것은 에러가 아님
- snapshot 결과를 기반으로 테스트를 동적으로 구성 → 하드코딩된 텍스트에 의존하지 않음
- 프리셋(auth, dashboard)은 해당 페이지가 실제로 존재할 때만 실행
