-- Sprint 8 rollback.

DROP INDEX IF EXISTS idx_notifications_user;
DROP INDEX IF EXISTS idx_notifications_user_unread;
DROP TABLE IF EXISTS notifications;
