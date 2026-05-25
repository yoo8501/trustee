-- Sprint 8: 공유 캘린더 view.
--
-- 가시성 규칙 (plan.md §아키텍처 결정 — 캘린더 가시성):
--   - 휴가 날짜 + 종류 : 전사 (모든 직원).
--   - 휴가 사유       : 본인 + 결재자 + HR/super_admin 만 (service layer 에서 마스킹).
--   - 본인 출퇴근만   : scope='me' 또는 본인 row 만 노출.
--
-- 본 쿼리는 raw row 를 모두 반환하고, application layer 에서 사유 마스킹을 한다.

-- name: ListCalendarLeaves :many
-- 범위 내 휴가 (pending + approved). cancelled / rejected 는 제외.
-- 신청자 이름 / 휴가 종류 code/name 까지 join 으로 가져온다.
SELECT lr.id, lr.tenant_id, lr.requester_id, lr.leave_type_id,
       lr.start_at, lr.end_at, lr.hours, lr.reason, lr.status, lr.approver_id,
       u.name AS requester_name,
       lt.code AS leave_type_code,
       lt.name AS leave_type_name
FROM leave_requests lr
JOIN users u ON u.id = lr.requester_id AND u.tenant_id = lr.tenant_id
JOIN leave_types lt ON lt.id = lr.leave_type_id AND lt.tenant_id = lr.tenant_id
WHERE lr.tenant_id = sqlc.arg('tenant_id')
  AND lr.status IN ('pending', 'approved')
  AND lr.start_at < sqlc.arg('to_at')
  AND lr.end_at   > sqlc.arg('from_at')
ORDER BY lr.start_at ASC, lr.id ASC;

-- name: ListCalendarAttendances :many
-- 본인 출퇴근만 노출 — user_id 를 필수 필터로 받는다.
SELECT id, tenant_id, user_id, work_date, check_in_at, check_out_at,
       lunch_break_minutes, source, status
FROM attendance_records
WHERE tenant_id = sqlc.arg('tenant_id')
  AND user_id   = sqlc.arg('user_id')
  AND work_date >= sqlc.arg('from_date')
  AND work_date <= sqlc.arg('to_date')
ORDER BY work_date ASC, id ASC;
