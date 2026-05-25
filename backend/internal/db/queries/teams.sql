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

-- name: ListTeamDescendants :many
-- Sprint 5: dept_head 산하 팀 전체 (자기 자신 포함) 펼치기. 재귀 CTE.
WITH RECURSIVE descendants AS (
    SELECT t0.id, t0.parent_team_id
    FROM teams t0
    WHERE t0.id = sqlc.arg('root_team_id')
      AND t0.tenant_id = sqlc.arg('tenant_id')
      AND t0.deleted_at IS NULL
    UNION ALL
    SELECT t.id, t.parent_team_id
    FROM teams t
    JOIN descendants d ON t.parent_team_id = d.id
    WHERE t.tenant_id = sqlc.arg('tenant_id')
      AND t.deleted_at IS NULL
)
SELECT d.id FROM descendants d ORDER BY d.id ASC;
