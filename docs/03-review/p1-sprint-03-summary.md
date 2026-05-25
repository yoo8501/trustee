# Sprint 3 — 휴가 종류/잔여 + 공휴일 + 연차 cron 작업 요약

> 완료일: 2026-05-25
> Status: ✅ Done
> Commits: `f9e0958` (docs/error) → `fb48b84` (Red) → `82faa84` (Green) → `a6df178` (verify-accrual)

## 목표

`LeaveType` / `LeaveBalance` / `Holiday` 도메인 + `accrual_policy` JSON 스키마 + 연차 발생 cron (advisory lock). 휴가 신청(Sprint 6)의 선행 조건.

## 구현 결과

### DB 스키마 (`internal/db/migrations/`)

**000004_leave_holiday**
- `leave_types`: id, tenant_id, code UNIQUE, name, default_hours NUMERIC(4,1), accrual_policy JSONB, is_paid, is_active, soft delete
- `leave_balances`: id, tenant_id, user_id FK, leave_type_id FK, period_year, granted_hours, used_hours, expires_at, UNIQUE(user_id, leave_type_id, period_year)
- `holidays`: id, tenant_id, date, name, is_recurring, country_code, UNIQUE(tenant_id, date)
- `leave_balance_adjustments`: id, tenant_id, balance_id FK, actor_user_id FK, delta_hours, reason (audit log, Sprint 9에서 일반화)

**000005_seed_leave_types** — 7종:
| code | name | default_hours | accrual_policy.type |
|------|------|---------------|---------------------|
| `annual` | 연차 | 8.0 | annual_hire_anniversary (base 15d + tenure +1/2y, cap 25d) |
| `monthly_annual` | 월차(1년 미만) | 8.0 | monthly_lt_one_year |
| `half_day` | 반차 | 4.0 | fixed |
| `quarter_day` | 반반차 | 2.0 | fixed |
| `public` | 공가 | 8.0 | fixed |
| `comp_leave` | 보상휴가 | 8.0 | carryover_from_overtime |
| `special` | 특별휴가 | 8.0 | fixed |

> Spec은 "6종"이지만 1년 미만 월차와 연차는 accrual policy type이 다르고 LeaveBalance UNIQUE 제약이 leave_type_id 기준이라 별도 row가 필요. 결과 7종으로 확정.

**000006_seed_holidays_2026_kr** — 2026년 한국 공휴일 19건 (신정/설날3일+대체/삼일절+대체/어린이날/부처님오신날+대체/현충일/광복절+대체/추석3일/개천절+대체/한글날/성탄절)

### Go 도메인 코드

`internal/hr/leave/`
- `accrual_policy.go` — `AccrualPolicy` struct + `Validate` + `GrantHours(hireDate, now) float64`
  - 근로기준법 규칙: 1년 미만 매월 1일 / 1년+ anniversary 15일 + (tenure_years-1)/2 * bonus, cap 25일
  - 2/29 평년 보정 포함
- `leavetype_service.go` + `_handler.go` — CRUD, `INVALID_ACCRUAL_POLICY` 검증
- `leavebalance_service.go` + `_handler.go` — Me 조회 + HR 강제 조정 (reason 필수, audit log, 음수 결과 거부)
- `numeric.go` — pgtype.Numeric ↔ float64 변환 헬퍼

`internal/hr/holiday/`
- `service.go` + `handler.go` — read-only + 범위 조회

`internal/hr/cron/`
- `accrual.go` — `AccrualJob` (monthly + anniversary 분기, idempotent skip if balance exists)
- `advisorylock.go` — `pg_try_advisory_lock(hash("docflow:accrual"))` wrapper + `WithLock(fn)`
- `scheduler.go` — robfig/cron/v3, KST 고정 + `AccrualJobAdapter` (advisory lock 자동 적용)

### API 엔드포인트

| Method | Path | 권한 |
|--------|------|------|
| `GET` | `/api/hr/leave-types/:id` | 인증 |
| `POST` | `/api/hr/leave-types/list` | 인증 |
| `POST` | `/api/hr/leave-types` | HR+ |
| `POST` | `/api/hr/leave-types/update` | HR+ |
| `POST` | `/api/hr/leave-types/delete` | HR+ |
| `GET` | `/api/hr/leave-balances/me` | 본인 |
| `POST` | `/api/hr/leave-balances/:user_id/adjust` | HR+ (reason 필수) |
| `POST` | `/api/hr/holidays/list` | 인증 |

### 진입점 & 스크립트

- `cmd/cron/main.go` — daemon (long-running) + `--once --dry-run --job=accrual|all` flag
- `scripts/verify-accrual/main.go` — 1회 cron 후 모든 active user의 잔여가 기대치와 일치하는지 검증 (diff > 0이면 exit 1)

### ErrorCode 추가

- `INVALID_ACCRUAL_POLICY` (400) — accrual_policy JSON 검증 실패
- `context/error.md` 동시 반영

### 테스트 (TDD)

```
ok  internal/hr/cron     coverage: 80.2%
ok  internal/hr/holiday  coverage: 90.7%
ok  internal/hr/leave    coverage: 82.2%
```

모든 패키지 80% 목표 달성. race detector 통과.

**GrantHours 검증 (hire=2024-01-15, 연차 정책)**
```
now=2024-12-31 -> 0h   (1년 미달)
now=2025-01-15 -> 120h (1주년 = 15d)
now=2026-01-15 -> 120h (2주년 = 15d)
now=2027-01-15 -> 128h (3주년 = 16d, +1 적용)
now=2029-01-15 -> 136h (5주년 = 17d)
now=2045-01-15 -> 200h (21주년 = 25d, cap)
```

**월차 (hire=2026-01-15, monthly_lt_one_year)**
```
now=2026-02-01 -> 0h  (입사 1개월 안 됨)
now=2026-03-01 -> 8h  (매월 1일, 1년 미만)
now=2027-02-01 -> 0h  (1년 초과)
```

## Done When 체크 (전부 ✅)

- [x] LeaveType 테이블 + 7종 시드
- [x] LeaveBalance 테이블 UNIQUE(user_id, leave_type_id, period_year)
- [x] Holiday 테이블 + 2026 KR 19건 시드
- [x] accrual_policy JSON 스키마 + Go struct + Validate
- [x] /api/hr/leave-types CRUD (HR 보호)
- [x] /api/hr/leave-balances/me + /:user_id/adjust (HR + reason 필수 + audit log)
- [x] /api/hr/holidays/list
- [x] 연차 발생 cron (monthly + anniversary)
- [x] advisory lock + --dry-run + --once
- [x] scripts/verify-accrual
- [x] coverage ≥ 80% 전 패키지

## TDD 검증 (commit 순서)

```
f9e0958 docs(error): Sprint 3 ErrorCode 추가 (INVALID_ACCRUAL_POLICY)
fb48b84 test(sprint-3): LeaveType/Balance/Holiday + accrual_policy 실패 테스트 (red)
82faa84 feat(sprint-3): 휴가 종류/잔여/공휴일 + 연차 발생 cron 구현 (green)
a6df178 chore(sprint-3): scripts/verify-accrual 추가 — 잔여 회계 검증
```

## 주요 결정

- **7종 시드**: spec "6종" → 7종 (1년 미만 월차를 별 leave_type으로 분리). LeaveBalance UNIQUE 제약과의 호환성 확보.
- **HTTP method**: `context/api.md` §3 규칙 (단건 GET, 그 외 POST) 엄격 적용. spec의 "GET /api/hr/leave-types"는 목록이므로 `POST /list`로 정정.
- **advisory lock 테스트**: fakeStore 기반 contention 시나리오로 검증 (`cron.WithLock`은 PG 함수 결과만 보므로 fake로 충분).
- **2/29 평년 보정**: 입사일이 2/29인 경우 평년에는 2/28 anniversary로 폴백.

## 미실행

- 실제 PostgreSQL에 마이그레이션 적용 + `docflow-cron --once --dry-run` + `verify-accrual` 통합 검증은 docker-compose 기동 필요 (코드/스키마는 sqlc generate 통과로 검증). Sprint 10 (Cutover) 직전에 실 DB 통합 실행 예정.

## 다음 sprint

Sprint 4 (AttendanceRecord + 자정 cron + 대시보드 카드) 와 Sprint 9 (관리자 화면) 가 본 sprint에 의존. Sprint 4, 9 를 동시 진행 가능.
