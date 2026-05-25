-- Sprint 7: expense_reports.
-- plan.md §데이터 모델 ExpenseReport — 단일 결재 + 첨부.
--
-- 결재 상태의 단일 진실은 expense_reports.status (Sprint 7 P1 — 단일 결재).
-- LeaveRequest 와 동일 패턴: status enum (leave_request_status) 재사용.
--
-- 모든 테이블 tenant_id 컬럼 보유 (CLAUDE.md §3.6).

-- ============================================================
-- expense_reports — 지출결의서.
--   (requester_id, status) partial index 로 본인 신청 / 결재 대기 조회 가속.
--   (approver_id, status) partial index 로 결재 대기함 조회 가속.
-- ============================================================

CREATE TABLE expense_reports (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    requester_id BIGINT NOT NULL REFERENCES users(id),
    amount_won BIGINT NOT NULL CHECK (amount_won > 0),
    vendor TEXT NOT NULL,
    purpose TEXT NOT NULL,
    paid_at DATE NOT NULL,
    attachment_url TEXT,
    status leave_request_status NOT NULL DEFAULT 'pending',
    approver_id BIGINT REFERENCES users(id),
    decided_at TIMESTAMPTZ,
    decision_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expense_reports_tenant ON expense_reports(tenant_id);
CREATE INDEX idx_expense_reports_requester_status ON expense_reports(requester_id, status);
CREATE INDEX idx_expense_reports_approver_status ON expense_reports(approver_id, status);
