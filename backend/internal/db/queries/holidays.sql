-- name: GetHolidayByID :one
SELECT id, tenant_id, date, name, is_recurring, country_code, created_at
FROM holidays
WHERE id = $1
  AND tenant_id = $2;

-- name: ListHolidays :many
SELECT id, tenant_id, date, name, is_recurring, country_code, created_at
FROM holidays
WHERE tenant_id = $1
ORDER BY date ASC;

-- name: ListHolidaysInRange :many
SELECT id, tenant_id, date, name, is_recurring, country_code, created_at
FROM holidays
WHERE tenant_id = $1
  AND date >= $2
  AND date <= $3
ORDER BY date ASC;

-- name: CountHolidays :one
SELECT COUNT(*) FROM holidays
WHERE tenant_id = $1;
