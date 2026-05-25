-- Sprint 3 2026 KR holidays seed rollback.

DELETE FROM holidays
WHERE tenant_id = 1
  AND country_code = 'KR'
  AND date >= DATE '2026-01-01'
  AND date <= DATE '2026-12-31';
