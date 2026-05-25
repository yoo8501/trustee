# DocFlow Backend (Go + Gin)

> 본 파일은 backend stack 라우터. 루트 [`../CLAUDE.md`](../CLAUDE.md) §3 공통 절대 규칙은 항상 우선한다.
> 공유 contract: [`../context/api.md`](../context/api.md), [`../context/error.md`](../context/error.md).

---

## 1. 기술 스택

- **언어/프레임워크**: Go (latest stable) + Gin
- **DB**: PostgreSQL + sqlc + golang-migrate
- **인증**: JWT 직접 구현 (`golang-jwt/jwt/v5`)
- **스케줄러**: `robfig/cron/v3`
- **테스트**: 표준 `testing` + `testify` + testcontainers-go
- **로깅**: 구조화 로그 (`slog` 권장)

---

## 2. 디렉토리 규칙 (제안)

```
backend/
├── cmd/api/                   진입점 (main.go)
├── internal/
│   ├── handler/               Gin 핸들러 (HTTP layer)
│   ├── service/               비즈니스 로직
│   ├── repository/            DB 접근 (sqlc 생성 코드 wrap)
│   ├── db/
│   │   ├── queries/           sqlc 입력 *.sql
│   │   ├── migrations/        golang-migrate
│   │   └── sqlc/              sqlc 생성 코드 (gitignore X, 커밋 함)
│   ├── domain/                도메인 모델/엔티티
│   ├── httpx/                 ApiResult 헬퍼, 미들웨어
│   ├── auth/                  JWT 발급/검증
│   ├── cron/                  스케줄러 등록
│   └── config/                env 로딩
└── go.mod
```

`internal/` 외부에서 import 금지 (Go 표준 패턴).

---

## 3. 절대 규칙 (Backend 한정)

1. **응답은 `ApiResult<T>` 헬퍼만 사용**. `gin.H{}` / `map[string]any{...}` / `c.JSON(status, struct)` 직접 반환 **금지**.
   ```go
   c.JSON(http.StatusOK,         apiresult.Success(data))
   c.JSON(http.StatusOK,         apiresult.SuccessList(items, total))
   c.JSON(http.StatusBadRequest, apiresult.Failure("입력값을 확인해 주세요", &httpx.ErrorDetails{
       ErrorCode: "VALIDATION_FAILED",
       Fields:    fieldErrors,
   }))
   ```
2. **HTTP method 규칙** (`context/api.md` §3): GET=단건 조회, POST=목록/등록/수정/삭제/상태 변경. **PUT/PATCH/DELETE 사용 금지**.
3. **errorCode는 enum 재사용 우선** (`context/error.md` §1). 신규 코드 추가 시 양쪽 문서 + frontend 동시 반영.
4. **모든 쿼리에서 `tenant_id` WHERE 절 명시**. 현재 `tenant_id = 1` 고정이라도 누락 금지 (P4 이후 RLS 활성 시 안전).
5. **결재 status 컬럼은 `approvals` 테이블에만**. `leave_requests` 등 하위 문서 테이블에 status 두지 않는다.
6. **응답에 stack trace / SQL / secret / raw exception message 노출 금지**. 모두 로그/Sentry로만.
7. **시간은 KST 단일 가정**. DB는 `TIMESTAMPTZ`, 비교/계산 시 `time.LoadLocation("Asia/Seoul")` 명시.

---

## 4. DB / sqlc 규칙

- SQL은 `internal/db/queries/*.sql`, `sqlc generate`로 Go 생성. 손으로 SQL 문자열 빌드 금지.
- 마이그레이션은 `internal/db/migrations/{NNN}_{name}.up.sql` + `.down.sql`. 항상 롤백 가능한 단위.
- 모든 테이블 공통 컬럼: `id BIGSERIAL PK`, `tenant_id BIGINT NOT NULL DEFAULT 1`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- soft delete 도메인은 `deleted_at TIMESTAMPTZ`, 모든 쿼리에서 `deleted_at IS NULL` 필터.
- 트랜잭션은 service layer에서 시작/커밋. handler가 직접 tx 다루지 않는다.

---

## 5. 핸들러 패턴

```go
func (h *LeaveHandler) Create(c *gin.Context) {
    var req CreateLeaveRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, apiresult.Failure("요청 형식이 잘못되었습니다.", &httpx.ErrorDetails{
            ErrorCode: "INVALID_REQUEST",
        }))
        return
    }

    userID := auth.UserIDFrom(c)  // JWT 미들웨어에서 주입
    leave, err := h.svc.Create(c.Request.Context(), userID, req)
    if err != nil {
        apiresult.WriteError(c, err)  // 도메인 에러 → ErrorCode 매핑
        return
    }
    c.JSON(http.StatusCreated, apiresult.Success(leave))
}
```

- 입력 검증은 `validator/v10` 태그 또는 service 진입에서. 검증 실패는 `VALIDATION_FAILED` + `fields[]`.
- 도메인 에러는 sentinel error (`var ErrLeaveBalanceInsufficient = errors.New(...)`) → 미들웨어/헬퍼에서 ErrorCode 매핑.

---

## 6. Cron / 스케줄러

- 매일 **KST 00:00** 출퇴근 자동 마감.
- 매월 1일 **KST 02:00** 월차 적립.
- 5년 경과 근태/사용자 데이터 정리 cron (보관 정책 강제).
- 모든 cron job은 `internal/cron/` 에 등록, 실행 시작/종료 + 처리 건수 구조화 로그.
- 실패 시 alert 발송 (P2 이후 이메일, 현재는 로그 + Sentry).

---

## 7. 테스트 규칙

### TDD 강제 ([`../CLAUDE.md`](../CLAUDE.md) §3.11)

- **Red → Green → Refactor**. 실패하는 테스트를 먼저 commit, 그 후 구현을 별도 commit. PR review 시 commit 순서로 검증 가능.
- 신규 핸들러 / service / repository / cron job은 테스트 없는 PR 차단.
- 버그 수정: 버그를 재현하는 실패 테스트를 먼저 추가 → fail 확인 → fix → green 확인.
- Coverage 목표: `internal/*` ≥ **80%**, 결재 상태 전이 / 권한 분기 / cron advisory lock 등 critical path는 100%.
- Table-driven test 권장: 같은 핸들러의 success / `VALIDATION_FAILED` / 403 / 409 / 5xx를 한 테스트 함수에 묶기.

### 인프라

- `go test ./...` 통과 필수.
- DB 의존 테스트는 testcontainers 또는 docker-compose 테스트 DB. SQLite mock 금지 (Postgres-only 기능 사용).
- Handler 테스트는 `ApiResult` envelope 기준으로 단정. raw body 직접 단정 금지.
  ```go
  var res apiresult.Envelope[LeaveResponse]
  json.Unmarshal(w.Body.Bytes(), &res)
  assert.True(t, res.Success)
  assert.Equal(t, "VALIDATION_FAILED", res.Details.ErrorCode)
  ```
- 결재 상태 전이: 각 도메인에 invalid transition 케이스 1개 이상 (예: 이미 승인된 결재를 재승인 시도 → `APPROVAL_INVALID_STATE`).
- 새 핸들러 작성 시 success + 대표 failure(`VALIDATION_FAILED` 등) 케이스 동시 작성.

---

## 8. 작업별 추가 참고

| 작업 | 추가 문서 |
|------|----------|
| 새 REST 엔드포인트 | `../context/api.md`, `../context/error.md` |
| 결재 워크플로우 변경 | `../docs/01-plan/features/hr-platform.plan.md` |
| 새 도메인 마이그레이션 | 본 §4 + plan.md 데이터 모델 섹션 |
| cron job 추가 | 본 §6 |
| JWT/인증 변경 | `internal/auth/` + plan.md 권한 매트릭스 |
