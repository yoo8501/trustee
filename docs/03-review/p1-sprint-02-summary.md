# Sprint 2 — JWT 인증 + 사용자/팀 작업 요약

> 완료일: 2026-05-25
> Status: ✅ Done (전체 Done When 충족)
> Commits: `31cd061` → `631a61d` → `1ae0a56` (backend Red→Green→docs), `63797ca` → `060d4b8` (frontend Red→Green)

## 목표

JWT 인증 (access 1h + refresh 30d + token_version 즉시 무효화) + 사용자/팀 기본 CRUD + 권한 미들웨어. 도메인 (휴가/근태) 진입 직전 foundation.

## Backend 구현 (`/Users/seosangjun/docflow/backend/`)

### DB 스키마 (`internal/db/migrations/`)

**000002_users_teams**
- `user_role` ENUM 5단계: `general` / `team_lead` / `dept_head` / `hr_manager` / `super_admin`
- `user_status` ENUM 3단계: `active` / `inactive` / `terminated`
- `teams`: id, tenant_id, name, parent_team_id (self FK), team_lead_id, hr_manager_id (users 생성 후 ALTER FK 추가 — 상호 참조)
- `users`: 모든 필드 + UNIQUE(tenant_id, email) + token_version 컬럼 + work_start/end_time TIME default 09/18 + soft delete (deleted_at)
- `refresh_tokens`: jti UUID PK + user_id + expires_at + used_at (1회용 회전 추적)

**000003_seed_super_admin**
- `admin@docflow.local` / `admin1234!` (bcrypt cost 12 해시 hardcode, idempotent `ON CONFLICT`)

### Auth (`internal/auth/`)

- `jwt.go` — `github.com/golang-jwt/jwt/v5`, access(1h) + refresh(30d), claims에 sub/tenant_id/role/token_version/typ
- `password.go` — bcrypt cost 12
- `store.go` — `Store` 인터페이스 (sqlc Querier 부분 집합) — fakeStore 패턴으로 unit test 가능
- `service.go` — Register / Login / Refresh (1회용 회전 + reuse 감지 시 token_version+1) / Logout (token_version+1)
- `middleware.go` — `Required()` (token + token_version DB lookup), `RequireRole(...)`, `RequireAtLeast(...)`
- `handler.go` — `POST /api/auth/{register,login,refresh,logout}`

### Users (`internal/users/`)

- `GET /api/users/me`, `POST /api/users/list` (HR+), `POST /api/users/update` (super_admin only, role 변경 시 token_version+1로 강등 즉시 반영)
- self 강등 시도 → 400 + `CANNOT_DEMOTE_SELF`

### Teams (`internal/teams/`)

- `GET /api/teams/:id`, `POST /api/teams/list`, `POST /api/teams` (HR+), `update`, `delete` (soft)

### Permission (`internal/permission/`)

- `RoleAtLeast`, `IsHR`, `IsSuperAdmin` 헬퍼

### ErrorCode 추가 5종

| Code | HTTP | 의미 |
|------|------|------|
| `TOKEN_EXPIRED` | 401 | JWT 만료 |
| `CANNOT_DEMOTE_SELF` | 400 | 본인 role 강등 시도 |
| `USER_TERMINATED` | 400 | 퇴사 처리된 계정 로그인 |
| `EMAIL_DUPLICATE` | 400 | 회원가입 시 중복 이메일 |
| `INVALID_CREDENTIALS` | 400 | 로그인 시 이메일/비번 불일치 |

`/Users/seosangjun/docflow/context/error.md`에도 동시 반영 (CLAUDE.md §3.5).

### 테스트 (TDD)

- DB unit test: `fakeStore` 패턴 (각 패키지 내 `fakestore_test.go`) — testcontainers 없이 빠른 CI
- Coverage: `auth` 82.3%, `users` 84.4%, `teams` 88.7%, `permission` 100%, `server` 97.3% (모두 80% 목표 달성)
- 모든 패키지 `go test ./...` PASS

## Frontend 구현 (`/Users/seosangjun/docflow/frontend/`)

### lib/auth/

- `tokenStorage` — localStorage wrapper (key: `docflow-access-token`, `docflow-refresh-token`) + `onChange` (storage event 구독)
- `events.ts` — `docflow:auth:expired` CustomEvent 패턴 (http interceptor → AuthProvider)

### lib/api/http.ts (Sprint 1 확장)

- Token 자동 attach (`Authorization: Bearer`)
- 401 + `TOKEN_EXPIRED` → single-flight refresh queue → 원 요청 재시도
- refresh 실패 → tokenStorage.clear() + `docflow:auth:expired` 이벤트 dispatch
- `INVALID_CREDENTIALS`는 interceptor 통과 (form error로 흘림)

### features/auth/

- `schemas.ts` — Zod: LoginSchema, RegisterSchema (email format + password min 8 + 영문+숫자+특수 strength)
- `api/client.ts` — login/register/refresh/logout/me 호출 (모두 `lib/api/http` 경유)
- `context/AuthProvider.tsx` — current user + actions, useCurrentUser 자동 fetch, storage event 구독, expired 이벤트 구독 → navigate('/login')
- `components/LoginForm.tsx` / `RegisterForm.tsx` — RHF + Zod resolver, 비활성 버튼 + inline 사유 (UX §3 에러 예방), Cmd/Ctrl+Enter 제출, aria 속성
- `critical-path-1.test.tsx` — 회원가입 → 로그인 → 대시보드 진입 (MSW)
- `critical-path-6.test.tsx` — 토큰 만료 → 자동 refresh → 작업 지속 (사용자에게 에러 없음)

### components/

- `ProtectedRoute` — 미로그인 시 `/login` 리다이렉트
- `PublicOnlyRoute` — 이미 로그인 시 `/` 리다이렉트 (로그인/회원가입 페이지)

### routes/

- `/login`, `/register` 추가 (PublicOnly), `/` ProtectedRoute로 감싸기
- Root layout에 SnackbarProvider + AuthProvider 합성, 로그인 시 user name + role chip + 로그아웃 버튼 노출

### i18n 추가 키

- `login.*`, `register.*`, `auth.*` (logout, expired)
- `error.{TOKEN_EXPIRED, INVALID_CREDENTIALS, EMAIL_DUPLICATE, USER_TERMINATED, CANNOT_DEMOTE_SELF}`
- `error.field.{email.required, email.format, password.min, password.strength, name.required}`
- ko + en 양쪽 동일

### E2E (Playwright)

- `e2e/playwright.config.ts`, `critical-path-1.spec.ts`, `critical-path-6.spec.ts` 작성
- 실제 BE+DB 의존 흐름이므로 `E2E_BACKEND_URL` 환경 변수 없으면 auto-skip (CI 환경에서만 실행)
- Critical Path 1, 6은 Vitest + MSW 통합 테스트로 동등 검증 (frontend/CLAUDE.md §7: E2E는 critical path에만 권장, MSW로 통합 테스트 가능)

### 검증

- `bun run test` → 16 files / 70 tests PASS
- `bunx tsc --noEmit` exit 0
- `bun run lint` exit 0 (1 non-blocking react-refresh warning)
- `bun run build` exit 0 (777 kB / 244 kB gzip)
- `bunx playwright test --list` → 2 specs registered

## Done When 체크 (전부 ✅)

### Backend
- [x] User 테이블 (모든 필드)
- [x] Team 테이블
- [x] role enum 5단계
- [x] /api/auth/register (bcrypt 12)
- [x] /api/auth/login (access 1h + refresh 30d + token_version 포함)
- [x] /api/auth/refresh (1회용 회전 + reuse 감지)
- [x] /api/auth/logout (token_version+1)
- [x] /api/users/me
- [x] /api/users/list (HR+) + /update (super_admin only, role 변경)
- [x] /api/teams CRUD (HR+ 보호)
- [x] JWT 미들웨어 (token_version DB lookup, TOKEN_EXPIRED)
- [x] role + team scope 미들웨어
- [x] CANNOT_DEMOTE_SELF
- [x] coverage ≥ 80%

### Frontend
- [x] /login, /register
- [x] http interceptor (401 + TOKEN_EXPIRED → refresh → retry, INVALID_CREDENTIALS form pass-through)
- [x] AuthContext + useAuth
- [x] localStorage access + refresh
- [x] storage event multi-tab logout sync
- [x] Critical Path 1 (MSW 통합 테스트)
- [x] Critical Path 6 (MSW 통합 테스트)

### Cross
- [x] super_admin 시드 SQL

## TDD 검증 (commit 순서)

```
31cd061 test(sprint-2): JWT 인증 + User/Team CRUD 실패 테스트 (red)            ← BE Red
631a61d feat(sprint-2): JWT 인증 + User/Team CRUD 구현 (green)                  ← BE Green
1ae0a56 docs(error): Sprint 2 ErrorCode 추가                                     ← contract sync
63797ca test(sprint-2): frontend 인증 실패 테스트 추가 (red)                     ← FE Red
060d4b8 feat(sprint-2): frontend 인증 — /login /register, http 401 interceptor, AuthProvider, multi-tab sync (green)  ← FE Green
```

## 주요 결정

- **fakeStore 패턴**: testcontainers 대신 sqlc Querier 부분집합 인터페이스를 fake로 구현 → docker 의존 0, 빠른 CI. PostgreSQL 특수 동작(`pgconn.PgError{Code:"23505"}` 등)도 fake가 흉내. Sprint 후반 (Sprint 4+) 트랜잭션 의존 cron 작업 시 testcontainers 본격 도입 예정.
- **refresh 1회용 회전**: `refresh_tokens.jti` UUID PK + `UPDATE ... WHERE used_at IS NULL RETURNING`로 atomic 마킹. reuse 감지 시 token_version+1 → 모든 토큰 무효 (보안 사고 봉쇄).
- **role 강등 즉시 반영**: users.Update가 role 변경 시 자동으로 token_version+1 → 기존 access 토큰도 다음 요청에서 401.
- **JWT secret 운영 안전**: prod/staging에서 JWT_SECRET 누락 시 main fatal. dev만 fallback 허용.
- **다른 탭 로그아웃 sync**: `storage` event 구독 (현재 탭의 localStorage 변경은 trigger 안 됨 — 정확히 다른 탭만). AuthProvider에서 access 토큰 사라지면 user를 null로 → 다음 API 호출 자연 401.
- **E2E**: Playwright spec 작성하되 백엔드 실 의존 환경 변수로 분기. Sprint 2 단계에서는 MSW 통합 테스트로 동일 검증 (UX 흐름 + interceptor + storage sync 모두 커버).

## 다음 sprint

Sprint 3 — 휴가 종류 / 잔여 + 공휴일 + 연차 발생 cron.
