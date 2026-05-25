-- Sprint 8: notifications CRUD + read 처리.

-- name: CreateNotification :one
INSERT INTO notifications (tenant_id, user_id, type, title, body, related_url)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, tenant_id, user_id, type, title, body, related_url, read_at, created_at;

-- name: GetNotificationByID :one
SELECT id, tenant_id, user_id, type, title, body, related_url, read_at, created_at
FROM notifications
WHERE id = $1
  AND tenant_id = $2;

-- name: ListNotificationsForUser :many
SELECT id, tenant_id, user_id, type, title, body, related_url, read_at, created_at
FROM notifications
WHERE user_id = $1
  AND tenant_id = $2
ORDER BY created_at DESC, id DESC
LIMIT $3 OFFSET $4;

-- name: CountNotificationsForUser :one
SELECT COUNT(*) FROM notifications
WHERE user_id = $1
  AND tenant_id = $2;

-- name: ListUnreadNotificationsForUser :many
SELECT id, tenant_id, user_id, type, title, body, related_url, read_at, created_at
FROM notifications
WHERE user_id = $1
  AND tenant_id = $2
  AND read_at IS NULL
ORDER BY created_at DESC, id DESC
LIMIT $3 OFFSET $4;

-- name: CountUnreadNotificationsForUser :one
SELECT COUNT(*) FROM notifications
WHERE user_id = $1
  AND tenant_id = $2
  AND read_at IS NULL;

-- name: MarkNotificationRead :one
-- 본인 알림만 + 미읽음일 때만 read_at = now() 로 갱신.
-- 이미 읽음 처리된 row 는 read_at 을 보존 (멱등).
UPDATE notifications
SET read_at = COALESCE(read_at, now())
WHERE id = $1
  AND tenant_id = $2
  AND user_id = $3
RETURNING id, tenant_id, user_id, type, title, body, related_url, read_at, created_at;

-- name: MarkAllNotificationsRead :execrows
UPDATE notifications
SET read_at = now()
WHERE user_id = $1
  AND tenant_id = $2
  AND read_at IS NULL;
