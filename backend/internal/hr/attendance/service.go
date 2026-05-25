// Package attendance — 출퇴근 기록 도메인 (Sprint 4).
//
// 모델: AttendanceRecord (id, tenant_id, user_id, work_date, check_in_at,
// check_out_at, lunch_break_minutes, source, client_ip, user_agent, status).
//
// 단일 진실: (user_id, work_date) UNIQUE — 같은 날 한 row 만 존재.
//
// 상태 판정 (KST):
//   - normal       : 정시 출근 + 정시 퇴근
//   - late         : check_in_at > user.work_start_time
//   - early_leave  : check_out_at < user.work_end_time
//   - absent       : check_in_at NULL (auto-close 안 한 케이스 — 본 sprint 미사용)
//   - auto_closed  : 자정 cron 이 미마감 row 를 마킹 (check_out_at NULL 유지)
//
// 트랜잭션은 service 가 관리. handler 는 c.ClientIP() / c.Request.UserAgent() 만 전달.
package attendance

import (
	"context"
	"errors"
	"net/netip"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
)

// Sentinel errors. handler 가 ErrorCode 매핑에 사용.
var (
	// ErrCheckInRequired — CheckOut 호출 시 출근 record 가 없거나 check_in_at 이 NULL.
	// handler → 400 + errorCode CHECK_IN_REQUIRED.
	ErrCheckInRequired = errors.New("attendance: check-in required before check-out")
)

// Store — service 가 사용하는 DB 의존성. dbq.Queries 가 그대로 만족.
type Store interface {
	GetAttendanceByUserDate(ctx context.Context, arg dbq.GetAttendanceByUserDateParams) (dbq.AttendanceRecord, error)
	CreateAttendanceCheckIn(ctx context.Context, arg dbq.CreateAttendanceCheckInParams) (dbq.AttendanceRecord, error)
	UpdateAttendanceCheckOut(ctx context.Context, arg dbq.UpdateAttendanceCheckOutParams) (dbq.AttendanceRecord, error)
}

// UserStore — work_start_time/end_time 조회용. dbq.Queries 가 그대로 만족.
type UserStore interface {
	GetUserByID(ctx context.Context, arg dbq.GetUserByIDParams) (dbq.User, error)
}

// Service — 출퇴근 도메인 service.
type Service struct {
	store     Store
	userStore UserStore
	clock     func() time.Time // 테스트 주입용. nil 이면 KST 현재 시각.
}

// NewService — store 주입.
func NewService(store Store, userStore UserStore) *Service {
	return &Service{store: store, userStore: userStore}
}

// NewServiceWithClock — 테스트 전용: clock 주입.
func NewServiceWithClock(store Store, userStore UserStore, clock func() time.Time) *Service {
	return &Service{store: store, userStore: userStore, clock: clock}
}

// View — 도메인 응답 표현 (DB enum / pgtype 으로부터 정규화).
type View struct {
	ID                int64
	UserID            int64
	WorkDate          time.Time
	CheckInAt         *time.Time
	CheckOutAt        *time.Time
	LunchBreakMinutes int32
	Source            string
	ClientIP          string
	UserAgent         string
	Status            string
}

func toView(r dbq.AttendanceRecord) View {
	v := View{
		ID:                r.ID,
		UserID:            r.UserID,
		LunchBreakMinutes: r.LunchBreakMinutes,
		Source:            string(r.Source),
		Status:            string(r.Status),
	}
	if r.WorkDate.Valid {
		v.WorkDate = r.WorkDate.Time
	}
	if r.CheckInAt.Valid {
		t := r.CheckInAt.Time
		v.CheckInAt = &t
	}
	if r.CheckOutAt.Valid {
		t := r.CheckOutAt.Time
		v.CheckOutAt = &t
	}
	if r.ClientIp != nil {
		v.ClientIP = r.ClientIp.String()
	}
	if r.UserAgent.Valid {
		v.UserAgent = r.UserAgent.String
	}
	return v
}

// CheckInInput — Service.CheckIn 입력.
type CheckInInput struct {
	UserID    int64
	TenantID  int64
	ClientIP  string
	UserAgent string
}

// CheckIn — 출근 처리.
//
// 동일 work_date 에 이미 record 가 있으면 **첫 클릭 보존** (기존 record 그대로 반환).
// 상태 판정: check_in_at 의 KST 시각 > user.work_start_time → late, 아니면 normal.
// IP/UA 는 첫 클릭 시점의 값으로 기록.
func (s *Service) CheckIn(ctx context.Context, in CheckInInput) (View, error) {
	now := s.now()
	workDate := truncKSTDate(now)

	// 기존 row 있으면 첫 클릭 보존.
	existing, err := s.store.GetAttendanceByUserDate(ctx, dbq.GetAttendanceByUserDateParams{
		UserID:   in.UserID,
		WorkDate: pgtype.Date{Time: workDate, Valid: true},
		TenantID: in.TenantID,
	})
	if err == nil {
		return toView(existing), nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return View{}, err
	}

	// user 의 work_start_time 조회 → 지각 여부 판정.
	user, err := s.userStore.GetUserByID(ctx, dbq.GetUserByIDParams{
		ID:       in.UserID,
		TenantID: in.TenantID,
	})
	if err != nil {
		return View{}, err
	}

	status := dbq.AttendanceStatusNormal
	if isLate(now, user.WorkStartTime) {
		status = dbq.AttendanceStatusLate
	}

	ipPtr := parseIP(in.ClientIP)
	uaText := pgtype.Text{}
	if in.UserAgent != "" {
		uaText = pgtype.Text{String: in.UserAgent, Valid: true}
	}

	rec, err := s.store.CreateAttendanceCheckIn(ctx, dbq.CreateAttendanceCheckInParams{
		TenantID:  in.TenantID,
		UserID:    in.UserID,
		WorkDate:  pgtype.Date{Time: workDate, Valid: true},
		CheckInAt: pgtype.Timestamptz{Time: now, Valid: true},
		Source:    dbq.AttendanceSourceButton,
		ClientIp:  ipPtr,
		UserAgent: uaText,
		Status:    status,
	})
	if err != nil {
		return View{}, err
	}
	return toView(rec), nil
}

// CheckOutInput — Service.CheckOut 입력.
type CheckOutInput struct {
	UserID   int64
	TenantID int64
}

// CheckOut — 퇴근 처리.
//
//   - 출근 record 가 없거나 check_in_at NULL → ErrCheckInRequired.
//   - 이미 check_out_at 이 있어도 **두 번째 클릭이면 마지막 시각으로 갱신** (요구 명세).
//   - 상태 재계산: late / early_leave / normal. (auto_closed 이미 마킹된 row 도 재출근/재퇴근 가능; 본
//     sprint 는 이 케이스는 미정의이지만 안전을 위해 처리는 함.)
func (s *Service) CheckOut(ctx context.Context, in CheckOutInput) (View, error) {
	now := s.now()
	workDate := truncKSTDate(now)

	rec, err := s.store.GetAttendanceByUserDate(ctx, dbq.GetAttendanceByUserDateParams{
		UserID:   in.UserID,
		WorkDate: pgtype.Date{Time: workDate, Valid: true},
		TenantID: in.TenantID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, ErrCheckInRequired
		}
		return View{}, err
	}
	if !rec.CheckInAt.Valid {
		return View{}, ErrCheckInRequired
	}

	user, err := s.userStore.GetUserByID(ctx, dbq.GetUserByIDParams{
		ID:       in.UserID,
		TenantID: in.TenantID,
	})
	if err != nil {
		return View{}, err
	}

	status := determineFinalStatus(rec.CheckInAt.Time, now, user.WorkStartTime, user.WorkEndTime)

	updated, err := s.store.UpdateAttendanceCheckOut(ctx, dbq.UpdateAttendanceCheckOutParams{
		CheckOutAt: pgtype.Timestamptz{Time: now, Valid: true},
		Status:     status,
		ID:         rec.ID,
		TenantID:   in.TenantID,
	})
	if err != nil {
		return View{}, err
	}
	return toView(updated), nil
}

// ---- 시간 / 상태 유틸 ----

// now — 주입된 clock 또는 KST 현재 시각.
func (s *Service) now() time.Time {
	if s.clock != nil {
		return s.clock()
	}
	return time.Now().In(leave.KSTLocation())
}

// truncKSTDate — KST 자정 (00:00:00) 으로 truncate.
// DB DATE 컬럼은 timezone 정보가 없으므로 KST 기준 날짜 부분만 추출하면 충분하다.
func truncKSTDate(t time.Time) time.Time {
	kst := t.In(leave.KSTLocation())
	return time.Date(kst.Year(), kst.Month(), kst.Day(), 0, 0, 0, 0, leave.KSTLocation())
}

// isLate — check-in 시각이 work_start_time 보다 KST 기준 늦으면 true.
func isLate(checkIn time.Time, workStart pgtype.Time) bool {
	if !workStart.Valid {
		return false
	}
	kst := checkIn.In(leave.KSTLocation())
	startMicros := int64(kst.Hour())*3600_000_000 + int64(kst.Minute())*60_000_000 + int64(kst.Second())*1_000_000
	return startMicros > workStart.Microseconds
}

// determineFinalStatus — checkOut 시 최종 상태 판정.
// late 와 early_leave 가 동시 → late 우선 (요구 명세 §상태 판정 — 같은 정책으로 단순화).
func determineFinalStatus(checkIn, checkOut time.Time, workStart, workEnd pgtype.Time) dbq.AttendanceStatus {
	late := isLate(checkIn, workStart)
	early := isEarlyLeave(checkOut, workEnd)
	switch {
	case late:
		return dbq.AttendanceStatusLate
	case early:
		return dbq.AttendanceStatusEarlyLeave
	default:
		return dbq.AttendanceStatusNormal
	}
}

// isEarlyLeave — check-out 시각이 work_end_time 보다 KST 기준 빠르면 true.
func isEarlyLeave(checkOut time.Time, workEnd pgtype.Time) bool {
	if !workEnd.Valid {
		return false
	}
	kst := checkOut.In(leave.KSTLocation())
	outMicros := int64(kst.Hour())*3600_000_000 + int64(kst.Minute())*60_000_000 + int64(kst.Second())*1_000_000
	return outMicros < workEnd.Microseconds
}

// parseIP — gin.Context.ClientIP() 결과를 pgtype INET 호환 *netip.Addr 로 변환.
// 빈 문자열 / 형식 오류는 nil (DB NULL) 로 처리.
func parseIP(s string) *netip.Addr {
	if s == "" {
		return nil
	}
	a, err := netip.ParseAddr(s)
	if err != nil {
		return nil
	}
	return &a
}
