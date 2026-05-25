-- name: GetAttendanceByUserDate :one
SELECT id, tenant_id, user_id, work_date, check_in_at, check_out_at,
       lunch_break_minutes, source, client_ip, user_agent, status,
       created_at, updated_at
FROM attendance_records
WHERE user_id = $1
  AND work_date = $2
  AND tenant_id = $3;

-- name: CreateAttendanceCheckIn :one
INSERT INTO attendance_records (
    tenant_id, user_id, work_date, check_in_at,
    source, client_ip, user_agent, status
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, tenant_id, user_id, work_date, check_in_at, check_out_at,
          lunch_break_minutes, source, client_ip, user_agent, status,
          created_at, updated_at;

-- name: UpdateAttendanceCheckOut :one
UPDATE attendance_records
SET check_out_at = $1,
    status = $2,
    updated_at = now()
WHERE id = $3
  AND tenant_id = $4
RETURNING id, tenant_id, user_id, work_date, check_in_at, check_out_at,
          lunch_break_minutes, source, client_ip, user_agent, status,
          created_at, updated_at;

-- name: ListOpenAttendanceForDate :many
-- 자정 KST cron 이 사용. work_date = yesterday(KST) AND check_out_at IS NULL.
SELECT id, tenant_id, user_id, work_date, check_in_at, check_out_at,
       lunch_break_minutes, source, client_ip, user_agent, status,
       created_at, updated_at
FROM attendance_records
WHERE work_date = $1
  AND check_out_at IS NULL
  AND status <> 'auto_closed'
ORDER BY id ASC;

-- name: MarkAttendanceAutoClosed :exec
-- 자정 cron 이 호출. check_out_at 은 NULL 유지, status 만 auto_closed 로 마킹.
UPDATE attendance_records
SET status = 'auto_closed',
    updated_at = now()
WHERE id = ANY(sqlc.arg('ids')::bigint[]);
