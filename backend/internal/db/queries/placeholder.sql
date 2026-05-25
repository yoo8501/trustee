-- Sprint 1: sqlc 부트스트랩 검증용 trivial query.
-- 실제 도메인 query 는 Sprint 2 이후 추가.

-- name: Ping :one
SELECT 1::int AS ok;
