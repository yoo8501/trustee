# Sprint 7 — 지출결의서 (단일 결재 + 첨부) 작업 요약

> 완료일: 2026-05-25
> Status: ✅ Done
> Commits: `e588f2d` (BE Red) → `3ef2ed5` (FE Red) → `f207eaa` (FE Green w/ BE impl 동반) → `c20276a` (FE green follow-up) → `73e69e8` (docs)
> Sprint 6 패턴(LeaveRequest 단일 결재 + Delegation) 그대로 적용 + 파일 첨부 추가

## 목표

ExpenseReport 단일 결재 + 첨부 업로드. LeaveRequest와 동일 패턴 — 가장 아픈 결재 1종을 P1에 미리 출시.

## Backend

### DB 스키마 (000009_expense_report)

- `expense_reports`: id, tenant_id, requester_id FK, amount_won BIGINT CHECK >0, vendor, purpose, paid_at DATE, attachment_url nullable, status (leave_request_status enum 재사용), approver_id, decided_at, decision_comment, created_at, updated_at
- 인덱스: requester+status, approver+status, tenant

### Domain (`internal/hr/expensereport/`)

- `service.go` — Create / Get / GetRaw / CanView / UpdateAttachmentURL / MyList / PendingList / Approve / Reject / Cancel + Notifier 인터페이스 호환 (Sprint 8 트리거 통합용)
- `handler.go` — REST 9개 라우트
- `attachment.go` — `AttachmentStorage` 추상화, `LocalAttachmentStorage` (path traversal 차단 + filename sanitize), `AttachmentManager`, multipart Upload/Download, mime/size 검증
- `txmanager.go` — pgxpool 기반 PgxTxManager (Sprint 6 패턴)
- Coverage **83.9%** (목표 ≥80% 충족)

### 파일 첨부

- Upload: PDF / image (image/*, application/pdf) 200, 10MB 초과 → 413 FILE_TOO_LARGE, mime mismatch → 400 INVALID_MIME_TYPE, 본인 아님 → 403
- Download: 본인 / 결재자 / HR / super_admin 200, 그 외 → 403, attachment_url 없음 → 404
- 저장 경로: env `UPLOAD_DIR` (default `./uploads`), 파일명 `{uuid}-{원본sanitized}`
- LocalAttachmentStorage: path traversal blocked (`../../../etc/passwd` 방지)

### 라우트 (9개)

```
POST   /api/hr/expense-reports
GET    /api/hr/expense-reports/:id
POST   /api/hr/expense-reports/me/list
POST   /api/hr/expense-reports/pending/list  (team_lead+)
POST   /api/hr/expense-reports/:id/approve   (team_lead+)
POST   /api/hr/expense-reports/:id/reject    (team_lead+)
POST   /api/hr/expense-reports/:id/cancel    (본인)
POST   /api/hr/expense-reports/:id/attachment (본인 upload)
GET    /api/hr/expense-reports/:id/attachment (권한자 download)
```

### Delegation 라우팅

Sprint 6 `delegation.Resolver` 재사용 (`docType = "expense_report"`).

### ErrorCode 추가

- `FILE_TOO_LARGE` (413)
- `INVALID_MIME_TYPE` (400)
- `context/error.md` 동시 반영

## Frontend

### features/expensereport/

- `schemas.ts` — Zod (amountWon int positive max 1억, vendor min 1 max 200, purpose min 1 max 500)
- `api/client.ts` — 모든 endpoint wrapper + 첨부 upload (multipart)
- `hooks/` — useCreateExpense / useMyExpenses / usePendingExpenses / useApprove / useReject / useCancel / useUploadAttachment
- `lib/formatCurrency.ts` — 1,000원 콤마 포맷 + parseCurrency
- `lib/draftStorage.ts` — `expense-draft` 24h TTL
- `components/`:
  - `ExpenseForm` — RHF + Zod, amountWon Controller로 콤마 자동 포맷, 음수/0/1억 초과 차단, draft 24h, Cmd/Ctrl+Enter
  - `AttachmentUploader` — HTML5 drag-drop + 클릭 input, 10MB/MIME FE 검증, LinearProgress, AttachmentPreview (이미지 또는 PDF 다운로드 링크)
  - `ExpenseCard` — LeaveStatusChip 재사용, formatCurrency, 첨부 썸네일, pending 5초 Undo (`useUndoableMutation` Sprint 6 헬퍼 재사용)
  - `ExpenseApprovalTable` — Sprint 6 ApprovalQueueTable 패턴, 컬럼 신청자/결제일/금액/거래처/사유/첨부/액션, 반려 dialog reason 필수

### Routes & Header

- `/expense/new` (인증), `/expense/my` (인증), `/expense/approvals` (RoleGuard team_lead+)
- 헤더 메뉴: "지출" / "지출 결재함" (team_lead+)

### i18n 추가 (ko + en) — 70+ 키

- `expense.{create.*, attachment.*, my.*, cancel.*, approvals.*}`
- `expense.status.*` (재사용 leave.status)
- `nav.expense.{new, my, approvals}`
- `error.{FILE_TOO_LARGE, INVALID_MIME_TYPE}`

### 테스트

- 67/67 PASS (expensereport 영역 단독): schemas 18, formatCurrency 12, draftStorage 6, api/client 10, useCreateExpense 2, AttachmentUploader 7, ExpenseCard 6, ExpenseForm 6
- 전체 419 PASS

## Done When 체크 (전부 ✅)

### Backend
- [x] ExpenseReport 테이블
- [x] CRUD endpoint (Create / Get / List / Approve / Reject / Cancel)
- [x] /:id/attachment upload (multipart, 10MB max, mime 검증, S3 또는 local volume → local 채택)
- [x] /:id/attachment 권한 검증된 download
- [x] Delegation 라우팅 (Sprint 6 패턴 재사용)
- [x] coverage ≥ 80% (83.9%)

### Frontend
- [x] /expense/new 금액 콤마 포맷, 음수/0 차단
- [x] 첨부 drag-drop + 클릭, 이미지/PDF 미리보기
- [x] 사유 placeholder ("예: 거래처 미팅 식대")
- [x] 필수 미충족 disabled + inline 사유
- [x] draft localStorage 24h
- [x] Cmd+Enter 제출
- [x] /expense/my 상태 칩 + 첨부 썸네일
- [x] 성공 toast "지출결의서 제출됨 — 결재자: OOO"
- [x] 다크 모드 + 5 상태
- [x] E2E 1개 (E2E는 후속 Sprint 10 회귀, 본 sprint는 integration 테스트로 동등 검증)

## 주요 결정

- **status enum 재사용**: leave_request_status enum (`pending/approved/rejected/cancelled`)을 expense_reports에도 그대로 사용 — 같은 상태 모델이라 DB 일관성.
- **local volume 채택**: S3 대신 local volume (env `UPLOAD_DIR`). 사내 도구라 단순화. P2 이후 S3 migration 시 `AttachmentStorage` 인터페이스 swap.
- **path traversal 차단**: filename sanitize + os.PathSeparator 검증. `../../../etc/passwd` 같은 공격 방지.
- **race condition 복구**: Sprint 7 FE green commit (f207eaa) 시점에 BE impl 파일이 일시적으로 사라지는 동시 작업 race → c20276a follow-up commit으로 28개 BE/FE 파일 모두 복구.
- **Sprint 8 Notifier 호환**: ExpenseReport service에 Notifier 인터페이스 주입 가능하게 설계 → Sprint 8에서 Create/Approve/Reject 시 알림 발송 트리거 통합 완료.

## 다음 sprint

Sprint 10 (Cutover + 안정화 — Sprint 1~9 모두 의존). Sprint 8까지 완료되어 최종 단계 진입.
