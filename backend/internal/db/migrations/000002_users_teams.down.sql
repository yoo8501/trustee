-- Sprint 2 rollback. 생성 역순.

DROP INDEX IF EXISTS idx_refresh_expires;
DROP INDEX IF EXISTS idx_refresh_user;
DROP TABLE IF EXISTS refresh_tokens;

ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_hr_fk;
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_lead_fk;

DROP INDEX IF EXISTS idx_users_manager;
DROP INDEX IF EXISTS idx_users_team;
DROP INDEX IF EXISTS idx_users_tenant;
DROP TABLE IF EXISTS users;

DROP INDEX IF EXISTS idx_teams_parent;
DROP INDEX IF EXISTS idx_teams_tenant;
DROP TABLE IF EXISTS teams;

DROP TYPE IF EXISTS user_status;
DROP TYPE IF EXISTS user_role;
