-- Sprint 4: attendance_records — 출퇴근 기록 + 자정 KST auto-close cron 대상.
-- plan.md §데이터 모델 AttendanceRecord, §클럭인/아웃 엣지 케이스.
-- 모든 테이블 tenant_id 컬럼 보유 (CLAUDE.md §3.6).

-- ============================================================
-- enum 타입
-- ============================================================

-- source — 어떤 경로로 기록되었는지 추적.
--   button: 사용자가 대시보드 버튼으로 클릭한 정상 기록
--   manual_correction: HR/관리자가 정정한 기록 (Sprint 5 이후 사용)
CREATE TYPE attendance_source AS ENUM (
    'button',
    'manual_correction'
);

-- status — 출퇴근 상태.
--   normal: 정시 출근 + 정시 퇴근
--   late: 출근이 work_start_time 보다 늦음
--   early_leave: 퇴근이 work_end_time 보다 빠름
--   absent: 출근 자체가 없음 (auto-close 도 아닌 케이스 — 본 sprint 미사용)
--   auto_closed: 자정 cron 이 퇴근 누락 row 를 마킹 (check_out_at 은 NULL 유지)
CREATE TYPE attendance_status AS ENUM (
    'normal',
    'late',
    'early_leave',
    'absent',
    'auto_closed'
);

-- ============================================================
-- attendance_records
--   (user_id, work_date) UNIQUE → 같은 날 두 번째 클릭 차단 (서버 백업).
-- ============================================================

CREATE TABLE attendance_records (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    user_id BIGINT NOT NULL REFERENCES users(id),
    work_date DATE NOT NULL,
    check_in_at TIMESTAMPTZ,
    check_out_at TIMESTAMPTZ,
    lunch_break_minutes INT NOT NULL DEFAULT 60,
    source attendance_source NOT NULL DEFAULT 'button',
    client_ip INET,
    user_agent TEXT,
    status attendance_status NOT NULL DEFAULT 'normal',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT attendance_user_date_uniq UNIQUE (user_id, work_date)
);

CREATE INDEX idx_attendance_user_date ON attendance_records(user_id, work_date);
CREATE INDEX idx_attendance_tenant_date ON attendance_records(tenant_id, work_date);
-- 자정 cron 이 빠르게 미마감 row 만 스캔할 수 있도록 partial index.
CREATE INDEX idx_attendance_open ON attendance_records(work_date) WHERE check_out_at IS NULL;
