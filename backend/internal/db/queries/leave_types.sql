-- name: GetLeaveTypeByID :one
SELECT id, tenant_id, code, name, default_hours, accrual_policy, is_paid, is_active,
       created_at, updated_at, deleted_at
FROM leave_types
WHERE id = $1
  AND tenant_id = $2
  AND deleted_at IS NULL;

-- name: GetLeaveTypeByCode :one
SELECT id, tenant_id, code, name, default_hours, accrual_policy, is_paid, is_active,
       created_at, updated_at, deleted_at
FROM leave_types
WHERE code = $1
  AND tenant_id = $2
  AND deleted_at IS NULL;

-- name: ListLeaveTypes :many
SELECT id, tenant_id, code, name, default_hours, accrual_policy, is_paid, is_active,
       created_at, updated_at, deleted_at
FROM leave_types
WHERE tenant_id = $1
  AND deleted_at IS NULL
ORDER BY id ASC
LIMIT $2 OFFSET $3;

-- name: CountLeaveTypes :one
SELECT COUNT(*) FROM leave_types
WHERE tenant_id = $1
  AND deleted_at IS NULL;

-- name: ListActiveLeaveTypes :many
SELECT id, tenant_id, code, name, default_hours, accrual_policy, is_paid, is_active,
       created_at, updated_at, deleted_at
FROM leave_types
WHERE tenant_id = $1
  AND deleted_at IS NULL
  AND is_active = TRUE
ORDER BY id ASC;

-- name: CreateLeaveType :one
INSERT INTO leave_types (tenant_id, code, name, default_hours, accrual_policy, is_paid, is_active)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, tenant_id, code, name, default_hours, accrual_policy, is_paid, is_active,
          created_at, updated_at, deleted_at;

-- name: UpdateLeaveType :one
UPDATE leave_types
SET name = COALESCE(sqlc.narg('name'), name),
    default_hours = COALESCE(sqlc.narg('default_hours'), default_hours),
    accrual_policy = COALESCE(sqlc.narg('accrual_policy'), accrual_policy),
    is_paid = COALESCE(sqlc.narg('is_paid'), is_paid),
    is_active = COALESCE(sqlc.narg('is_active'), is_active),
    updated_at = now()
WHERE id = sqlc.arg('id')
  AND tenant_id = sqlc.arg('tenant_id')
  AND deleted_at IS NULL
RETURNING id, tenant_id, code, name, default_hours, accrual_policy, is_paid, is_active,
          created_at, updated_at, deleted_at;

-- name: SoftDeleteLeaveType :exec
UPDATE leave_types
SET deleted_at = now(),
    updated_at = now()
WHERE id = $1
  AND tenant_id = $2
  AND deleted_at IS NULL;
