-- name: GetLeaveBalanceByID :one
SELECT id, tenant_id, user_id, leave_type_id, period_year,
       granted_hours, used_hours, expires_at,
       created_at, updated_at
FROM leave_balances
WHERE id = $1
  AND tenant_id = $2;

-- name: GetLeaveBalanceForUserTypeYear :one
SELECT id, tenant_id, user_id, leave_type_id, period_year,
       granted_hours, used_hours, expires_at,
       created_at, updated_at
FROM leave_balances
WHERE user_id = $1
  AND leave_type_id = $2
  AND period_year = $3
  AND tenant_id = $4;

-- name: ListLeaveBalancesByUser :many
SELECT id, tenant_id, user_id, leave_type_id, period_year,
       granted_hours, used_hours, expires_at,
       created_at, updated_at
FROM leave_balances
WHERE user_id = $1
  AND tenant_id = $2
ORDER BY period_year DESC, leave_type_id ASC;

-- name: ListLeaveBalancesByUserYear :many
SELECT id, tenant_id, user_id, leave_type_id, period_year,
       granted_hours, used_hours, expires_at,
       created_at, updated_at
FROM leave_balances
WHERE user_id = $1
  AND tenant_id = $2
  AND period_year = $3
ORDER BY leave_type_id ASC;

-- name: UpsertLeaveBalanceGrant :one
INSERT INTO leave_balances (tenant_id, user_id, leave_type_id, period_year,
                            granted_hours, used_hours, expires_at)
VALUES ($1, $2, $3, $4, $5, 0, $6)
ON CONFLICT (user_id, leave_type_id, period_year)
DO UPDATE SET granted_hours = EXCLUDED.granted_hours,
              expires_at = EXCLUDED.expires_at,
              updated_at = now()
RETURNING id, tenant_id, user_id, leave_type_id, period_year,
          granted_hours, used_hours, expires_at,
          created_at, updated_at;

-- name: AdjustLeaveBalanceHours :one
UPDATE leave_balances
SET granted_hours = granted_hours + sqlc.arg('delta_hours')::numeric,
    updated_at = now()
WHERE id = sqlc.arg('id')
  AND tenant_id = sqlc.arg('tenant_id')
RETURNING id, tenant_id, user_id, leave_type_id, period_year,
          granted_hours, used_hours, expires_at,
          created_at, updated_at;
