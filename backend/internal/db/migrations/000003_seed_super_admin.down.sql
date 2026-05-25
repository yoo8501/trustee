-- Sprint 2 시드 rollback. 시드된 super_admin 만 제거.

DELETE FROM users
WHERE tenant_id = 1
  AND email = 'admin@docflow.local'
  AND role = 'super_admin';
