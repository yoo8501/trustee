-- name: CreateLeaveBalanceAdjustment :one
INSERT INTO leave_balance_adjustments (tenant_id, balance_id, actor_user_id, delta_hours, reason)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, tenant_id, balance_id, actor_user_id, delta_hours, reason, created_at;

-- name: ListLeaveBalanceAdjustments :many
SELECT id, tenant_id, balance_id, actor_user_id, delta_hours, reason, created_at
FROM leave_balance_adjustments
WHERE balance_id = $1
  AND tenant_id = $2
ORDER BY created_at DESC;

-- name: ListActiveUsersForAccrual :many
SELECT id, tenant_id, email, password_hash, name, status, team_id, manager_id,
       hire_date, role, work_start_time, work_end_time, token_version,
       created_at, updated_at, deleted_at
FROM users
WHERE tenant_id = $1
  AND deleted_at IS NULL
  AND status = 'active'
ORDER BY id ASC;

-- name: TryAdvisoryLockAccrual :one
SELECT pg_try_advisory_lock($1::bigint) AS acquired;

-- name: ReleaseAdvisoryLockAccrual :one
SELECT pg_advisory_unlock($1::bigint) AS released;
