-- Sprint 3: leave_types / leave_balances / holidays + 잔여 강제 조정 audit log.
-- plan.md §데이터 모델 LeaveType/LeaveBalance/Holiday, §아키텍처 결정 — 연차 발생 cron.
-- 모든 테이블 tenant_id 컬럼 보유 (CLAUDE.md §3.6).

-- ============================================================
-- leave_types — 휴가 종류. HR/super_admin 만 CRUD.
-- accrual_policy 는 JSON 스키마 (internal/hr/leave/accrual_policy.go).
-- ============================================================

CREATE TABLE leave_types (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    code TEXT NOT NULL,                                  -- 'annual', 'half_day', etc.
    name TEXT NOT NULL,                                  -- 한글 표시명
    default_hours NUMERIC(4,1) NOT NULL,                 -- 8.0, 4.0, 2.0
    accrual_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_paid BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT leave_types_tenant_code_uniq UNIQUE (tenant_id, code)
);

CREATE INDEX idx_leave_types_tenant ON leave_types(tenant_id) WHERE deleted_at IS NULL;

-- ============================================================
-- leave_balances — 사용자별, 휴가종류별, 회계연도별 잔여.
--   (user_id, leave_type_id, period_year) UNIQUE → cron 의 UPSERT 안전 보장.
-- ============================================================

CREATE TABLE leave_balances (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    user_id BIGINT NOT NULL REFERENCES users(id),
    leave_type_id BIGINT NOT NULL REFERENCES leave_types(id),
    period_year INT NOT NULL,
    granted_hours NUMERIC(6,1) NOT NULL DEFAULT 0,
    used_hours NUMERIC(6,1) NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT leave_balances_user_type_year_uniq UNIQUE (user_id, leave_type_id, period_year)
);

CREATE INDEX idx_leave_balances_tenant ON leave_balances(tenant_id);
CREATE INDEX idx_leave_balances_user_year ON leave_balances(user_id, period_year);

-- ============================================================
-- holidays — 한국 공휴일 + 회사 지정 휴일.
--   (tenant_id, date) UNIQUE → 같은 일자 중복 방지.
-- ============================================================

CREATE TABLE holidays (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    date DATE NOT NULL,
    name TEXT NOT NULL,
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    country_code CHAR(2) NOT NULL DEFAULT 'KR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT holidays_tenant_date_uniq UNIQUE (tenant_id, date)
);

CREATE INDEX idx_holidays_tenant_date ON holidays(tenant_id, date);

-- ============================================================
-- leave_balance_adjustments — HR 의 잔여 강제 조정 audit log.
-- Sprint 9 에서 일반화된 audit log 시스템이 도입되면 그쪽으로 이관 가능.
-- delta_hours: 양수=증가, 음수=감소. reason 필수 (handler 단에서 빈 문자열 거부).
-- ============================================================

CREATE TABLE leave_balance_adjustments (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    balance_id BIGINT NOT NULL REFERENCES leave_balances(id),
    actor_user_id BIGINT NOT NULL REFERENCES users(id),
    delta_hours NUMERIC(6,1) NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_balance_adj_balance ON leave_balance_adjustments(balance_id);
CREATE INDEX idx_balance_adj_tenant ON leave_balance_adjustments(tenant_id);
