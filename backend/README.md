# DocFlow Backend

Go + Gin + PostgreSQL + sqlc + golang-migrate. 자세한 규칙은 [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md), 공유 contract 는 [`../context/api.md`](../context/api.md) / [`../context/error.md`](../context/error.md) 참조.

## 부팅 (로컬, Docker)

```bash
cd backend && docker compose up --build      # PostgreSQL + API (8080)
curl -s localhost:8080/health | jq .         # ApiResult{success:true, data:{status:"ok"}}
curl -s localhost:8080/debug/error -i        # 500 + ApiResult{success:false, errorCode:INTERNAL_ERROR}
```

## 부팅 (로컬, Go 직접 실행)

```bash
cd backend && export DATABASE_URL="postgres://docflow:docflow@localhost:5432/docflow?sslmode=disable"
go run ./cmd/api                              # :8080 listen
```

## 개발 명령

```bash
go test ./... -cover                          # 전체 테스트 (목표 coverage ≥ 80%)
sqlc generate                                 # internal/db/queries → internal/db/sqlc
migrate -path internal/db/migrations -database "$DATABASE_URL" up    # 마이그레이션 적용
migrate -path internal/db/migrations -database "$DATABASE_URL" down  # 롤백
```

## 디렉토리

```
backend/
├── cmd/api/                 진입점
├── internal/
│   ├── httpx/
│   │   ├── apiresult/       ApiResult envelope 헬퍼
│   │   ├── errorcode/       표준 ErrorCode enum
│   │   └── middleware/      RequestID / Logger(slog) / Recover / Tenant
│   ├── config/              env 로딩
│   ├── server/              Gin 엔진 부트스트랩
│   └── db/
│       ├── migrations/      golang-migrate
│       ├── queries/         sqlc 입력
│       └── sqlc/            sqlc 생성 코드 (커밋 대상)
├── sqlc.yaml
├── Dockerfile
└── docker-compose.yml
```

## TDD 규칙

[`../CLAUDE.md`](../CLAUDE.md) §3.11. Red → Green → Refactor. 신규 핸들러/서비스/cron 은 실패 테스트 commit → 구현 commit 순.
