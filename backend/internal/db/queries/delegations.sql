-- Sprint 6: delegations CRUD + 활성 위임 조회.

-- name: CreateDelegation :one
INSERT INTO delegations (tenant_id, delegator_id, delegate_id, valid_from, valid_to, scope)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, tenant_id, delegator_id, delegate_id, valid_from, valid_to, scope, created_at;

-- name: GetDelegationByID :one
SELECT id, tenant_id, delegator_id, delegate_id, valid_from, valid_to, scope, created_at
FROM delegations
WHERE id = $1
  AND tenant_id = $2;

-- name: DeleteDelegation :exec
DELETE FROM delegations
WHERE id = $1
  AND tenant_id = $2
  AND delegator_id = $3;

-- name: ListDelegationsByDelegator :many
SELECT id, tenant_id, delegator_id, delegate_id, valid_from, valid_to, scope, created_at
FROM delegations
WHERE delegator_id = $1
  AND tenant_id = $2
ORDER BY valid_from DESC, id DESC;

-- name: ListActiveDelegationsByDelegator :many
-- Sprint 6 resolver — approver_id 결정 시점에 활성 위임 매칭.
-- valid_from <= at <= valid_to.
SELECT id, tenant_id, delegator_id, delegate_id, valid_from, valid_to, scope, created_at
FROM delegations
WHERE delegator_id = $1
  AND tenant_id = $2
  AND valid_from <= $3
  AND valid_to >= $3
ORDER BY valid_from DESC, id DESC;
