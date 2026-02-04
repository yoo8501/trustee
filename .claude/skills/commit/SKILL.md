---
name: commit
invocable: true
description: |
  Git 커밋 생성 전문가.
  변경사항 분석 후 컨벤션에 맞는 커밋 생성.
  Triggers: 커밋해줘, commit, 커밋, 변경사항 저장
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# Commit Skill

## 커밋 메시지 형식

```
<type>(<scope>): <subject>

<body>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

## Type (필수)

| type | 설명 | 예시 |
|------|------|------|
| feat | 새 기능 추가 | `feat(trustee): 수탁사 목록 페이지 구현` |
| fix | 버그 수정 | `fix(api): 페이지네이션 오프셋 계산 오류 수정` |
| refactor | 리팩토링 (기능 변경 없음) | `refactor(hooks): useTrustees 쿼리 키 구조 개선` |
| style | 코드 포매팅, 세미콜론 등 | `style(web): ESLint 경고 수정` |
| docs | 문서 변경 | `docs: ARCHITECTURE.md 서비스 구조 업데이트` |
| test | 테스트 추가/수정 | `test(trustee): 수탁사 CRUD API 테스트 추가` |
| chore | 빌드, 설정 변경 | `chore: pnpm lockfile 업데이트` |
| perf | 성능 개선 | `perf(db): 수탁사 목록 쿼리 인덱스 추가` |

## Scope (선택, 권장)

모노레포 패키지 또는 서비스명 사용:
- `web` - apps/web (프론트엔드)
- `gateway` - services/gateway
- `trustee` - services/trustee
- `inspection` - services/inspection
- `ui` - packages/ui
- `types` - packages/types
- `common` - packages/common
- `proto` - packages/proto
- `db` - packages/database 또는 prisma 관련
- `config` - packages/config

여러 패키지에 걸친 변경이면 scope 생략 가능.

## Subject (필수)

- 한국어로 작성
- 명령형 어투 ("추가", "수정", "구현", "삭제", "변경")
- 50자 이내
- 마침표 없음
- "무엇을 했는지"가 아니라 "무엇이 변경되는지" 관점

**좋은 예:**
- `feat(trustee): 수탁사 등록 폼 구현`
- `fix(gateway): gRPC 타임아웃 에러 핸들링 추가`
- `refactor(web): API 클라이언트 에러 처리 통합`

**나쁜 예:**
- `수탁사 관련 코드 수정` (type 없음, 모호함)
- `feat: updated trustee page` (영어, 과거형)
- `feat(trustee): 수탁사 등록 폼을 React Hook Form과 Zod를 사용하여 구현했습니다.` (너무 김)

## Body (선택, 변경이 클 때 권장)

- 빈 줄로 subject와 분리
- 변경사항을 `-` 불릿 포인트로 나열
- "왜" 변경했는지 맥락 포함
- 영향받는 파일/모듈 언급

```
feat(trustee): 수탁사 CRUD API 구현

- TrusteeRepository: Prisma 기반 데이터 접근 계층
- TrusteeService: 비즈니스 로직 (중복 사업자번호 검증)
- TrusteeController: Express 요청 핸들러
- Zod 스키마로 입력 유효성 검증
- RabbitMQ 이벤트 발행 (trustee.created/updated/deleted)
```

## 커밋 실행 절차

1. `git status`로 변경된 파일 확인 (민감 파일 .env 등 제외)
2. `git diff --staged`와 `git diff`로 변경 내용 파악
3. `git log --oneline -5`로 최근 커밋 스타일 참고
4. 변경사항 분석:
   - 어떤 패키지/서비스가 영향받는지 → scope 결정
   - 새 기능 / 버그 수정 / 리팩토링 → type 결정
   - 핵심 변경 요약 → subject 작성
5. 관련 파일만 선택적으로 `git add` (git add -A 지양)
6. 커밋 생성 (HEREDOC 사용)

```bash
git add apps/web/src/app/\(dashboard\)/trustees/
git add apps/web/src/hooks/useTrustees.ts

git commit -m "$(cat <<'EOF'
feat(web): 수탁사 목록 페이지 구현

- DataTable 컴포넌트로 수탁사 목록 표시
- 검색, 상태 필터, 페이지네이션 지원
- useTrustees 훅으로 React Query 연동

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

## 커밋 분리 기준

하나의 커밋은 하나의 논리적 변경 단위를 담는다:
- API 라우트 + 해당 컨트롤러/서비스/레포지토리 → 1커밋
- 프론트 페이지 + 해당 훅 → 1커밋
- 공유 패키지 변경 (types, ui, common) → 별도 커밋
- 설정 변경 (eslint, tsconfig) → 별도 커밋

**분리해야 하는 경우:**
```
# 좋음: 백엔드와 프론트를 분리
git commit -m "feat(trustee): 수탁사 CRUD API 구현"
git commit -m "feat(web): 수탁사 목록 페이지 구현"

# 나쁨: 전부 한 커밋에
git commit -m "feat: 수탁사 기능 구현"
```

## 주의사항

- 커밋 전 `pnpm -r type-check` 통과 확인 권장
- pre-commit hook 실패 시 --amend 하지 않고 새 커밋 생성
- .env, credentials, node_modules 등 민감/불필요 파일 커밋 금지
- `git add -A` 대신 파일 지정 add 사용
