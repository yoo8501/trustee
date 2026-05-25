# Sprint 4 — 출퇴근 + 자동마감 cron + 대시보드 카드 작업 요약

> 완료일: 2026-05-25
> Status: ✅ Done
> Commits: `c1278f9` (BE Red) → `2cdc5f7` (BE Green) / `3fba1f5` (FE Red) → `bee87e3` (FE Green)
> 병렬 실행: Sprint 4 BE / Sprint 4 FE / Sprint 9 BE 3개 에이전트 동시 — 충돌 없이 머지

## 목표

`AttendanceRecord` + 출퇴근 API + 자정 KST 자동 마감 cron + 대시보드 출퇴근 카드 (옵티미스틱 UI ≤100ms). 매일 능동 사용 골든 패스.

## Backend (`/Users/seosangjun/docflow/backend/`)

### DB 스키마 (000007_attendance)

- ENUM `attendance_source` (`button`, `manual_correction`)
- ENUM `attendance_status` (`normal`, `late`, `early_leave`, `absent`, `auto_closed`)
- `attendance_records`: id, tenant_id, user_id FK, work_date, check_in_at, check_out_at, lunch_break_minutes default 60, source, client_ip INET, user_agent, status
- UNIQUE(user_id, work_date) + 3 인덱스 (user+date, tenant+date, partial `WHERE check_out_at IS NULL`)

### Service & Handler (`internal/hr/attendance/`)

- `CheckIn(userID, clientIP, userAgent)` — 첫 클릭 보존 (두 번째 클릭 시 200 + 기존 record), KST 자정 기준 work_date, late 판정
- `CheckOut(userID)` — 출근 없으면 `ErrCheckInRequired` → 400 `CHECK_IN_REQUIRED`, 마지막 시각으로 갱신, early_leave 판정
- 상태 우선순위: `late > early_leave > normal` (단일 enum 한계로 late 우선 정책)
- 핸들러: `gin.Context.ClientIP()` + `c.Request.UserAgent()` 추출 후 service 전달, INET 파싱 실패 시 NULL

### Cron (`internal/hr/cron/autoclose.go`)

- `AutoCloseJob` — 매일 KST 00:00 (`cron.Spec() = "0 0 * * *"`)
- `FindOpenRecords(yesterday)` → `MarkAutoClosed(ids)`, `check_out_at` NULL 유지
- `--dry-run` flag: 후보만 로그, write skip
- advisory lock id 분리: `AutoCloseLockID = fnv64("docflow:attendance-autoclose")` ≠ accrual
- `withLockID(locker, id, fn)` helper로 generic `pg_try_advisory_lock` 재사용
- Notification stub: `TODO(sprint-8)` 주석 + slog 로그만

### 라우트

```
POST /api/hr/attendance/check-in    (auth required)
POST /api/hr/attendance/check-out   (auth required)
```

### ErrorCode 추가

- `CHECK_IN_REQUIRED` (400) — `context/error.md` 동시 반영 (Sprint 9 commit `adeb4db`에 포함)

### Coverage

- `internal/hr/attendance` **85.2%**
- `internal/hr/cron` **84.3%** (autoclose 추가 후도 80% 유지)

### Cron 테스트 핵심 케이스

- `MarksAllOpenForYesterday` — open 3개 → 3개 마킹, check_out_at NULL 유지
- `DryRun_NoWrite` — candidates=2, marked=0
- `SkipsClosedAndAlreadyAutoClosed` — 이미 close된/이미 auto_closed인 row 제외
- `DoesNotTouchToday` — 오늘 record는 절대 마킹 안 함
- `LockNotAcquired_Skip` — 다른 인스턴스가 lock 잡으면 skip
- `LockID_DifferentFromAccrual` — accrual cron과 lock id 독립

## Frontend (`/Users/seosangjun/docflow/frontend/`)

### features/attendance/

- `types.ts` — Zod `AttendanceRecordSchema` (id, workDate, checkInAt, checkOutAt, status, lunchBreakMinutes)
- `utils.ts` — `todayKST()`, `formatTimeKST()` — `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })` 강제
- `api/client.ts` — `checkIn()`, `checkOut()`, `getToday()` (모두 `lib/api/http` 경유)
- `hooks/useCheckIn.ts` / `useCheckOut.ts` — **TanStack Query optimistic update**:
  - `onMutate`: cancelQueries → setQueryData(optimistic record with id=-1)
  - `onError`: rollback to prev cache + warning toast (1초 안)
  - `onSuccess`: BE record로 교체 + success toast `"출근됨 · 09:01"`
  - `onSettled`: invalidateQueries

### components/

- `DashboardClock` — fontSize 44px, fontWeight 700, `fontVariantNumeric: 'tabular-nums'`, `role="status" aria-live="off"` (매초 알림 차단), KST 시간 매초 갱신
- `AttendanceCard` (MUI Card, `borderRadius: 16px` = radius-2xl, p:4)
- `CheckInButton` / `CheckOutButton`:
  - 출근 안 했으면 퇴근 버튼 비활성 + inline hint `"출근 체크 먼저 해주세요"`
  - 이미 출근/퇴근 완료 시 버튼 비활성 (서버 UNIQUE는 백업)
  - MUI Button 기본 Enter/Space 활성 + aria-label
  - `autoFocus` 출근 버튼 (키보드 접근 최적화)
- `AttendanceStatusBadge` — 상태별 chip
- `AutoClosedAlert` — `today.status === 'auto_closed'`이면 카드 안에 warning Alert (Sprint 8 정식 inbox 전 placeholder)

### routes/home.tsx (대시보드 재설계)

- Welcome (개인화: `안녕하세요, {{name}} 님`)
- AttendanceCard
- 모바일 (`xs`): `position: sticky, top: 0` — 출퇴근 카드가 항상 화면 상단
- 데스크탑: 일반 grid

### i18n 추가 키 (ko + en)

```
attendance.checkin.{label, done, aria, success, failed}
attendance.checkout.{label, done, aria, success, failed, requirementHint}
attendance.autoClosed.alert
attendance.status.{normal, late, early_leave, auto_closed}
error.CHECK_IN_REQUIRED
route.home.{greeting, subtitle}
```

### 테스트 (FE)

- `api/client.test.ts` (7 cases) — MSW success/400
- `useCheckIn.test.tsx` (n) — optimistic ≤100ms + rollback ≤1s + toast
- `useCheckOut.test.tsx` (n) — 동일 패턴 + CHECK_IN_REQUIRED i18n 매핑
- `DashboardClock.test.tsx` — 44px / tabular-nums / aria
- `AttendanceCard.test.tsx` (8 cases) — 5 상태 (loading / pre-checkIn / checkedIn / checkedOut / autoClosed) + 키보드 Enter/Space
- `CheckInButton.test.tsx` — disabled 조건 + aria-label
- 통합: `home.test.tsx`, 회귀: `critical-path-1/6` mock에 today endpoint 추가

전체: **96/96 PASS**, `tsc --noEmit` exit 0, `lint` 0 errors, `build` 248kB gzip.

## Done When 체크 (전부 ✅)

### Backend
- [x] AttendanceRecord 테이블 + UNIQUE + 인덱스
- [x] /check-in IP/UA 자동 + 두번째 첫 클릭 보존
- [x] /check-out 출근 없으면 400 CHECK_IN_REQUIRED
- [x] 상태 판정 (normal / late / early_leave)
- [x] 자정 KST auto-close cron + advisory lock + --dry-run
- [x] cmd/cron --job=auto-close
- [x] coverage ≥ 80%

### Frontend
- [x] 대시보드 시계 44px tabular-nums
- [x] 출퇴근 카드 radius-2xl
- [x] 출근 버튼 옵티미스틱 ≤100ms
- [x] 퇴근 비활성 + inline hint
- [x] 같은 날 두번 클릭 UI 비활성
- [x] 키보드 Enter/Space
- [x] 다크 모드 가독성 (theme tokens only)
- [x] 모바일 sticky top
- [x] toast 결과 명확화
- [x] auto_closed placeholder Alert
- [x] 옵티미스틱 실패 시 1초 안 원복 + warn toast

## TDD 검증 (commit 순서)

```
3fba1f5 test(sprint-4): frontend 대시보드 출퇴근 카드 실패 테스트 (red)  ← FE Red
bee87e3 feat(sprint-4): 대시보드 시계 + 출퇴근 카드 옵티미스틱 UI (green)  ← FE Green
c1278f9 test(sprint-4): AttendanceRecord + auto-close cron 실패 테스트 (red) ← BE Red
2cdc5f7 feat(sprint-4): 출퇴근 + 자정 auto-close cron 구현 (green)        ← BE Green
```

(commit이 time interleaved — BE/FE 에이전트 동시 작업)

## 주요 결정

- **상태 우선순위**: late이면서 early_leave일 때 단일 enum이라 late만 표시 (사용자 인지 우선순위가 지각이 더 강함). 정확한 분류는 통계(Sprint 5)에서 별도 계산.
- **KST 자정 기준 work_date**: `time.Now().In(kst).Truncate(24*time.Hour)`. 23:30 KST 출근 → 23:30의 work_date = today (다음날 안 됨).
- **advisory lock id 분리**: accrual job과 충돌 방지 위해 `fnv64("docflow:attendance-autoclose")` 별도. `withLockID(locker, id, fn)` helper로 SQL은 generic 재사용.
- **Notification stub**: Sprint 8에서 정식화. 본 sprint는 slog 로그 + Frontend Alert 컴포넌트만.
- **FE today endpoint**: `POST /api/hr/attendance/me/today` 가정으로 mock. BE 정식 endpoint가 Sprint 5에서 다른 모양이면 `getToday` URL/wrapper만 교체.

## 다음 sprint

Sprint 5 (통계 + Scoped Querier — Sprint 4 AttendanceRecord에 의존).
Sprint 9 BE는 본 sprint 와 병렬 진행 완료. Sprint 9 FE 가 다음 작업.
