-- Sprint 2: users / teams / refresh_tokens 테이블.
-- plan.md §데이터 모델 User/Team, §권한 매트릭스.
-- 모든 테이블 tenant_id 컬럼 보유 (CLAUDE.md §3.6).

-- ============================================================
-- enum 타입
-- ============================================================

-- 5단계 role. 위임은 직교축 (Sprint 6 Delegation).
CREATE TYPE user_role AS ENUM (
    'general',
    'team_lead',
    'dept_head',
    'hr_manager',
    'super_admin'
);

-- 사용자 상태. 퇴사는 soft delete 와 별개로 status='terminated' 로 표현.
CREATE TYPE user_status AS ENUM (
    'active',
    'inactive',
    'terminated'
);

-- ============================================================
-- teams — users 보다 먼저 (users 가 team_id FK 보유). 다만 team_lead_id / hr_manager_id FK 는
-- users 생성 후 ALTER 로 추가한다 (상호 참조).
-- ============================================================

CREATE TABLE teams (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    parent_team_id BIGINT REFERENCES teams(id),
    team_lead_id BIGINT,
    hr_manager_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_teams_tenant ON teams(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_teams_parent ON teams(parent_team_id);

-- ============================================================
-- users
-- ============================================================

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    status user_status NOT NULL DEFAULT 'active',
    team_id BIGINT REFERENCES teams(id),
    manager_id BIGINT REFERENCES users(id),
    hire_date DATE NOT NULL,
    role user_role NOT NULL DEFAULT 'general',
    work_start_time TIME NOT NULL DEFAULT '09:00',
    work_end_time TIME NOT NULL DEFAULT '18:00',
    token_version INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT users_tenant_email_uniq UNIQUE (tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_team ON users(team_id);
CREATE INDEX idx_users_manager ON users(manager_id);

-- teams ↔ users 상호 참조 FK 추가.
ALTER TABLE teams
    ADD CONSTRAINT teams_lead_fk FOREIGN KEY (team_lead_id) REFERENCES users(id);
ALTER TABLE teams
    ADD CONSTRAINT teams_hr_fk FOREIGN KEY (hr_manager_id) REFERENCES users(id);

-- ============================================================
-- refresh_tokens — JWT refresh 1회용 회전 (jti 기반).
--   - 발급 시 INSERT (used_at IS NULL).
--   - 사용 시 used_at 채움 + 새 row INSERT.
--   - 이미 used_at 있는 jti 가 재사용되면 reuse 감지 → user.token_version 증가 (전 토큰 무효).
-- ============================================================

CREATE TABLE refresh_tokens (
    jti UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    tenant_id BIGINT NOT NULL DEFAULT 1,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);

CREATE INDEX idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_expires ON refresh_tokens(expires_at);
