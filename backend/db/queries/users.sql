-- name: CreateUser :one
INSERT INTO users (tenant_id, email, password_hash, name, role)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetUserByEmail :one
SELECT * FROM users
WHERE tenant_id = $1 AND email = $2;

-- name: GetUserByID :one
SELECT * FROM users
WHERE id = $1 AND tenant_id = $2;

-- name: ListUsersByTenant :many
SELECT id, tenant_id, email, name, role, created_at, updated_at
FROM users
WHERE tenant_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountUsersByTenant :one
SELECT COUNT(*) FROM users WHERE tenant_id = $1;

-- name: UpdateUserName :one
UPDATE users
SET name = $1, updated_at = NOW()
WHERE id = $2 AND tenant_id = $3
RETURNING *;

-- name: UpdateUserPassword :exec
UPDATE users
SET password_hash = $1, updated_at = NOW()
WHERE id = $2 AND tenant_id = $3;

-- name: UpdateUserRole :one
UPDATE users
SET role = $1, updated_at = NOW()
WHERE id = $2 AND tenant_id = $3
RETURNING *;

-- name: GetUserByEmailAnyTenant :one
SELECT * FROM users WHERE email = $1 LIMIT 1;
