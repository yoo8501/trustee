# Sprint 1 — Foundation 작업 요약

> 완료일: 2026-05-25
> Status: ✅ Done (전체 Done When 충족)
> Commits: `579bed6` → `b1c38c5` (backend Red→Green), `c302add` → `704c4e5` (frontend Red→Green)

## 목표 (요약)

모노레포 BE + FE 부트스트랩, 공통 contract (`ApiResult`, ErrorCode) 골격, 라이트/다크 테마 토글. 도메인 코드 없음.

## 구현 결과

### Backend (`/Users/seosangjun/docflow/backend/`)

**기술 스택 채택**
- Go 1.26 + Gin
- PostgreSQL 16 + sqlc 1.30 + golang-migrate 4.19
- 표준 `testing` + `testify`
- 구조화 로그 `slog` (JSON handler)

**주요 산출물**

| 영역 | 위치 | 핵심 내용 |
|------|------|-----------|
| Envelope | `internal/httpx/apiresult/` | `Envelope[T]`, `Success/SuccessList/Failure` 헬퍼. `Failure("")` 호출은 panic으로 contract 위반 차단 |
| ErrorCode | `internal/httpx/errorcode/` | 9종 (`INTERNAL_ERROR`, `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `EXTERNAL_SERVICE_ERROR`, `INVALID_REQUEST`) |
| 미들웨어 | `internal/httpx/middleware/` | `requestid` (UUID v4 echo), `tenant` (default=1), `logger` (slog + request_id 포함), `recover` (panic → 500 + INTERNAL_ERROR) |
| 진입점 | `cmd/api/main.go` + `internal/server/server.go` | Gin engine + 4 미들웨어 + `GET /health` + `GET /debug/error` |
| DB | `internal/db/{migrations,queries,sqlc}/` | `000001_init` up/down (빈 마이그레이션), trivial `placeholder.sql` (sqlc 부트 검증용 `Ping :one`) |
| 컨테이너 | `Dockerfile` + `docker-compose.yml` | multi-stage build (golang:1.26-alpine → alpine), postgres:16-alpine + api 서비스 |

**검증**
- `go test ./...` → PASS, coverage:
  - `internal/config` 100%
  - `internal/httpx/apiresult` 88.9%
  - `internal/httpx/middleware` 86.4%
  - `internal/server` 92.9%
  - → 모든 `internal/*` 80% 목표 통과
- 실제 binary 기동 → `GET /health` 200 + envelope, `GET /debug/error` 500 + envelope, `X-Request-ID` echo, slog JSON 로그 정상

### Frontend (`/Users/seosangjun/docflow/frontend/`)

**기술 스택 채택**
- React 19 + Vite 6 + TypeScript strict
- React Router v7 (declarative `createBrowserRouter`)
- MUI 6 + Emotion
- TanStack Query 5
- i18next 24 + react-i18next
- Vitest 2 + Testing Library + MSW 2
- ESLint 9 flat config (`no-explicit-any`: error)
- Bun (개발/테스트) — `bun run test` 항상 vitest 경유

**주요 산출물**

| 영역 | 위치 | 핵심 내용 |
|------|------|-----------|
| http client | `src/lib/api/{types,error,http,index}.ts` | envelope 전체 파싱, `success===true && data!==null`만 통과, 실패는 `ApiError` throw (status + errorCode + fields 보존) |
| Theme | `src/lib/theme/` | DESIGN.md 색상 토큰 light/dark 두 팔레트, MUI `createTheme(mode)`, `<html data-theme>` + `localStorage('docflow-theme')` 동기화, `prefers-color-scheme` 감지 |
| FOUC 차단 | `index.html` head inline script | localStorage + prefers-color-scheme 사전 적용 |
| i18n | `src/lib/i18n/` | ko + en 11+ 키 (`app.*`, `nav.*`, `route.*`, `healthz.*`, `error.*`), `resolveErrorMessage(error, t)` 헬퍼 |
| Routing | `src/routes/{root,home,login,healthz,not-found}.tsx` + `index.ts` | `/`, `/login`, `/healthz`, `*` 4 라우트, Root layout (Header + ThemeToggle + Outlet) |
| Health 페이지 | `src/routes/healthz.tsx` | TanStack Query `useQuery` → `/api/health`, 5상태 처리 |
| Vite proxy | `vite.config.ts` | `/api/* → http://localhost:8080` |

**테스트 (20개 / 7 파일)**
- `lib/api/error.test.ts` (2) — ApiError 필드 보존
- `lib/api/http.test.ts` (4) — MSW로 envelope 성공/실패/null/JSON 오류
- `lib/i18n/i18n.test.ts` (3) — 리소스 키 검증
- `lib/i18n/resolveErrorMessage.test.ts` (4) — errorCode→i18n 키 / fallback
- `lib/theme/theme.test.ts` (3) — light/dark palette 매핑
- `components/ThemeToggle.test.tsx` (2) — 토글 + data-theme + localStorage + aria-label i18n
- `routes/healthz.test.tsx` (2) — MSW success/error UI

**검증**
- `bun run test` → 20/20 PASS
- `bunx tsc --noEmit` → exit 0
- `bun run lint` → 0 errors, 0 warnings
- `bun run build` → dist 생성 (577.6 kB / 183.7 kB gzip)

## Done When 체크 (전부 ✅)

### Backend
- [x] `go test ./...` exit 0
- [x] golang-migrate up/down 양방향
- [x] `sqlc generate` 결과 commit, drift 없음
- [x] `GET /health` → 200 + ApiResult{success:true, data:{status:"ok"}, message:"ok"}
- [x] `GET /debug/error` → 500 + ApiResult 실패
- [x] 미들웨어 4종 (request_id, tenant, logger, recover)
- [x] ErrorCode enum 골격
- [x] Dockerfile + docker-compose
- [x] README 부팅 절차

### Frontend
- [x] `bun install && bun run build` 통과
- [x] `tsc --noEmit` exit 0
- [x] `eslint .` exit 0
- [x] React Router v7 4 라우트
- [x] MUI 라이트/다크 두 팔레트
- [x] 다크 토글 + localStorage + prefers-color-scheme 우선순위
- [x] FOUC 없음 (inline script)
- [x] i18next ko + en
- [x] TanStack Query `/api/health` → /healthz 표시
- [x] Vite dev proxy
- [x] `lib/api/` 공통 http client
- [x] 폴더 구조

### Cross
- [x] reverse proxy dev (Vite proxy)
- [x] BE+FE README 부팅 절차

## TDD 검증 (commit 순서)

```
579bed6 test(sprint-1): backend foundation 실패 테스트 추가 (red)        ← BE Red
b1c38c5 feat(sprint-1): backend foundation 구현 — ... (green)            ← BE Green
c302add test(sprint-1): frontend foundation 실패 테스트 추가 (red)       ← FE Red
704c4e5 feat(sprint-1): frontend foundation 구현 — ... (green)           ← FE Green
```

`git log --oneline` 으로 Red → Green 순서 검증 가능.

## 주의 / 결정 사항

- **다크 토큰을 자체 정의함** — DESIGN.md는 P1 다크 미포함이지만 Sprint 1 Done When이 "다크 두 팔레트"를 요구하므로 hue 유지 + 밝기 보정 원칙으로 직접 매핑 (frontend/CLAUDE.md §3.10 기준).
- **sqlc trivial query** — sqlc는 query 0개를 거부하므로 `placeholder.sql`에 `Ping :one` 추가. Sprint 2 이후 도메인 query로 대체 가능.
- **bun vs vitest 충돌** — `bun test`는 bun 자체 runner를 호출하므로 항상 `bun run test`로 vitest 경유.
- **tsconfig.node.json** — vitest 자체 vite 사본과 충돌 회피를 위해 include를 `vite.config.ts`로만 좁힘.

## 다음 sprint

Sprint 2 — 인증 + 사용자/팀 (JWT access 1h + refresh 30d + token_version, User/Team CRUD, /login + /register, http interceptor 401→refresh→재시도).
