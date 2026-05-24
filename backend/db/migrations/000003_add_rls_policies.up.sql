-- RLS (Row Level Security)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 같은 tenant의 사용자만 조회 가능
-- (애플리케이션에서 SET app.current_tenant_id = 'uuid' 설정 후 쿼리)
CREATE POLICY users_tenant_isolation ON users
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
