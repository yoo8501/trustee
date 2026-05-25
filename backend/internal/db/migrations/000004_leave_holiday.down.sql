-- Sprint 3 rollback. 생성 역순.

DROP INDEX IF EXISTS idx_balance_adj_tenant;
DROP INDEX IF EXISTS idx_balance_adj_balance;
DROP TABLE IF EXISTS leave_balance_adjustments;

DROP INDEX IF EXISTS idx_holidays_tenant_date;
DROP TABLE IF EXISTS holidays;

DROP INDEX IF EXISTS idx_leave_balances_user_year;
DROP INDEX IF EXISTS idx_leave_balances_tenant;
DROP TABLE IF EXISTS leave_balances;

DROP INDEX IF EXISTS idx_leave_types_tenant;
DROP TABLE IF EXISTS leave_types;
