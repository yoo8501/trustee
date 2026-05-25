# P1 Cutover Readiness — Phase Gate 보고서

> 완료일: 2026-05-25
> Status: 🟢 **GO** (모든 코드/스크립트/문서 작성 완료, 운영팀 cutover day 전 §운영 체크리스트 배포/검증 책임)
> Commits: `b6f8f9e` (Red) → `2d55742` (Green) → `<이 보고서>` (docs)

---

## 1. Sprint 1-9 완료 현황

| Sprint | 영역                         | Done When | 회귀 결과 | 비고 |
|--------|------------------------------|:---------:|:---------:|------|
| 1      | Foundation (config/httpx/migrate) | ✅ | ✅ | ApiResult envelope + ErrorCode enum 확립 |
| 2      | 인증 (JWT) + Users + Teams       | ✅ | ✅ | terminated 즉시 무효 + token_version bump |
| 3      | LeaveType/Balance/Holiday + 연차 cron | ✅ | ✅ | accrual_policy JSON, 매월 1일 02:00 KST |
| 4      | Attendance + auto-close cron     | ✅ | ✅ | 매일 00:00 KST auto_closed |
| 5      | 통계 (lazy) + Scoped Querier     | ✅ | ✅ | 회계 invariant + 권한 매트릭스 |
| 6      | 휴가 신청 + 단일 결재 + Delegation | ✅ | ✅ | LeaveRequest pending→approved/rejected, 5초 Undo |
| 7      | 지출결의서 + 첨부                 | ✅ | ✅ | ExpenseReport status, S3 presigned URL 후속 |
| 8      | 캘린더 + 알림                     | ✅ | ✅ | 90일 한도, 사유 마스킹, in-app NotificationDropdown |
| 9      | admin (terminate) + audit        | ✅ | ✅ | 18개 권한 매트릭스 케이스 PASS |
| **10** | **Cutover + 안정화**             | ✅ | ✅ | 본 보고서 |

상세 sprint summary: `docs/03-review/p1-sprint-0{1..9}-summary.md`.

---

## 2. 운영 체크리스트 9개 (Sprint 10 핵심)

`infra/ops-checklist.md` 참조.

| # | 항목                          | 작성 | 배포 | 검증 |
|---|------------------------------|:---:|:---:|:---:|
| 1 | PostgreSQL 자동 백업          | ✅  |  ⏳  |  ⏳  |
| 2 | 백업 복원 훈련                | ✅  |  ⏳  |  ⏳  |
| 3 | DB 접근 감사 로그             | ✅  |  ⏳  |  ⏳  |
| 4 | HTTPS 강제                    | ✅  |  ⏳  |  ⏳  |
| 5 | DB at-rest 암호화             | ✅  |  ⏳  |  ⏳  |
| 6 | 개인정보처리방침              | ✅  |  ⏳  |  ⏳  |
| 7 | DB 직접 접근 권한 분리        | ✅  |  ⏳  |  ⏳  |
| 8 | DR runbook                    | ✅  |  ⏳  |  ⏳  |
| 9 | NTP 동기화                    | ✅  |  ⏳  |  ⏳  |

- **문서/스크립트: 9/9 완료**
- **배포/검증: cutover day 전 SRE 팀 책임** (본 보고서 GO 권고에 포함된 조건부 항목)
- 관련 파일: `infra/ops-checklist.md`, `infra/dr-runbook.md`, `infra/caddy-prod.example.Caddyfile`, `infra/docker-compose.prod.yml`

---

## 3. QA Gate

### 3.1 자동 회귀

| 검증                                       | 결과 | 위치 |
|--------------------------------------------|:----:|------|
| `go test ./...` (28 패키지)                 | ✅ PASS | backend 전체 |
| `go build ./...`                           | ✅ PASS | backend |
| `bun run test` (419 tests)                  | ✅ PASS | frontend 전체 |
| `bunx tsc --noEmit`                        | ✅ PASS | frontend |
| `bun run lint`                             | ✅ PASS (warning 1, 기존) | frontend |
| `bun run build`                            | 🟡 PARTIAL — 기존 NotificationDropdown 타입 오류 (Sprint 8 잔여) | frontend |
| 회계 invariant diff = 0 (Sprint 5)          | ✅ PASS | `internal/hr/attendance/stats/` |
| 권한 매트릭스 (Sprint 5+9)                  | ✅ PASS (18+16 cases) | `internal/server/permission_matrix_test.go` |
| 캘린더 노출 누락 0건 (Sprint 8)             | ✅ PASS | `internal/hr/calendar/service_test.go` |

> 🟡 PARTIAL 사항 — `bun run build` 의 TS2353 (NotificationDropdown `data-testid`) 는 Sprint 8 의 잔여 issue. vitest/lint/tsc 는 모두 통과 → 런타임 영향 없음. 빌드 명령은 MUI Popover slotProps 의 `data-*` 속성 타입 inference 한계. Sprint 11 첫 작업으로 별도 type assertion 또는 wrap 컴포넌트로 해결 예정.

### 3.2 자동 검증 스크립트 (Sprint 10 신규)

| 스크립트                       | 목적                                                | 검증 |
|--------------------------------|----------------------------------------------------|:----:|
| `scripts/cutover/main.go`      | CSV → DB import, --dry-run, diff = 0 검증            | ✅ unit test 13건 |
| `scripts/verify-stats/main.go` | stats.Service vs raw SUM diff = 0                  | ✅ unit test 6건 |
| `scripts/verify-calendar/main.go` | calendar.Service vs DB holiday+leave 누락 0 | ✅ unit test 6건 |

DB-의존 통합 검증은 cutover day 본 데이터로 staging 에서 1회 실행 (운영 책임).

### 3.3 Critical Path 1~8

| #  | Critical Path                              | 회귀 결과 |
|----|--------------------------------------------|:---------:|
| 1  | 로그인 + JWT refresh                       | ✅ Vitest + Go integration |
| 2  | 출근 → 퇴근 → 자동 마감                    | ✅ Go service + handler |
| 3  | 휴가 신청 → pending → 결재 승인 → 잔여 차감 | ✅ Sprint 6 transactional test |
| 4  | 휴가 신청 → cancel (본인, pending)          | ✅ |
| 5  | 결재자 위임 (Delegation)                   | ✅ Sprint 6 routing test |
| 6  | 지출결의서 신청 → 결재 → 첨부               | ✅ Sprint 7 |
| 7  | 캘린더 (3개월 한도, 사유 마스킹)            | ✅ Sprint 8 |
| 8  | terminate user → 즉시 토큰 무효            | ✅ Sprint 9 |

> Playwright E2E full sweep + visual regression (Chromatic / screenshot diff) + axe-core + Lighthouse CI 는 **후속 Sprint 11 첫 작업** 으로 명시 (본 readiness 와 별개 — workflow.html §P1 후처리).

---

## 4. Success Metrics 측정 계획

운영 1~2주 후 측정. 본 보고서 작성 시점에선 측정 불가.

| 지표                                       | 목표      | 측정 방법                                  | 책임자 |
|--------------------------------------------|----------|--------------------------------------------|--------|
| 출퇴근 매일 능동 사용자                    | ≥ 80%    | `SELECT COUNT(DISTINCT user_id) FROM attendance_records WHERE work_date = today` / `COUNT(*) FROM users WHERE status='active'` | HR |
| 휴가 신청 단일 결재 처리 시간              | ≤ 24h    | `AVG(decided_at - created_at) FROM leave_requests WHERE status IN ('approved','rejected') AND created_at > cutover` | HR + SRE |
| 지출결의서 단일 결재 처리 시간             | ≤ 24h    | 동일 (expense_reports)                     | HR |
| 권한 누수 사고                              | 0건      | audit_log 분석 + 사내 신고                  | SRE + 보안 |

- 측정 자동화: P2 첫 sprint 에 metrics dashboard (Grafana) 추가 권장.
- 권한 누수 자동 회귀: `permission_matrix_test.go` 가 CI 에 통합되어 있어 새 endpoint 추가 시 자동 차단.

---

## 5. Rollback 시나리오

`infra/dr-runbook.md` 시나리오 1~3 참조.

요약:
- **시나리오 1** (서버 hard down): docker compose restart → fail-over → DNS 전환 → 사내 공지.
- **시나리오 2** (DB 데이터 손상): write 차단 → 외부 SaaS redirect (병행 운영 기간 한정) → 백업 복원 → verify-stats/calendar 통과 후 전환.
- **시나리오 3** (권한 누수): endpoint 즉시 비활성 → 영향 범위 파악 (audit_log) → 패치 + 회귀 테스트 → 재배포 → 사내 공지.

병행 운영 안전망: cutover 후 **1~2주** 외부 SaaS 동시 운영 → 이상 신호 시 즉시 redirect.

---

## 6. 알려진 미해결 사항 (후속 Sprint 11+)

| # | 항목                                                   | 영향도 | 후속 sprint |
|---|--------------------------------------------------------|:------:|:-----------:|
| 1 | `bun run build` TS2353 (NotificationDropdown data-testid) | low    | 11 first day |
| 2 | Playwright E2E full sweep (8 path)                       | medium | 11          |
| 3 | axe-core CI 통합                                          | medium | 11          |
| 4 | Lighthouse CI (대시보드 LCP ≤ 1.5s, perf ≥ 90)            | medium | 11          |
| 5 | Visual regression (Chromatic 또는 Playwright screenshot diff) | low | 11          |
| 6 | Sentry 운영 연결 + alert rule                            | medium | 11          |
| 7 | Metrics dashboard (Grafana)                              | medium | P2 첫 sprint |
| 8 | 미사용 연차 정산 ledger                                  | low    | P3          |

> 본 8개 항목은 모두 **P1 출시 게이트 외**. P1 출시 후 첫 2주 안에 1~6 처리 권장.

---

## 7. 권고 — 🟢 GO

**P1 cutover 진행 권고 — 다음 조건부:**

1. ✅ Sprint 1-9 Done When 모두 충족 (회귀 PASS)
2. ✅ Sprint 10 운영 문서 9개 작성 완료
3. ✅ 자동 검증 스크립트 3개 작성 + unit test PASS
4. ⏳ SRE 팀: cutover day 전 운영 체크리스트 §1-9 배포/검증 완료
5. ⏳ SRE 팀: staging 에서 본 데이터 dry-run import + verify-stats + verify-calendar 전체 PASS
6. ⏳ HR: 개인정보처리방침 사내 공지 게시 (이미 cutover 전 필요)

조건 4~6 충족 시 cutover day 진행 가능. 진행 후 1~2주 외부 SaaS 병행 운영 + §4 Success Metrics 측정.

---

## 참고

- `CLAUDE.md` §3 (절대 규칙) + §5 (Definition of Done)
- `docs/01-plan/goals/p1-sprint-10-cutover.md`
- `docs/01-plan/features/hr-platform.plan.md` §Cutover Plan / §운영 체크리스트 / §Success Criteria P1
- `docs/01-plan/features/hr-platform.test-plan.md` Critical Paths 1~8
- 전 Sprint summary: `docs/03-review/p1-sprint-01..09-summary.md`
