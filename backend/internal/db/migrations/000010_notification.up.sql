-- Sprint 8: 인앱 알림 (notifications).
--
-- plan.md §데이터 모델 Notification — 결재 상신/승인/반려/자동마감 등 이벤트가
-- 본 테이블에 row 를 INSERT 하고, 사용자의 헤더 종 / 사이드바 배지가 read_at IS NULL
-- 인 row 수를 카운트한다.
--
-- 모든 테이블 tenant_id 보유 (CLAUDE.md §3.6).
-- 시간 컬럼은 TIMESTAMPTZ — KST 변환은 application layer (CLAUDE.md §3.7).
--
-- type 컬럼은 자유 텍스트 (enum 아님). 신규 이벤트 도입 시 마이그레이션 없이 추가 가능.
-- Sprint 8 P1 사용 type:
--   - leave_request_submitted     : 휴가 상신 → 결재자 알림
--   - leave_request_approved      : 휴가 승인 → 신청자 알림
--   - leave_request_rejected      : 휴가 반려 → 신청자 알림
--   - attendance_auto_closed      : 자정 cron 자동 마감 → 본인 알림
--   - expense_report_submitted    : 지출결의 상신 → 결재자 알림 (Sprint 7 후속)
--   - expense_report_approved     : 지출결의 승인 → 신청자 알림 (Sprint 7 후속)
--   - expense_report_rejected     : 지출결의 반려 → 신청자 알림 (Sprint 7 후속)

CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL DEFAULT 1,
    user_id BIGINT NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    related_url TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 미읽음 알림 카운트 / 목록 가속 (partial index — read_at IS NULL row 만 인덱싱).
CREATE INDEX idx_notifications_user_unread
    ON notifications(user_id, created_at DESC)
    WHERE read_at IS NULL;

-- 사용자별 전체 알림 목록 페이지네이션 가속.
CREATE INDEX idx_notifications_user
    ON notifications(user_id, created_at DESC);
