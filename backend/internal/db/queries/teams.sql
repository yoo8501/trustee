-- name: GetTeamByID :one
SELECT id, tenant_id, name, parent_team_id, team_lead_id, hr_manager_id,
       created_at, updated_at, deleted_at
FROM teams
WHERE id = $1
  AND tenant_id = $2
  AND deleted_at IS NULL;

-- name: ListTeams :many
SELECT id, tenant_id, name, parent_team_id, team_lead_id, hr_manager_id,
       created_at, updated_at, deleted_at
FROM teams
WHERE tenant_id = $1
  AND deleted_at IS NULL
ORDER BY id ASC
LIMIT $2 OFFSET $3;

-- name: CountTeams :one
SELECT COUNT(*) FROM teams
WHERE tenant_id = $1
  AND deleted_at IS NULL;

-- name: CreateTeam :one
INSERT INTO teams (tenant_id, name, parent_team_id, team_lead_id, hr_manager_id)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, tenant_id, name, parent_team_id, team_lead_id, hr_manager_id,
          created_at, updated_at, deleted_at;

-- name: UpdateTeam :one
UPDATE teams
SET name = COALESCE(sqlc.narg('name'), name),
    parent_team_id = CASE WHEN sqlc.arg('parent_set')::bool THEN sqlc.narg('parent_team_id') ELSE parent_team_id END,
    team_lead_id = CASE WHEN sqlc.arg('lead_set')::bool THEN sqlc.narg('team_lead_id') ELSE team_lead_id END,
    hr_manager_id = CASE WHEN sqlc.arg('hr_set')::bool THEN sqlc.narg('hr_manager_id') ELSE hr_manager_id END,
    updated_at = now()
WHERE id = sqlc.arg('id')
  AND tenant_id = sqlc.arg('tenant_id')
  AND deleted_at IS NULL
RETURNING id, tenant_id, name, parent_team_id, team_lead_id, hr_manager_id,
          created_at, updated_at, deleted_at;

-- name: SoftDeleteTeam :exec
UPDATE teams
SET deleted_at = now(),
    updated_at = now()
WHERE id = $1
  AND tenant_id = $2
  AND deleted_at IS NULL;
