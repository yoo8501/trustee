-- Sprint 4 rollback. 생성 역순.

DROP INDEX IF EXISTS idx_attendance_open;
DROP INDEX IF EXISTS idx_attendance_tenant_date;
DROP INDEX IF EXISTS idx_attendance_user_date;
DROP TABLE IF EXISTS attendance_records;

DROP TYPE IF EXISTS attendance_status;
DROP TYPE IF EXISTS attendance_source;
