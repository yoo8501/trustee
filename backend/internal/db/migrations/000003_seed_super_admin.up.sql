-- Sprint 2: super_admin 1명 시드 (개발 / P0 cutover 대비).
-- password = 'admin1234!' (bcrypt cost 12). 운영 cutover 직후 즉시 변경 필요.
-- ON CONFLICT 로 idempotent 보장 — 마이그레이션 재실행 시 중복 INSERT 방지.

INSERT INTO users (tenant_id, email, password_hash, name, hire_date, role)
VALUES (
    1,
    'admin@docflow.local',
    '$2a$12$fUGJp/cSKTHERuJtE1E1ROXbky3urG1kjWnNeKRZuIfe5jG893.XW',
    '최고관리자',
    CURRENT_DATE,
    'super_admin'
)
ON CONFLICT (tenant_id, email) DO NOTHING;
