-- Sprint 3 leave_types 시드 rollback.

DELETE FROM leave_types
WHERE tenant_id = 1
  AND code IN ('annual', 'monthly_annual', 'half_day', 'quarter_day', 'public', 'comp_leave', 'special');
