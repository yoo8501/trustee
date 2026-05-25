-- Sprint 7: expense_reports 롤백.

DROP INDEX IF EXISTS idx_expense_reports_approver_status;
DROP INDEX IF EXISTS idx_expense_reports_requester_status;
DROP INDEX IF EXISTS idx_expense_reports_tenant;
DROP TABLE IF EXISTS expense_reports;
