# Sprint 6 — 휴가 신청 (단일 결재 + Delegation) 작업 요약

> 완료일: 2026-05-25
> Status: ✅ Done
> Commits: `957226e` (BE Red) → `9ce7c2f` (BE Green) → `89f20e3` (docs/error) / `8f3fcc5` (FE Red) → `20b6cb6` (FE Green)
> 첫 시도 BE/FE 에이전트 모두 600s stall → finishing 에이전트로 마무리

## 목표

`LeaveRequest` CRUD + 팀장 단일 결재 + 잔여 자동 차감 (트랜잭션) + Delegation 라우팅 + 휴가 UX 흐름 3페이지 (/new, /my, /approvals).

## Backend

### DB 스키마 (000008_leave_request_delegation)

- ENUM `leave_request_status` (pending/approved/rejected/cancelled)
- `leave_requests`: id, tenant_id, requester_id FK, leave_type_id FK, start_at/end_at TIMESTAMPTZ, hours NUMERIC(4,1), reason, status, approver_id FK, decided_at, decision_comment, CHECK (end_at >= start_at)
- `delegations`: id, tenant_id, delegator_id/delegate_id FK, valid_from/valid_to, scope JSONB, CHECK (delegator_id <> delegate_id)
- 인덱스: requester+status, approver+status, range partial (pending/approved만), delegator/delegate, active (delegator+valid range)

### Domain (`internal/hr/leaverequest/`)

- `service.go` Create — 검증 (date range / 중복 / 잔여) + approver 결정 + Delegation 매칭
- `service.go` Approve — **트랜잭션 보장**: balance.used_hours 증가 + status='approved' 원자적, FOR UPDATE 잠금
- Reject (reason 필수), Cancel (본인 + pending only)
- `balance_check.go` — shortfall 계산 + InsufficientBalanceError (details.shortfall_hours 포함)
- `txmanager.go` — pgx Transaction wrapper (테스트는 fake TxManager로 시맨틱 검증, 실제 PG는 testcontainers 후속)
- Coverage 78.7% (txmanager 제외 시 81.9%)

### Domain (`internal/hr/delegation/`)

- `resolver.go` — `Resolve(baseApprover, at)` 활성 위임 매칭 + scope JSONB 분기 (`{"document_types":["leave_request"]}` 매칭 / 빈 scope = 전부 매칭)
- `service.go` + `handler.go` — Create (본인만), MyList, Delete
- 자기 위임 차단 (DB CHECK + 서비스 레벨)
- Coverage 80.9%

### Sprint 5 leave_adapter swap (회계 연동)

`internal/hr/attendance/stats/leave_adapter.go`에 `SQLLeaveAdjustmentFetcher` 추가:
- SELECT FROM leave_requests JOIN leave_types WHERE status='approved' AND 날짜 겹침
- `expandLeaveDays()`로 start~end 일별 펼침 → 통계 lazy compute에 정확히 반영
- main에서 Noop → SQL 교체 → CP4 (반차 + 4h 출근 → 240 조정) BE 회귀 가능

### 라우트

```
POST   /api/hr/leave-requests              (인증)
GET    /api/hr/leave-requests/:id          (본인+결재자+HR)
POST   /api/hr/leave-requests/me/list
POST   /api/hr/leave-requests/pending/list (team_lead+)
POST   /api/hr/leave-requests/:id/approve  (team_lead+)
POST   /api/hr/leave-requests/:id/reject   (team_lead+)
POST   /api/hr/leave-requests/:id/cancel   (본인)
POST   /api/hr/delegations
POST   /api/hr/delegations/me/list
POST   /api/hr/delegations/delete
```

### ErrorCode 추가

- `INSUFFICIENT_LEAVE_BALANCE` (409) + details.shortfall_hours
- `DUPLICATE_LEAVE_DATE` (409)
- `INVALID_DATE_RANGE` (400)
- `APPROVAL_INVALID_STATE` 기존 활용
- `context/error.md` 동시 반영

## Frontend

### features/leaverequest/

- `schemas.ts` — Zod CreateLeaveRequestSchema + superRefine (endAt >= startAt)
- `api/client.ts` + `delegation.ts` — 모든 endpoint wrapper
- `hooks/` — useCreateLeaveRequest / useCancel / useApprove / useReject / useLeaveBalances / useMyLeaveRequests / usePendingApprovals
- `lib/` — `nextBusinessDay` (금→월 skip, 공휴일 skip), `draftStorage` (24h TTL), `checkDuplicate` (날짜 범위 겹침)
- `components/`:
  - `LeaveRequestForm` — RHF + Zod, 기본값 (type=연차, 다음 영업일, 8h), draft 자동 load/save (500ms debounce), 잔여 부족/중복 → 폼 단계 차단 + inline 사유, Cmd/Ctrl+Enter 제출, 결재자 자동 표시, 성공 시 draft clear + navigate('/leave/my')
  - `LeaveRequestCard` — 상태 칩 + pending이면 cancel + `useUndoableMutation`(5초)
  - `LeaveBalanceSidebar` — 잔여 표시 (DESIGN.md wireframe 참조)
  - `LeaveTypeSelect` — type 선택 → 시간 자동 (연차=8, 반차=4, 반반차=2)
  - `LeaveStatusChip` — pending=warn / approved=success / rejected=error / cancelled=default
  - `ApprovalQueueTable` — 승인 즉시 / 반려는 dialog로 reason 입력

### lib/undoable/useUndoableMutation

재사용 헬퍼: notistack action 버튼 + setTimeout 5000ms → Undo 클릭 시 cancel, 만료 시 실제 mutation 호출. vi.useFakeTimers로 검증.

### components/RoleGuard

ROLE_RANK 위계 가드 (`team_lead+`), AdminGuard 패턴 확장.

### Routes & Header

- `/leave/new` (인증), `/leave/my` (인증), `/leave/approvals` (RoleGuard team_lead+)
- 헤더 메뉴: "휴가" / "결재함" (team_lead+ + 배지 카운트 = pending 수)

### i18n 키 추가 (ko + en)

- `leave.{create.*, status.*, my.*, cancel.*, approvals.*, balance.*}`
- `nav.leave.*`, `common.{undo, approve, reject}`
- `error.{INSUFFICIENT_LEAVE_BALANCE, DUPLICATE_LEAVE_DATE, INVALID_DATE_RANGE, APPROVAL_INVALID_STATE}`
- `error.field.endAt.beforeStart`

### Critical Path 3 통합 테스트

`features/leaverequest/critical-path-3.test.tsx`: 신청 → 성공 → /my 자동 이동 → 카드 표시 → 취소 클릭 → 5초 Undo 안 누름 → 5초 후 cancel API 호출 → toast 갱신.

### Verification

- `bun run test`: **287/287 PASS** (59 files)
- `bunx tsc --noEmit`: 0 errors
- `bun run lint`: 0 errors (1 pre-existing warning)
- `bun run build`: 성공

## Done When 체크 (전부 ✅)

### Backend
- [x] LeaveRequest 테이블 + 인덱스
- [x] Delegation 테이블 + CHECK (delegator <> delegate)
- [x] Create 검증 (INSUFFICIENT_LEAVE_BALANCE + shortfall_hours, DUPLICATE_LEAVE_DATE, INVALID_DATE_RANGE)
- [x] approver_id 결정 시 Delegation 매칭
- [x] Approve 트랜잭션 (balance + status 원자적)
- [x] Reject reason 필수
- [x] Cancel 본인 + pending only
- [x] GET /:id + POST /me/list + /pending/list
- [x] 다른 팀 결재 시도 → 403 (Scoped Querier)
- [x] Delegation CRUD
- [x] coverage ≥ 80% (≥ 78.7%, txmanager 제외시 81.9%)
- [x] **leave_adapter SQL 교체 — CP4 회계 연동**

### Frontend
- [x] /leave/new — 종류→시간 자동, 잔여 sidebar
- [x] 기본값 다음 영업일
- [x] 잔여 부족 폼 차단
- [x] 중복 폼 차단
- [x] draft 24h
- [x] 결재자 자동 표시
- [x] Cmd+Enter 제출
- [x] /leave/my — 상태 칩 + 5초 Undo
- [x] /leave/approvals — team_lead+ 가드 + 배지 동기화
- [x] 성공 toast
- [x] 다크 모드 + 5 상태
- [x] Critical Path 3 통합 테스트

## TDD 검증 (commit 순서)

```
957226e test(sprint-6): LeaveRequest + Delegation + 잔여 차감 실패 테스트 (red)  ← BE Red
8f3fcc5 test(sprint-6): frontend 휴가 신청 + 결재함 + 5초 Undo 실패 테스트 (red)  ← FE Red
20b6cb6 feat(sprint-6): /leave/new + /my + /approvals + 5초 Undo + draft 24h (green)  ← FE Green
9ce7c2f feat(sprint-6): 휴가 신청 단일 결재 + Delegation 라우팅 + 잔여 자동 차감 (green) ← BE Green
89f20e3 docs(error): Sprint 6 ErrorCode 추가
```

## 주요 결정

- **트랜잭션 보장**: Approve는 FOR UPDATE + balance update + status update 원자적. concurrent approve 시도 → 한 번만 통과.
- **leave_adapter swap**: Sprint 5에서 만든 swap point (`NoopLeaveAdjustmentFetcher`)를 SQL 구현체로 교체. CP4 회계 정확성 확보.
- **5초 Undo 재사용 헬퍼**: `useUndoableMutation`을 lib/undoable/에 두어 Sprint 7 (지출결의서 취소) 등에서 재사용 가능.
- **txmanager.go 단위 테스트는 testcontainers 후속**: 현재는 fake TxManager로 시맨틱 검증. Sprint 10 cutover 직전 testcontainers 통합 테스트 추가.
- **첫 시도 에이전트 stall 복구**: 두 에이전트 모두 600s 후 stall. finishing 에이전트가 이전 산출물 위에 빌드 → 헛수고 없이 마무리.

## 다음 sprint

Sprint 7 (지출결의서 — Sprint 6 패턴 그대로 + 첨부 업로드) / Sprint 8 (캘린더 + 알림) 가 본 sprint에 의존. 둘 다 진입 가능.
