-- name: CreateRefreshToken :exec
INSERT INTO refresh_tokens (jti, user_id, tenant_id, issued_at, expires_at)
VALUES ($1, $2, $3, $4, $5);

-- name: GetRefreshToken :one
SELECT jti, user_id, tenant_id, issued_at, expires_at, used_at
FROM refresh_tokens
WHERE jti = $1;

-- name: MarkRefreshTokenUsed :one
-- 1회용 회전: used_at IS NULL 인 경우에만 마킹 성공. 이미 used 인 경우 0 rows.
-- 호출자가 RETURNING 결과로 0 rows 여부를 판단해 reuse 감지를 수행한다.
UPDATE refresh_tokens
SET used_at = now()
WHERE jti = $1
  AND used_at IS NULL
RETURNING jti, user_id, tenant_id, issued_at, expires_at, used_at;

-- name: DeleteExpiredRefreshTokens :exec
DELETE FROM refresh_tokens
WHERE expires_at < $1;
