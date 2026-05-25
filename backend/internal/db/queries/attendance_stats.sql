-- Sprint 5: 통계 — Scoped Querier 가 호출하는 attendance / users 조회.
--
-- 본 파일은 lazy compute 의 base data 만 fetch 한다 (집계는 Go service 가 수행).
-- scope 분기는 Go layer 에서 호출 메서드를 분기하는 방식 — SQL 자체를 동적 build 하지 않는다.

-- name: ListAttendanceByUserRange :many
-- scope=me 용. (user_id, work_date) 범위.
SELECT id, tenant_id, user_id, work_date, check_in_at, check_out_at,
       lunch_break_minutes, source, client_ip, user_agent, status,
       created_at, updated_at
FROM attendance_records
WHERE tenant_id = sqlc.arg('tenant_id')
  AND user_id = sqlc.arg('user_id')
  AND work_date >= sqlc.arg('from_date')
  AND work_date <= sqlc.arg('to_date')
ORDER BY work_date ASC, id ASC;

-- name: ListAttendanceByTeamsRange :many
-- scope=team / dept 용. user_id IN (subquery: users WHERE team_id = ANY).
-- teams 가 빈 배열이면 결과도 빈 결과 (PostgreSQL ANY 자연스러운 동작).
SELECT a.id, a.tenant_id, a.user_id, a.work_date, a.check_in_at, a.check_out_at,
       a.lunch_break_minutes, a.source, a.client_ip, a.user_agent, a.status,
       a.created_at, a.updated_at
FROM attendance_records a
JOIN users u ON u.id = a.user_id
WHERE a.tenant_id = sqlc.arg('tenant_id')
  AND u.tenant_id = sqlc.arg('tenant_id')
  AND u.deleted_at IS NULL
  AND u.team_id = ANY(sqlc.arg('team_ids')::bigint[])
  AND a.work_date >= sqlc.arg('from_date')
  AND a.work_date <= sqlc.arg('to_date')
ORDER BY a.user_id ASC, a.work_date ASC, a.id ASC;

-- name: ListAttendanceByTenantRange :many
-- scope=all 용. HR / super_admin only — 라우터 미들웨어가 1차 차단.
SELECT id, tenant_id, user_id, work_date, check_in_at, check_out_at,
       lunch_break_minutes, source, client_ip, user_agent, status,
       created_at, updated_at
FROM attendance_records
WHERE tenant_id = sqlc.arg('tenant_id')
  AND work_date >= sqlc.arg('from_date')
  AND work_date <= sqlc.arg('to_date')
ORDER BY user_id ASC, work_date ASC, id ASC;

-- name: ListUsersByTeams :many
-- 팀 단위 멤버 펼치기. Service 가 통계 집계 시 work_start/end_time 을 한 번에 fetch.
SELECT id, tenant_id, email, password_hash, name, status, team_id, manager_id,
       hire_date, role, work_start_time, work_end_time, token_version,
       created_at, updated_at, deleted_at
FROM users
WHERE tenant_id = sqlc.arg('tenant_id')
  AND deleted_at IS NULL
  AND team_id = ANY(sqlc.arg('team_ids')::bigint[])
ORDER BY id ASC;
