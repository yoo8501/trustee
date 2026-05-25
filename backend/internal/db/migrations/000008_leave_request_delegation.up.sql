-- Sprint 6: leave_requests + delegations.
-- plan.md §데이터 모델 LeaveRequest / Delegation.
--
-- 결재 상태의 단일 진실은 leave_requests.status (Sprint 6 P1 — 단일 결재).
-- 다단계 결재선(P2)에서는 별도 approvals 테이블로 이관 가능하지만, P1 에서는
-- 1:1 매핑이므로 status 컬럼을 본 테이블에 둔다.
--
-- 모든 테이블 tenant_id 컬럼 보유 (CLAUDE.md §3.6).

-- ============================================================
-- enum 타입
-- ============================================================

-- leave_request_status — 휴가 신청 상태.
--   pending   : 신청 직후 결재 대기
--   approved  : 결재자 승인 (LeaveBalance.used_hours 차감 완료)
--   rejected  : 결재자 반려 (잔여 영향 없음)
--   cancelled : 신청자가 pending 상태에서 취소
CREATE TYPE leave_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
);

-- ============================================================
-- leave_requests — 휴가 신청.
--   (requester_id, status) partial index 로 본인 신청 / 결재 대기 조회 가속.
--   (approver_id, status) partial index 로 결재 대기함 조회 가속.
--   (requester_id, start_at, end_at) partial index 로 중복 검증 가속 (pending|approved).
-- ============================================================

CREATE TABLE leave_requests (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    requester_id BIGINT NOT NULL REFERENCES users(id),
    leave_type_id BIGINT NOT NULL REFERENCES leave_types(id),
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    hours NUMERIC(4,1) NOT NULL CHECK (hours > 0),
    reason TEXT,
    status leave_request_status NOT NULL DEFAULT 'pending',
    approver_id BIGINT REFERENCES users(id),
    decided_at TIMESTAMPTZ,
    decision_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT leave_request_date_order CHECK (end_at >= start_at)
);

CREATE INDEX idx_leave_requests_tenant ON leave_requests(tenant_id);
CREATE INDEX idx_leave_requests_requester_status ON leave_requests(requester_id, status);
CREATE INDEX idx_leave_requests_approver_status ON leave_requests(approver_id, status);
CREATE INDEX idx_leave_requests_range ON leave_requests(requester_id, start_at, end_at)
    WHERE status IN ('pending', 'approved');

-- ============================================================
-- delegations — 결재 위임 (Sprint 6).
--
-- 본인이 자기 결재 권한을 다른 사람에게 위임 (휴가, 외근, 출장 등).
-- delegator_id : 위임을 등록한 사람 (원 결재자)
-- delegate_id  : 위임받은 사람 (실제로 결재할 사람)
-- valid_from / valid_to : 위임 활성 기간 (TIMESTAMPTZ — KST 비교는 application layer)
-- scope        : JSONB. 빈 {} = 모든 문서, { "document_types": [...] } = 매칭 문서만.
--
-- delegator_id <> delegate_id (자기 자신에게 위임 금지).
-- valid_to >= valid_from (역순 금지).
-- ============================================================

CREATE TABLE delegations (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    delegator_id BIGINT NOT NULL REFERENCES users(id),
    delegate_id BIGINT NOT NULL REFERENCES users(id),
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ NOT NULL,
    scope JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT delegation_period_order CHECK (valid_to >= valid_from),
    CONSTRAINT delegation_not_self CHECK (delegator_id <> delegate_id)
);

CREATE INDEX idx_delegations_tenant ON delegations(tenant_id);
CREATE INDEX idx_delegations_delegator ON delegations(delegator_id);
CREATE INDEX idx_delegations_delegate ON delegations(delegate_id);
CREATE INDEX idx_delegations_active ON delegations(delegator_id, valid_from, valid_to);
