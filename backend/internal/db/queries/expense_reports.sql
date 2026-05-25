-- Sprint 7: expense_reports CRUD + 결재 상태 전이 + 첨부 URL 업데이트.

-- name: GetExpenseReportByID :one
SELECT id, tenant_id, requester_id, amount_won, vendor, purpose, paid_at, attachment_url,
       status, approver_id, decided_at, decision_comment, created_at, updated_at
FROM expense_reports
WHERE id = $1
  AND tenant_id = $2;

-- name: GetExpenseReportForUpdate :one
-- Approve/Reject 트랜잭션 내부 — SELECT FOR UPDATE 로 동시성 보호.
SELECT id, tenant_id, requester_id, amount_won, vendor, purpose, paid_at, attachment_url,
       status, approver_id, decided_at, decision_comment, created_at, updated_at
FROM expense_reports
WHERE id = $1
  AND tenant_id = $2
FOR UPDATE;

-- name: CreateExpenseReport :one
INSERT INTO expense_reports (tenant_id, requester_id, amount_won, vendor, purpose, paid_at,
                              approver_id, status)
VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
RETURNING id, tenant_id, requester_id, amount_won, vendor, purpose, paid_at, attachment_url,
          status, approver_id, decided_at, decision_comment, created_at, updated_at;

-- name: UpdateExpenseReportDecision :one
-- Approve/Reject 공용 — status + approver_id + decided_at + decision_comment 업데이트.
UPDATE expense_reports
SET status = $3,
    approver_id = $4,
    decided_at = $5,
    decision_comment = $6,
    updated_at = now()
WHERE id = $1
  AND tenant_id = $2
RETURNING id, tenant_id, requester_id, amount_won, vendor, purpose, paid_at, attachment_url,
          status, approver_id, decided_at, decision_comment, created_at, updated_at;

-- name: CancelExpenseReport :one
-- Cancel — 본인이 pending 상태일 때만. WHERE status='pending' 으로 race 방지.
UPDATE expense_reports
SET status = 'cancelled',
    updated_at = now()
WHERE id = $1
  AND tenant_id = $2
  AND requester_id = $3
  AND status = 'pending'
RETURNING id, tenant_id, requester_id, amount_won, vendor, purpose, paid_at, attachment_url,
          status, approver_id, decided_at, decision_comment, created_at, updated_at;

-- name: UpdateExpenseReportAttachment :one
-- 첨부 업로드 후 url 갱신. 본인만 호출 가능 (handler 권한 검증).
UPDATE expense_reports
SET attachment_url = $3,
    updated_at = now()
WHERE id = $1
  AND tenant_id = $2
RETURNING id, tenant_id, requester_id, amount_won, vendor, purpose, paid_at, attachment_url,
          status, approver_id, decided_at, decision_comment, created_at, updated_at;

-- name: ListExpenseReportsByRequester :many
SELECT id, tenant_id, requester_id, amount_won, vendor, purpose, paid_at, attachment_url,
       status, approver_id, decided_at, decision_comment, created_at, updated_at
FROM expense_reports
WHERE requester_id = $1
  AND tenant_id = $2
ORDER BY created_at DESC, id DESC
LIMIT $3 OFFSET $4;

-- name: CountExpenseReportsByRequester :one
SELECT COUNT(*) FROM expense_reports
WHERE requester_id = $1
  AND tenant_id = $2;

-- name: ListPendingExpenseReportsByApprover :many
-- 결재자 대기함. approver_id 매칭 + status='pending'.
SELECT id, tenant_id, requester_id, amount_won, vendor, purpose, paid_at, attachment_url,
       status, approver_id, decided_at, decision_comment, created_at, updated_at
FROM expense_reports
WHERE approver_id = $1
  AND tenant_id = $2
  AND status = 'pending'
ORDER BY created_at ASC, id ASC
LIMIT $3 OFFSET $4;

-- name: CountPendingExpenseReportsByApprover :one
SELECT COUNT(*) FROM expense_reports
WHERE approver_id = $1
  AND tenant_id = $2
  AND status = 'pending';
