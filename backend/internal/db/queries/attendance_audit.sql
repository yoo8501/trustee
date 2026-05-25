-- Sprint 9: 출퇴근 감사 로그 조회 — HR/super_admin only.
-- 본 쿼리는 attendance_records 위에서 SELECT only (Sprint 4 BE 의 attendance.sql 와 분리).
-- nullable filter pattern: sqlc.narg() 가 NULL 이면 해당 필터 무시.
--   * 사용자 / 기간 / source / client_ip 필터 조합.
--   * client_ip 는 INET 컬럼 → host(client_ip) 로 텍스트 매칭 (CIDR 매칭 미사용 — 정확 일치).

-- name: SearchAttendanceAudit :many
SELECT id, tenant_id, user_id, work_date, check_in_at, check_out_at,
       lunch_break_minutes, source, client_ip, user_agent, status,
       created_at, updated_at
FROM attendance_records
WHERE tenant_id = sqlc.arg('tenant_id')
  AND (sqlc.narg('user_id')::bigint IS NULL OR user_id = sqlc.narg('user_id'))
  AND (sqlc.narg('from_date')::date IS NULL OR work_date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR work_date <= sqlc.narg('to_date'))
  AND (sqlc.narg('source')::text IS NULL OR source::text = sqlc.narg('source'))
  AND (sqlc.narg('client_ip')::text IS NULL OR host(client_ip) = sqlc.narg('client_ip'))
ORDER BY work_date DESC, user_id ASC, id ASC
LIMIT sqlc.arg('lim') OFFSET sqlc.arg('off');

-- name: CountAttendanceAudit :one
SELECT COUNT(*) FROM attendance_records
WHERE tenant_id = sqlc.arg('tenant_id')
  AND (sqlc.narg('user_id')::bigint IS NULL OR user_id = sqlc.narg('user_id'))
  AND (sqlc.narg('from_date')::date IS NULL OR work_date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR work_date <= sqlc.narg('to_date'))
  AND (sqlc.narg('source')::text IS NULL OR source::text = sqlc.narg('source'))
  AND (sqlc.narg('client_ip')::text IS NULL OR host(client_ip) = sqlc.narg('client_ip'));
