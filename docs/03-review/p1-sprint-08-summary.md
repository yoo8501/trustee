# Sprint 8 — 공유 캘린더 + 인앱 알림 작업 요약

> 완료일: 2026-05-25
> Status: ✅ Done
> Commits: `dfb17be` (BE Red) → `27973c6` (BE Green) → `e34e852` (docs) / `439de5b` (FE Red) → `0622bf7` (FE fix)
> Sprint 7과 병렬 진행

## 목표

`GET /api/hr/calendar` view (LeaveRequest + Holiday + AttendanceRecord) + 인앱 알림 (헤더 종 + 사이드바 결재함 배지) + 휴가 종류 색상 토큰 일관성.

## Backend

### DB 스키마 (000010_notification)

- `notifications`: id, tenant_id, user_id FK, type TEXT, title, body, related_url nullable, read_at nullable, created_at
- 인덱스:
  - `idx_notifications_user_unread` partial WHERE `read_at IS NULL`
  - `idx_notifications_user` 일반 ordered

### Notification Service (`internal/hr/notification/`)

- `Notifier` 인터페이스 (cycle 회피용 — 각 도메인은 자체 정의)
- `service.go` — Create / List (unreadOnly 옵션 + pagination) / Read / ReadAll
- `repository.go` — sqlc wrap
- `handler.go` — `/api/hr/notifications/{list, :id/read, read-all}`
- Coverage **84.5%**

### Calendar Service (`internal/hr/calendar/`)

- `service.go` — LeaveRequest (approved + pending) + Holiday + 본인 attendances 조합
- 가시성 마스킹:
  - 휴가 날짜/종류: 전사 노출
  - 휴가 사유: 본인 / 결재자(원/위임) / HR / super_admin만 (그 외 nil)
  - attendances: 본인만 (다른 사용자 출퇴근 노출 X)
- 3개월 한도 (`to - from > 90일` → 400 + `DATE_RANGE_TOO_LARGE`)
- Coverage **80.2%**

### Notifier 트리거 통합 (전부 완료)

| 도메인 | 트리거 지점 | type |
|--------|-------------|------|
| Sprint 6 leaverequest | Create | `leave_request_submitted` → 결재자 |
| Sprint 6 leaverequest | Approve | `leave_request_approved` → 신청자 |
| Sprint 6 leaverequest | Reject | `leave_request_rejected` → 신청자 |
| Sprint 7 expensereport | Create | `expense_submitted` → 결재자 |
| Sprint 7 expensereport | Approve | `expense_approved` → 신청자 |
| Sprint 7 expensereport | Reject | `expense_rejected` → 신청자 |
| Sprint 4 attendance autoclose | cron mark | `attendance_auto_closed` → 본인 |

server.go / cmd/cron/main.go가 `notification.Service`를 어댑터로 각 도메인 Notifier에 주입. 도메인은 notification 패키지를 직접 import하지 않음 (cycle 회피).

### ErrorCode 추가

- `DATE_RANGE_TOO_LARGE` (400)
- `context/error.md` 동시 반영

### 자동 가시성 검증

- `TestService_List_NoMissingEvents_LeavesAndHolidaysBothIncluded` — Holiday + LeaveRequest + 본인 attendances 모두 응답 포함
- reason 마스킹: 본인 / 결재자 / HR 권한자만 노출, 그 외 nil (4 케이스)
- 본인 외 attendances 노출 차단

### 라우트 (4개)

```
POST /api/hr/calendar/list           (인증)
POST /api/hr/notifications/list      (인증)
POST /api/hr/notifications/:id/read  (인증, 본인)
POST /api/hr/notifications/read-all  (인증, 본인)
```

## Frontend

### features/calendar/

- `schemas.ts` — CalendarLeave/Holiday/Attendance/Response Zod (reason null 허용)
- `lib/leaveColor.ts` — 코드 → theme token 매핑 (light/dark hue 유지)
- `lib/storage.ts` — localStorage 마지막 뷰 + 마지막 달 영속화
- `lib/monthGrid.ts` — 42셀 그리드 + intersectsDate + buildWeekDays + shiftMonth
- `api/client.ts` — `POST /api/hr/calendar/list` (DATE_RANGE_TOO_LARGE 처리)
- `hooks/useCalendar.ts` — TanStack Query 래퍼
- `components/MonthView` — 7×6 직접 구현 (라이브러리 무의존, bundle 절약), 일요일/공휴일 색상, 색맹 대응 (색 + 텍스트 라벨)
- `components/CalendarEvent` — 휴가 chip (approved 채움 / pending 점선 / cancelled 취소선)
- `components/AgendaList` — 주/일 뷰 fallback (월 뷰만 풀 그리드, 주/일은 단순 list)
- `components/ViewSwitcher` — 월/주/일 ToggleButtonGroup
- `components/CalendarView` — 컨테이너 (mobile default 주, desktop default 월, localStorage 마지막 뷰 기억)

### features/notification/

- `schemas.ts` — Notification Zod
- `api/client.ts` — list / read / readAll
- `hooks/useNotifications.ts` + `useReadNotification.ts` (옵티미스틱 + rollback) + `useReadAll.ts`
- `components/NotificationBell` — 헤더 종, 미읽음 badge (warn 색)
- `components/NotificationDropdown` — Popover, 클릭 시 read + navigate(related_url)

### Routes & Header

- `/calendar` 라우트 추가
- 헤더 메뉴: "캘린더" + NotificationBell
- 결재함 배지: `pendingLeave + pendingExpense` 합산 (team_lead+ only)

### i18n 추가 (ko + en)

- `nav.calendar`
- `calendar.{title, view.*, today, prev, next, empty, event.*}`
- `notification.{bell, dropdown.*}`
- `error.DATE_RANGE_TOO_LARGE`

### 자동 캘린더 노출 누락 0건 테스트

`src/routes/calendar.test.tsx > Holiday + LeaveRequest 모두 노출` 통과:
- MSW로 leaves + holidays 동시 응답 → 두 종류 모두 화면 표시 확인

### Verification

- `bun run test`: **419/419 PASS** (78 files)
- `npx tsc --noEmit`: 통과
- `bun run lint`: 0 errors (1 pre-existing warning)

## Done When 체크 (전부 ✅)

### Backend
- [x] /api/hr/calendar/list (LeaveRequest + Holiday + 본인 attendance)
- [x] 가시성 규칙 (휴가 종류 전사, 사유 본인+결재자+HR, 본인 출퇴근만)
- [x] 3개월 한도 (DATE_RANGE_TOO_LARGE)
- [x] Notification 테이블 + Create/List/Read/ReadAll
- [x] 알림 트리거 (Sprint 6/7/4 통합 완료)

### Frontend
- [x] /calendar 월/주/일 뷰 (mobile default 주, desktop default 월)
- [x] 휴가 종류 색상 토큰 (라이트/다크 hue 유지)
- [x] 색맹 대응 (색 + 텍스트 라벨)
- [x] 다른 직원 사유 권한별 노출
- [x] 공휴일 자동 강조
- [x] 본인 출퇴근 표시
- [x] localStorage 마지막 뷰 + 마지막 달
- [x] 헤더 종 (미읽음 dot + 드롭다운 + 옵티미스틱 read)
- [x] 사이드바 결재함 배지 (leave + expense 합산)
- [x] 캘린더 노출 누락 0건 자동 테스트

## TDD 검증 (commit 순서)

```
dfb17be test(sprint-8): Calendar + Notification 실패 테스트 (red)        ← BE Red
439de5b test(sprint-8): frontend 캘린더 + 알림 실패 테스트 (red)         ← FE Red
27973c6 feat(sprint-8): 공유 캘린더 + 인앱 알림 + 결재 트리거 (green)    ← BE Green
0622bf7 fix(sprint-8): NotificationDropdown — <p> 안 <div> 중첩 경고 제거 ← FE polish
e34e852 docs(error): Sprint 8 ErrorCode 추가 (DATE_RANGE_TOO_LARGE)
```

> Sprint 8 FE Green commit은 Sprint 7 FE 동시 작업의 부수효과로 `f207eaa`에 흡수됨 (다른 에이전트가 working tree 전체를 stage). 의도된 별도 commit은 아니지만 결과적으로 모든 파일 정상 트리 반영 + 419 tests 통과.

## 주요 결정

- **Notifier 인터페이스 분산 정의**: leaverequest/expensereport/cron 각 패키지가 자체 `Notifier`/`NewNotification` 타입 정의 + server bootstrap에서 어댑터로 연결. notification 패키지 직접 import 회피 → 순환 의존성 차단 + test fake 주입 용이.
- **MonthView 자체 구현**: react-calendar 등 라이브러리 회피 → bundle 절약, theme token 직접 사용 → 다크 모드 자동.
- **주/일 뷰 단순화**: 시간 제약으로 풀 그리드 대신 agenda list fallback. 시간 여유 시 풀 캘린더 그리드로 확장 가능 (P2 이후).
- **3개월 한도**: 한 번에 너무 큰 범위 조회로 DB 부담 + UI 렌더링 비용 회피. UI에서도 default 1개월 단위 navigation.

## 다음 sprint

Sprint 10 (Cutover + 안정화 — Phase Gate). 모든 의존 sprint 완료.
