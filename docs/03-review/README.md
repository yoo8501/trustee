# P1 Reviews — Sprint Summaries + Phase Gate

> P1 (인증 + 근태 + 휴가 + 캘린더 + 결재 1종) 완료 — 10/10 sprints, 2026-05-25
> 모든 Sprint Done When 충족, Phase Gate 🟢 GO (조건부)

## Sprint Summaries

| Sprint | 파일 | 핵심 산출물 |
|---|---|---|
| 1 Foundation | [p1-sprint-01-summary.md](p1-sprint-01-summary.md) | 모노레포 BE+FE 부트스트랩, ApiResult envelope, 라이트/다크 토글 |
| 2 인증 | [p1-sprint-02-summary.md](p1-sprint-02-summary.md) | JWT access 1h + refresh 30d + token_version, User/Team CRUD, 5단계 role |
| 3 휴가 도메인 | [p1-sprint-03-summary.md](p1-sprint-03-summary.md) | LeaveType 7종 + Balance + 2026 KR Holiday + 연차 cron (advisory lock) |
| 4 출퇴근 | [p1-sprint-04-summary.md](p1-sprint-04-summary.md) | AttendanceRecord, 자정 KST auto-close cron, 대시보드 옵티미스틱 카드 |
| 5 통계/권한 | [p1-sprint-05-summary.md](p1-sprint-05-summary.md) | 일/주/월 lazy compute, Scoped Querier, 출근율 80%, 권한 매트릭스 16 케이스 |
| 6 휴가 신청 | [p1-sprint-06-summary.md](p1-sprint-06-summary.md) | LeaveRequest 단일 결재 + Delegation + 트랜잭션 잔여 차감 + 5초 Undo |
| 7 지출결의서 | [p1-sprint-07-summary.md](p1-sprint-07-summary.md) | ExpenseReport 단일 결재 + 첨부 (drag-drop, 10MB, mime 검증) |
| 8 캘린더+알림 | [p1-sprint-08-summary.md](p1-sprint-08-summary.md) | 캘린더 가시성 마스킹, Notification + 4 도메인 트리거 |
| 9 admin+audit | [p1-sprint-09-summary.md](p1-sprint-09-summary.md) | /admin/* 4 페이지, soft delete, 권한 매트릭스 18 케이스 |
| 10 Cutover | [p1-sprint-10-summary.md](p1-sprint-10-summary.md) | 운영 체크리스트 9개, DR runbook, cutover/verify 스크립트 |

## Phase Gate 보고서

[p1-cutover-readiness.md](p1-cutover-readiness.md) — P1 출시 게이트 종합 평가. **🟢 GO (조건부)**.

## P1 통계

- **총 commit**: ~50개 (Red/Green/docs 모두 포함)
- **BE coverage**: 모든 `internal/*` 패키지 ≥ 80% (최고 100%, 최저 78.7%)
- **FE tests**: 419/419 PASS (78 files)
- **권한 매트릭스 자동 테스트**: 34 케이스 (Sprint 5: 16 + Sprint 9: 18)
- **회계 invariant**: diff=0 자동 검증
- **캘린더 노출 누락**: 0건 자동 검증
- **신규 ErrorCode**: 13종 (TOKEN_EXPIRED, CANNOT_DEMOTE_SELF, USER_TERMINATED, EMAIL_DUPLICATE, INVALID_CREDENTIALS, INVALID_ACCRUAL_POLICY, CHECK_IN_REQUIRED, CANNOT_TERMINATE_SELF, INSUFFICIENT_LEAVE_BALANCE, DUPLICATE_LEAVE_DATE, INVALID_DATE_RANGE, FILE_TOO_LARGE, INVALID_MIME_TYPE, DATE_RANGE_TOO_LARGE)

## TDD 검증

모든 sprint가 **Red commit → Green commit** 순서로 git log 확인 가능 (CLAUDE.md §3.11). 실패 테스트가 먼저, 그 후 구현.

## 다음 단계 (Sprint 11+)

P1 출시 후 첫 sprint에서:
- NotificationDropdown TS2353 fix
- Playwright E2E full sweep (8 critical path)
- axe-core CI / Lighthouse CI / Visual regression
- Sentry / Grafana 운영 모니터링 연결

P2 (다단계 결재 엔진), P3 (확장 + 이메일 + 정산)는 P1 출시 + 1~2주 병행 운영 안정화 후 office-hours 재실행으로 결정.
