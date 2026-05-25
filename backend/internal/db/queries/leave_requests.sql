-- Sprint 6: leave_requests CRUD + 결재 상태 전이 + 잔여 차감 트랜잭션 지원.

-- name: GetLeaveRequestByID :one
SELECT id, tenant_id, requester_id, leave_type_id, start_at, end_at, hours, reason,
       status, approver_id, decided_at, decision_comment, created_at, updated_at
FROM leave_requests
WHERE id = $1
  AND tenant_id = $2;

-- name: GetLeaveRequestForUpdate :one
-- Approve/Reject 트랜잭션 내부 — SELECT FOR UPDATE 로 동시성 보호.
SELECT id, tenant_id, requester_id, leave_type_id, start_at, end_at, hours, reason,
       status, approver_id, decided_at, decision_comment, created_at, updated_at
FROM leave_requests
WHERE id = $1
  AND tenant_id = $2
FOR UPDATE;

-- name: CreateLeaveRequest :one
INSERT INTO leave_requests (tenant_id, requester_id, leave_type_id, start_at, end_at,
                            hours, reason, approver_id, status)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
RETURNING id, tenant_id, requester_id, leave_type_id, start_at, end_at, hours, reason,
          status, approver_id, decided_at, decision_comment, created_at, updated_at;

-- name: FindOverlappingLeaveRequests :many
-- 같은 사용자, pending|approved 상태에서 [start_at, end_at] 가 겹치는 신청 검색.
-- 중복 검증 (DUPLICATE_LEAVE_DATE) 에 사용.
SELECT id, tenant_id, requester_id, leave_type_id, start_at, end_at, hours, reason,
       status, approver_id, decided_at, decision_comment, created_at, updated_at
FROM leave_requests
WHERE requester_id = $1
  AND tenant_id = $2
  AND status IN ('pending', 'approved')
  AND start_at < $4
  AND end_at > $3;

-- name: UpdateLeaveRequestDecision :one
-- Approve/Reject 공용 — status + approver_id + decided_at + decision_comment 업데이트.
UPDATE leave_requests
SET status = $3,
    approver_id = $4,
    decided_at = $5,
    decision_comment = $6,
    updated_at = now()
WHERE id = $1
  AND tenant_id = $2
RETURNING id, tenant_id, requester_id, leave_type_id, start_at, end_at, hours, reason,
          status, approver_id, decided_at, decision_comment, created_at, updated_at;

-- name: CancelLeaveRequest :one
-- Cancel — 본인이 pending 상태일 때만. WHERE status='pending' 으로 race 방지.
UPDATE leave_requests
SET status = 'cancelled',
    updated_at = now()
WHERE id = $1
  AND tenant_id = $2
  AND requester_id = $3
  AND status = 'pending'
RETURNING id, tenant_id, requester_id, leave_type_id, start_at, end_at, hours, reason,
          status, approver_id, decided_at, decision_comment, created_at, updated_at;

-- name: ListLeaveRequestsByRequester :many
SELECT id, tenant_id, requester_id, leave_type_id, start_at, end_at, hours, reason,
       status, approver_id, decided_at, decision_comment, created_at, updated_at
FROM leave_requests
WHERE requester_id = $1
  AND tenant_id = $2
ORDER BY created_at DESC, id DESC
LIMIT $3 OFFSET $4;

-- name: CountLeaveRequestsByRequester :one
SELECT COUNT(*) FROM leave_requests
WHERE requester_id = $1
  AND tenant_id = $2;

-- name: ListPendingLeaveRequestsByApprover :many
-- 결재자 대기함. approver_id 매칭 + status='pending'.
SELECT id, tenant_id, requester_id, leave_type_id, start_at, end_at, hours, reason,
       status, approver_id, decided_at, decision_comment, created_at, updated_at
FROM leave_requests
WHERE approver_id = $1
  AND tenant_id = $2
  AND status = 'pending'
ORDER BY created_at ASC, id ASC
LIMIT $3 OFFSET $4;

-- name: CountPendingLeaveRequestsByApprover :one
SELECT COUNT(*) FROM leave_requests
WHERE approver_id = $1
  AND tenant_id = $2
  AND status = 'pending';

-- name: IncrementLeaveBalanceUsed :one
-- Approve 트랜잭션 내부 — UPSERT 로 잔여 row 없으면 0 granted 로 생성 + used += hours.
INSERT INTO leave_balances (tenant_id, user_id, leave_type_id, period_year,
                            granted_hours, used_hours)
VALUES ($1, $2, $3, $4, 0, $5)
ON CONFLICT (user_id, leave_type_id, period_year)
DO UPDATE SET used_hours = leave_balances.used_hours + EXCLUDED.used_hours,
              updated_at = now()
RETURNING id, tenant_id, user_id, leave_type_id, period_year,
          granted_hours, used_hours, expires_at, created_at, updated_at;

-- name: FetchApprovedLeaveDaysForUsers :many
-- Sprint 6 stats integration — Scoped Querier 가 일별 휴가 펼치기 위해 호출.
-- approved 상태의 휴가만 통계 보정에 반영.
SELECT lr.id, lr.requester_id, lr.start_at, lr.end_at, lr.hours,
       lt.code AS leave_type_code, lt.default_hours
FROM leave_requests lr
JOIN leave_types lt ON lt.id = lr.leave_type_id AND lt.tenant_id = lr.tenant_id
WHERE lr.requester_id = ANY(sqlc.arg('user_ids')::bigint[])
  AND lr.tenant_id = sqlc.arg('tenant_id')
  AND lr.status = 'approved'
  AND lr.start_at::date <= sqlc.arg('to_date')::date
  AND lr.end_at::date >= sqlc.arg('from_date')::date;
