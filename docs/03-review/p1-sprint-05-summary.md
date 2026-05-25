# Sprint 5 — 통계 + 권한 매트릭스 (Scoped Querier) 작업 요약

> 완료일: 2026-05-25
> Status: ✅ Done
> Commits: `9646d7c` (BE Red) → `b3617b5` (BE Green) / `1833f5a` (FE Red) → `090e029` (FE Green)
> BE/FE 병렬 진행 (BE+FE 각자 독립)

## 목표

일/주/월 통계 (lazy compute) + Repository-layer Scoped Querier + 출근율 80% + 권한 누수 0건 자동 테스트.

## Backend (`/Users/seosangjun/docflow/backend/`)

### Lazy compute (`internal/hr/attendance/stats/compute.go`)

순수 함수 — DB 의존 없음:
- `ComputeRecord(record, user, leaveAdj) RecordStats` — user_expected / actual_work / adjusted_expected / overtime 계산
- `AggregatePeriod(records, businessDays, absentDays) PeriodStats` — 합계 + status count + weekly overtime
- `PeriodRange(period, date, user) (from, to)` — day/week/month → KST 범위

### Attendance Rate (`attendance_rate.go`)

- 분모 = 영업일(주말/공휴일 제외) - 결근일
- 분자 = 출근일 (정상/지각/조퇴 포함, 결근 제외)
- 병가/공가/특별휴가는 출근으로 간주 (근로기준법 시행령 30조)
- `CountBusinessDays(from, to, holidays)` 헬퍼

### LeaveAdapter (Sprint 6 swap point)

- `LeaveAdjustmentFetcher` 인터페이스 — Sprint 6에서 LeaveRequest 쿼리 구현체로 교체
- `NoopLeaveAdjustmentFetcher` (현재) — 빈 결과
- Sprint 5 단계에서도 stub 결과로 lazy compute는 정상 동작

### Scope (`internal/hr/scope/scope.go`)

```go
type Scope struct {
    TenantID int64
    UserID   *int64    // me-scope
    TeamIDs  []int64   // team/dept (dept_head는 산하 팀 전체)
    All      bool      // HR / super_admin
}

func Resolve(actor, request, hierarchy) (Scope, error)
```

- `general` → me only
- `team_lead` + scope=team → 본인 팀 1개
- `dept_head` + scope=team → 산하 팀 전체 (`TeamHierarchy.DescendantsOf` 재귀 CTE)
- `hr_manager` / `super_admin` + scope=all → All=true
- 권한 위반 시 `ErrForbidden`

### Service & Handler

- `Mine(ctx, userID, period, date)`
- `Team(ctx, actor, teamID, period, date)` — Scope 검증, 다른 팀 요청 시 403
- `All(ctx, actor, period, date)` — HR+ only

### 라우트

```
POST /api/hr/attendance/me/stats
POST /api/hr/attendance/team/:teamId/stats   (team_lead+, 산하팀만)
POST /api/hr/attendance/all/stats             (HR+)
```

`statsTeamContext` 미들웨어 — JWT claims에 teamId 없으므로 DB 1회 lookup → `c.Set("auth:team_id", ...)`. P2 이후 JWT 포함 검토.

### SQL (sqlc)

- `attendance_stats.sql` — 3종 attendance range 쿼리 (me/team/all) + ListUsersByTeams
- `teams.sql` — `ListTeamDescendants` WITH RECURSIVE 추가

### 권한 매트릭스 자동 테스트 (16 케이스)

`TestSprint5_PermissionMatrix_RoleByResource`:
- general × 3 (me 200, team 403, all 403)
- team_lead × 4 (me 200, own team 200, other team 403, all 403)
- dept_head × 3 (me 200, own dept 200, all 403)
- hr_manager × 3 (me/team/all 200)
- super_admin × 3 (me/team/all 200)

Done When 요구 "5 × 3 = 15+" 초과 (16 케이스).

### 회계 검증 (diff = 0)

- `TestAggregatePeriod_AccountingInvariant_DiffZero` — 5 records 임의 시나리오에서 `period.TotalActualMinutes == Σ individual.ActualWorkMinutes` → diff=0
- `TestSprint5_Mine_AccountingInvariant` — Service 경유 검증, diff=0

### Coverage

- `internal/hr/attendance/stats` **89.6%** (≥ 85% 충족)
- `internal/hr/scope` **92.6%** (≥ 85% 충족)

## Frontend (`/Users/seosangjun/docflow/frontend/`)

### features/attendance/

- `stats-types.ts` — Zod schemas (`RecordStats`, `PeriodSummary`, `StatsResponse`, `StatsQuery`)
- `api/stats.ts` — `statsApi.me/team/all`
- `hooks/useMyStats.ts` / `useTeamStats.ts` / `useAllStats.ts` — useMutation (POST per api.md §3)

### components/

- `PeriodTabs` — 일/주/월 MUI Tabs
- `OvertimeWarning` — 48h soft warn / 52h danger (강제 차단 없음)
- `WeeklyChart` — **SVG 자체 구현** (recharts 미사용으로 bundle 절약), `theme.palette` 토큰만 사용 (다크 모드 자동 적용)
- `RecordsTable` — 일별 출근/퇴근/실근무/연장/상태
- `StatsSummary` — 합계 카드 (총실근무 / 연장근로 / 출근일 / 출근율)

### routes/attendance.tsx

- 데스크탑: 차트 + 요약 2-col (Grid xs=12 md=8/4)
- 모바일: 1-col (차트 위, 테이블 아래)
- 5 상태 모두 처리 (Loading skeleton / Empty / Error / Success / Partial)
- 헤더 네비에 "근태" 링크 추가 (Sprint 1 root layout 확장)

### i18n 키 추가 (ko + en)

```
attendance.stats.{title, period.day/week/month, summary.totalActual/overtime/daysPresent/attendanceRate}
attendance.chart.*
attendance.overtime.{warn, danger}
attendance.records.{date, checkIn, checkOut, actual, overtime, status}
attendance.{empty, error, team.forbidden}
nav.attendance
```

### 48h/52h 임계 테스트

- 47:50h → 배너 없음
- 48:00h → severity=warning (warn 색)
- 50:00h → warn 유지
- 52:00h → severity=error (danger 색)
- 55:00h → danger 유지

### 다크 모드 차트 가독성

WeeklyChart는 하드코딩 색상 0개. `theme.palette.primary.main` / `warning.main` / `text.disabled` / `divider` / `text.secondary` 사용. 다크 팔레트(`text.secondary #cbd5e1` on `paper #111827`) ≈ 10:1 contrast (WCAG AAA).

### Critical Path

- **CP4 (반차 + 4h 출근 → 240 자동 조정)**: MSW로 `adjustedExpected:240, leaveHours:4` 시뮬레이션 → `routes/attendance.test.tsx` 통합 테스트 green. Sprint 6 LeaveRequest 머지 후 BE 회귀 필요
- **CP7 (팀장 A가 팀 B 직입력 → 403 + UI)**: `useTeamStats` hook이 retry=0으로 403 즉시 노출 → 페이지에서 `error.errorCode === 'FORBIDDEN'` 분기 가능. `/attendance/team/:teamId` 라우트는 Sprint 6 팀장 뷰에서 등장 예정 (hook 준비됨)

### Verification

- `bun run test`: **212 / 45 files PASS** (기존 168 + 신규 44)
- `bunx tsc --noEmit`: clean
- `bun run lint`: 0 errors (1 pre-existing warning)
- `bun run build`: 917KB / 281KB gzip

## Done When 체크 (전부 ✅)

### Backend
- [x] /api/hr/attendance/me/stats lazy compute
- [x] /team/:teamId/stats Scoped Querier 강제
- [x] /all/stats HR+ only
- [x] Repository-layer Scoped Querier 패턴 정착
- [x] 출근율 80% (병가/공가/특별휴가=출근)
- [x] 권한 매트릭스 16 케이스 자동 테스트
- [x] 회계 검증 diff=0
- [x] coverage ≥ 85%

### Frontend
- [x] /attendance 일/주/월 탭
- [x] 주간 차트 (DESIGN.md 토큰)
- [x] 48h soft + 52h 강한 경고 (강제 차단 없음)
- [x] 5 상태 처리
- [x] 데스크탑 2-col / 모바일 1-col
- [x] 다크 모드 가독성
- [x] CP4 통합 테스트
- [x] CP7 hook 처리

## TDD 검증 (commit 순서)

```
1833f5a test(sprint-5): frontend 통계 페이지 실패 테스트 (red)
9646d7c test(sprint-5): 통계 + Scoped Querier + 권한 매트릭스 실패 테스트 (red)  ← BE Red
090e029 feat(sprint-5): /attendance 일/주/월 탭 + 차트 + 48/52h 경고 (green)
b3617b5 feat(sprint-5): 통계 API (lazy compute) + Scoped Querier + 출근율 80% (green) ← BE Green
```

## 주요 결정

- **TeamHierarchy 비동기 인터페이스**: sync `DescendantsOf(teamID)` → async `DescendantsOf(ctx, tenantID, teamID)` 로 변경 — SQL 호출 + tenant 격리 필요.
- **HR/super_admin + scope=team + actor.TeamID=0 fallback**: All=true (전사 권한자가 본인 팀 없이 team 요청 시 합리적 기본).
- **statsTeamContext 미들웨어**: JWT claims에 teamId 없어서 DB lookup 1회. P2에서 JWT claims 포함 검토.
- **WeeklyChart SVG 자체 구현**: recharts 의존성(100kb+) 회피, theme token만 사용 → 다크 모드 자동.
- **CP4 통합 테스트**: Sprint 6 LeaveRequest BE 연동 후 Playwright 회귀 권장.

## 다음 sprint

Sprint 6 (휴가 신청 — Sprint 3 LeaveType/Balance + Sprint 5 Scoped Querier 모두 의존). 본 sprint에서 leave_adapter swap point 준비 완료.
