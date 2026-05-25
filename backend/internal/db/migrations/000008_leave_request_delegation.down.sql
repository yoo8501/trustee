-- Sprint 6 rollback: delegations + leave_requests + enum.

DROP INDEX IF EXISTS idx_delegations_active;
DROP INDEX IF EXISTS idx_delegations_delegate;
DROP INDEX IF EXISTS idx_delegations_delegator;
DROP INDEX IF EXISTS idx_delegations_tenant;
DROP TABLE IF EXISTS delegations;

DROP INDEX IF EXISTS idx_leave_requests_range;
DROP INDEX IF EXISTS idx_leave_requests_approver_status;
DROP INDEX IF EXISTS idx_leave_requests_requester_status;
DROP INDEX IF EXISTS idx_leave_requests_tenant;
DROP TABLE IF EXISTS leave_requests;

DROP TYPE IF EXISTS leave_request_status;
