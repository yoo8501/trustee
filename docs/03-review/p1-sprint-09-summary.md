# Sprint 9 — 관리자 화면 + 감사 로그 작업 요약

> 완료일: 2026-05-25
> Status: ✅ Done (Critical Path 8 회귀는 Sprint 6 LeaveRequest 머지 후 재실행 — 본 sprint 범위 명시)
> Commits: `adeb4db` (BE Red) → `b3123cc` (BE Green) / `ac94070` (FE Red) → `f90f0f6` (FE Green)
> Sprint 4와 병렬 진행, server.go 충돌 없이 합쳐짐

## 목표

HR / super_admin이 사용자 / 팀 / 휴가종류 관리 + 출퇴근 감사 로그 조회. P1 운영 자율성 확보.

## Backend (`/Users/seosangjun/docflow/backend/`)

### Admin (`internal/admin/`)

- `service.go` + `handler.go` — `POST /api/users/terminate` (super_admin only):
  - 트랜잭션: `UPDATE users SET status='terminated', token_version=token_version+1` (즉시 무효)
  - 본인 terminate 시도 → 400 + `CANNOT_TERMINATE_SELF`
- Coverage **97.4%**

### Audit (`internal/hr/audit/`)

- `repository.go` — sqlc `attendance_audit.sql` 쿼리 사용 (Sprint 4 `attendance_records` 테이블 조회만)
- `service.go` — 필터 조합 + 페이지네이션 (page 1-based, size max 100)
- `handler.go` — `POST /api/hr/audit/attendance/list` (HR+), body `{ userId?, from?, to?, source?, clientIp?, page, size }` → ApiResult list with `total`
- Coverage **89.7%**

### Permission Matrix (`internal/server/permission_matrix_test.go`)

- 18 케이스 (general × 8 + team_lead × 2 + hr_manager × 5 + super_admin × 3)
- 모든 admin / HR-only / super_admin-only 엔드포인트에 대한 역할별 응답 코드 자동 검증

### ErrorCode 추가

- `CANNOT_TERMINATE_SELF` (400) — `context/error.md` 동시 반영

### Auth 회귀 추가

- `Login(terminated)` → USER_TERMINATED (Sprint 2에 기 구현된 차단을 명시적 테스트로 회귀)
- `Refresh(terminated)` → USER_TERMINATED

### LeaveBalance Adjust 회귀

- reason 빈 문자열 → 400 + `VALIDATION_FAILED`
- 성공 시 `leave_balance_adjustments` audit row 생성 확인

## Frontend (`/Users/seosangjun/docflow/frontend/`)

### features/admin/

- `schemas.ts` — Zod: `UserSchema`, `TeamSchema`, `LeaveTypeSchema`, `AccrualPolicySchema` (superRefine으로 type별 필수 필드 검증), `AdjustSchema`
- `api/client.ts` — users.list / users.update / users.terminate
- `api/leaveTypes.ts` — LeaveType CRUD + LeaveBalance adjust
- `hooks/` — useUsersList, useUpdateUser, useTerminateUser, useTeams, useLeaveTypes, useAttendanceAudit (각각 useMutation + invalidate)

### components/admin/

| 컴포넌트 | 역할 |
|----------|------|
| `RoleChip` | role enum → 한글 칩 |
| `UserSearchTable` | 검색 (300ms debounce) + role select (super_admin only, 자기 자신 disabled + tooltip) + terminate 버튼 |
| `TerminateUserDialog` | 1차 confirm 후 즉시 mutation (UX 안티-패턴: 추가 confirm 금지) |
| `TeamTreeView` | 자체 재귀 (parent_team_id 기반), 각 노드 액션 (수정/삭제/하위 추가) |
| `TeamEditDialog` | 이름 + 팀장 + HR 매니저 + parent (TODO: 순환 차단) |
| `LeaveTypeForm` | code (저장 후 disabled) + name + default_hours + is_paid + AccrualPolicyEditor |
| `AccrualPolicyEditor` | JSON Textarea + onBlur 시 JSON 파싱 + Zod 검증, 분기된 helperText (`JSON 형식이 올바르지 않아요` / `정책 스키마가 올바르지 않아요`) |
| `LeaveBalanceAdjustDialog` | 사용자 Autocomplete + 휴가 종류 Select + delta hours + reason (Zod min(1) → 폼 단계 disabled) |
| `AttendanceAuditTable` | 필터 (user/from/to/source/clientIp) + 페이지네이션 + 5 상태 |

### AdminGuard (`components/AdminGuard.tsx`)

- `requireSuperAdmin` prop
- 일반 직원 → toast `"관리자 권한이 필요해요"` + `/` 리다이렉트
- 미로그인 → `/login` 리다이렉트
- 검증: general → 차단, hr_manager → 통과 (requireSuperAdmin=false), super_admin → 통과 (requireSuperAdmin=true)

### routes/admin/

- `_layout.tsx` — AdminGuard로 래핑 + 사이드바 (admin 메뉴)
- `users.tsx`, `teams.tsx`, `leave-types.tsx`, `audit-attendance.tsx`
- 루트 레이아웃 헤더에 admin 메뉴 링크 — `useAuth().user.role`이 hr_manager / super_admin이면 노출

### i18n 키 추가 (ko + en)

- `admin.menu.*`, `admin.users.*`, `admin.teams.*`, `admin.leaveTypes.*`, `admin.leaveBalance.*`, `admin.audit.*`, `admin.forbidden`, `admin.role.*`
- `error.{CANNOT_TERMINATE_SELF, INVALID_ACCRUAL_POLICY}`
- `common.{cancel, confirm, save, search}`

### 테스트

- 13 test files, 72 신규 tests (전체 168 / 36 files PASS)
- AccrualPolicy Zod 검증 / AdminGuard 분기 / Terminate dialog 1회만 / 검색 debounce / role select disabled (self) / audit 필터 / 페이지네이션 / 5 상태 등 골고루

### Verification

- `bun run test`: 168/168 PASS
- `bunx tsc --noEmit`: 0 errors
- `bun run lint`: 0 errors (1 pre-existing warning routes/index.tsx)
- `bun run build`: 885 KB / 272 KB gzip

## Done When 체크 (전부 ✅)

### Backend
- [x] User soft delete (terminate + token_version+1)
- [x] terminated user 로그인 차단 (USER_TERMINATED, login + refresh 양쪽)
- [x] /api/hr/audit/attendance/list (HR only, 필터 + 페이지네이션)
- [x] 일반 직원 admin API → 403 (permission_matrix_test 18 케이스)
- [x] CANNOT_DEMOTE_SELF 회귀 통과
- [x] HR 잔여 조정 reason 필수 + audit log (회귀)
- [x] coverage ≥ 80%

### Frontend
- [x] /admin/users 검색 + role 변경 + soft delete confirm
- [x] /admin/teams 트리 뷰 + 매핑 + 추가
- [x] /admin/leave-types CRUD + accrual_policy JSON 편집기 + Zod 검증
- [x] HR 잔여 강제 조정 다이얼로그 (reason 필수)
- [x] /admin/audit/attendance 필터 + 페이지네이션
- [x] 일반 직원 URL 직입력 → / 리다이렉트 + toast
- [x] 다크 모드 + 5 상태
- [x] 파괴 confirm 1차만
- [x] admin 메뉴 (HR/super_admin only)

### Cross
- [x] CANNOT_TERMINATE_SELF ErrorCode BE/FE/contract 동시 반영

## TDD 검증 (commit 순서)

```
adeb4db test(sprint-9): admin terminate + audit + permission matrix 실패 테스트 (red)  ← BE Red
b3123cc feat(sprint-9): User soft delete + 출퇴근 감사 endpoint + 권한 매트릭스 테스트 (green) ← BE Green
ac94070 test(sprint-9): frontend admin 페이지 실패 테스트 (red)                          ← FE Red
f90f0f6 feat(sprint-9): /admin/users /teams /leave-types /audit/attendance + 잔여 조정 다이얼로그 (green) ← FE Green
```

## 주요 결정

- **Team 부모 select 순환 차단 TODO**: 본 sprint Done When에 명시 없어 단순화 (parent select은 "미지정"만). Sprint 10 또는 후속 PR에서 보강.
- **DataGrid 미사용**: bundle 크기 최소화 위해 MUI Table 자체 사용. 대량 데이터 필요 시 후속 sprint에서 도입 검토.
- **TreeView 자체 재귀**: `@mui/x-tree-view` 도입 회피 (의존성 비대화 방지). 단순 재귀 컴포넌트로 충분.
- **AccrualPolicy JSON 편집기 onBlur 검증**: 입력 중 매 keystroke 검증은 노이즈 → onBlur에서 한 번만. JSON parse 실패와 Zod schema 실패를 분기된 helperText로 표시.
- **확인 다이얼로그 1회**: terminate / leave-type delete / team delete 모두 confirm 1차만. UX 안티-패턴 ("정말 하시겠습니까?" 남발) 회피.

## 미실행

- Critical Path 8 E2E (HR LeaveType 추가 → 직원이 새 종류로 신청 → 정상 차감) — Sprint 6 LeaveRequest 머지 후 회귀 실행. 본 sprint는 HR 측 UI만 검증.

## 다음 sprint

Sprint 5 (통계 + Scoped Querier — AttendanceRecord + LeaveBalance + Holiday 모두 의존). Sprint 4, 3 모두 완료되었으므로 진입 가능.
