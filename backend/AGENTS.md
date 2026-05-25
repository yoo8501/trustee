# DocFlow Backend - Codex 작업 지침

> Backend 작업 시 루트 [`../AGENTS.md`](../AGENTS.md)를 먼저 따른다.
> 공유 contract는 [`../context/api.md`](../context/api.md), [`../context/error.md`](../context/error.md)가 우선한다.

---

## 1. 기술 스택

- Go latest stable + Gin
- PostgreSQL + sqlc + golang-migrate
- JWT 직접 구현 (`golang-jwt/jwt/v5`)
- `robfig/cron/v3`
- 표준 `testing` + `testify` + testcontainers-go
- 구조화 로그는 `slog` 권장

---

## 2. 디렉토리 기준

```text
backend/
├── cmd/api/
├── internal/
│   ├── handler/
│   ├── service/
│   ├── repository/
│   ├── db/
│   │   ├── queries/
│   │   ├── migrations/
│   │   └── sqlc/
│   ├── domain/
│   ├── httpx/
│   ├── auth/
│   ├── cron/
│   └── config/
└── go.mod
```

`internal/` 밖에서 내부 패키지를 import하지 않는다. Handler는 HTTP만, service는 트랜잭션/비즈니스 로직, repository는 sqlc 접근 wrapping을 담당한다.

---

## 3. Backend 절대 규칙

1. 응답은 `ApiResult<T>` 헬퍼만 사용한다. `gin.H`, `map[string]any`, 임의 struct 직접 반환은 금지한다.
2. HTTP method는 [`../context/api.md`](../context/api.md) §3을 따른다. GET은 단건 조회, POST는 목록/등록/수정/삭제/상태 변경이다. PUT/PATCH/DELETE는 사용하지 않는다.
3. ErrorCode는 [`../context/error.md`](../context/error.md)를 우선 재사용한다. 신규 ErrorCode는 backend/frontend/context를 함께 수정한다.
4. 모든 쿼리에서 `tenant_id` 조건을 명시한다. 현재 단일 조직이라도 생략하지 않는다.
5. 결재 status 컬럼은 `approvals` 테이블에만 둔다.
6. 응답에 stack trace, SQL, secret, raw exception message를 노출하지 않는다.
7. 시간 계산은 KST 기준으로 명시한다. DB 저장은 `TIMESTAMPTZ`를 사용한다.

---

## 4. 구현 패턴

핸들러는 입력 바인딩, 인증 컨텍스트 추출, service 호출, `apiresult` 응답 작성만 한다.

```go
func (h *LeaveHandler) Create(c *gin.Context) {
    var req CreateLeaveRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, apiresult.Failure("요청 형식이 잘못되었습니다.", &httpx.ErrorDetails{
            ErrorCode: "INVALID_REQUEST",
        }))
        return
    }

    userID := auth.UserIDFrom(c)
    leave, err := h.svc.Create(c.Request.Context(), userID, req)
    if err != nil {
        apiresult.WriteError(c, err)
        return
    }

    c.JSON(http.StatusCreated, apiresult.Success(leave))
}
```

- 입력 검증 실패는 `VALIDATION_FAILED`와 `fields[]`로 표현한다.
- 도메인 에러는 sentinel error 또는 typed error로 정의하고 ErrorCode 매핑 계층에서 변환한다.
- 트랜잭션은 service layer에서 시작/커밋한다. handler가 tx를 직접 다루지 않는다.

---

## 5. DB / sqlc / migration

- SQL은 `internal/db/queries/*.sql`에 작성하고 `sqlc generate`로 생성한다.
- 손으로 SQL 문자열을 이어 붙이지 않는다.
- migration은 `internal/db/migrations/{NNN}_{name}.up.sql`, `.down.sql` 쌍으로 작성한다.
- 모든 테이블 기본 컬럼은 `id`, `tenant_id`, `created_at`, `updated_at`이다.
- soft delete 도메인은 `deleted_at`을 두고 모든 조회에 `deleted_at IS NULL`을 포함한다.
- sqlc 생성 코드는 커밋 대상이다.

---

## 6. Cron

- KST 00:00 출퇴근 자동 마감
- 매월 1일 KST 02:00 월차 적립
- 5년 경과 근태/사용자 데이터 정리
- cron job은 `internal/cron/`에서 등록하고 시작/종료/처리 건수를 구조화 로그로 남긴다.

---

## 7. 테스트 / 검증

**TDD 강제** ([`../AGENTS.md`](../AGENTS.md) §3.11). 실패하는 테스트를 먼저 commit, 그 다음 구현을 별도 commit한다. 버그 수정도 재현 테스트 먼저. coverage 목표 `internal/*` ≥ 80%, critical path 100%.

Backend 변경 후 가능한 검증:

```bash
go test ./... -cover
sqlc generate
golang-migrate up
```

- DB 의존 테스트는 Postgres 기반(testcontainers 또는 docker-compose 테스트 DB)을 사용한다.
- Handler 테스트는 `ApiResult` envelope을 역직렬화해서 단정한다.
- 새 핸들러는 success와 대표 failure 케이스를 함께 테스트한다.
- 결재 상태 전이는 invalid transition 테스트를 최소 1개 포함한다.

---

## 8. 작업별 참조

| 작업 | 추가 참조 |
|------|-----------|
| REST 엔드포인트 추가/수정 | `../context/api.md`, `../context/error.md` |
| 결재 워크플로우 | `../docs/01-plan/features/hr-platform.plan.md` |
| DB schema / migration | 본 파일 §5, plan.md 데이터 모델 |
| cron job | 본 파일 §6 |
| JWT/권한 | `internal/auth/`, plan.md 권한 매트릭스 |
