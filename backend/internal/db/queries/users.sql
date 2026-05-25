-- name: GetUserByID :one
SELECT id, tenant_id, email, password_hash, name, status, team_id, manager_id,
       hire_date, role, work_start_time, work_end_time, token_version,
       created_at, updated_at, deleted_at
FROM users
WHERE id = $1
  AND tenant_id = $2
  AND deleted_at IS NULL;

-- name: GetUserByEmail :one
SELECT id, tenant_id, email, password_hash, name, status, team_id, manager_id,
       hire_date, role, work_start_time, work_end_time, token_version,
       created_at, updated_at, deleted_at
FROM users
WHERE email = $1
  AND tenant_id = $2
  AND deleted_at IS NULL;

-- name: CreateUser :one
INSERT INTO users (tenant_id, email, password_hash, name, hire_date, role, team_id, manager_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, tenant_id, email, password_hash, name, status, team_id, manager_id,
          hire_date, role, work_start_time, work_end_time, token_version,
          created_at, updated_at, deleted_at;

-- name: ListUsers :many
SELECT id, tenant_id, email, password_hash, name, status, team_id, manager_id,
       hire_date, role, work_start_time, work_end_time, token_version,
       created_at, updated_at, deleted_at
FROM users
WHERE tenant_id = $1
  AND deleted_at IS NULL
ORDER BY id ASC
LIMIT $2 OFFSET $3;

-- name: CountUsers :one
SELECT COUNT(*) FROM users
WHERE tenant_id = $1
  AND deleted_at IS NULL;

-- name: UpdateUser :one
UPDATE users
SET name = COALESCE(sqlc.narg('name'), name),
    role = COALESCE(sqlc.narg('role'), role),
    team_id = CASE WHEN sqlc.arg('team_id_set')::bool THEN sqlc.narg('team_id') ELSE team_id END,
    manager_id = CASE WHEN sqlc.arg('manager_id_set')::bool THEN sqlc.narg('manager_id') ELSE manager_id END,
    status = COALESCE(sqlc.narg('status'), status),
    updated_at = now()
WHERE id = sqlc.arg('id')
  AND tenant_id = sqlc.arg('tenant_id')
  AND deleted_at IS NULL
RETURNING id, tenant_id, email, password_hash, name, status, team_id, manager_id,
          hire_date, role, work_start_time, work_end_time, token_version,
          created_at, updated_at, deleted_at;

-- name: IncrementUserTokenVersion :one
UPDATE users
SET token_version = token_version + 1,
    updated_at = now()
WHERE id = $1
  AND tenant_id = $2
  AND deleted_at IS NULL
RETURNING token_version;

-- name: GetUserTokenVersion :one
SELECT token_version, status, role
FROM users
WHERE id = $1
  AND tenant_id = $2
  AND deleted_at IS NULL;
