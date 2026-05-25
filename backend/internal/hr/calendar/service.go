// Package calendar — 공유 캘린더 view (Sprint 8).
//
// plan.md §아키텍처 결정 — 캘린더 가시성:
//   - 휴가 날짜 + 종류 : 전사 (모든 직원).
//   - 휴가 사유       : 본인 + 결재자 + HR/super_admin 만 (service layer 가 마스킹).
//   - 본인 출퇴근만   : scope='me' 또는 본인 row 만 노출.
//
// 본 service 는 (1) date range 검증 (3개월 한도), (2) 사유 마스킹, (3) attendances
// 본인 필터링을 한다. raw 쿼리 join + scoping 은 sqlc 가 담당.
package calendar

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// MaxDateRange — calendar/통계 조회 시 from~to 범위 한도.
//
// 3개월 (약 90일) 초과 시 ErrDateRangeTooLarge. UX 와 DB 부담을 동시에 막는다.
// 본 한도는 plan.md §캘린더 가시성 — 최대 3개월 한도 정책에서 유래.
var MaxDateRange = 90 * 24 * time.Hour

// Sentinel errors.
var (
	// ErrDateRangeTooLarge — to - from > MaxDateRange.
	ErrDateRangeTooLarge = errors.New("calendar: date range too large")
	// ErrInvalidDateRange — to < from 등 순서 위반.
	ErrInvalidDateRange = errors.New("calendar: invalid date range")
)

// Store — Service 의 DB 의존성. dbq.Queries 가 그대로 만족.
type Store interface {
	ListCalendarLeaves(ctx context.Context, arg dbq.ListCalendarLeavesParams) ([]dbq.ListCalendarLeavesRow, error)
	ListHolidaysInRange(ctx context.Context, arg dbq.ListHolidaysInRangeParams) ([]dbq.Holiday, error)
	ListCalendarAttendances(ctx context.Context, arg dbq.ListCalendarAttendancesParams) ([]dbq.ListCalendarAttendancesRow, error)
}

var _ Store = (*dbq.Queries)(nil)

// Service — 캘린더 도메인 service.
type Service struct {
	store Store
}

// NewService — store 주입.
func NewService(store Store) *Service {
	return &Service{store: store}
}

// ---------- Inputs / Views ----------

// Scope — calendar 조회 범위.
//   - "me"   : 본인 휴가 + 본인 출퇴근 + 공휴일.
//   - "team" : 동일 팀 휴가 + 본인 출퇴근 + 공휴일 (P1 단순화 — service 가 추가 필터링 안 함;
//     team 필터는 row-level 미적용. P2 에 scope 도입).
//   - "all"  : 전사 휴가 + 본인 출퇴근 + 공휴일.
type Scope string

const (
	ScopeMe   Scope = "me"
	ScopeTeam Scope = "team"
	ScopeAll  Scope = "all"
)

// ListInput — List 입력.
type ListInput struct {
	TenantID int64
	ActorID  int64
	Role     permission.Role
	From     time.Time // KST 일자 (자정 기준)
	To       time.Time // KST 일자 (자정 기준, inclusive — 같은 날 23:59:59 까지 포함)
	Scope    Scope
}

// CalendarLeave — view 표현. Reason 은 권한자만 *string, 비권한자는 nil.
type CalendarLeave struct {
	ID            int64
	RequesterID   int64
	RequesterName string
	LeaveTypeID   int64
	LeaveTypeCode string
	LeaveTypeName string
	StartAt       time.Time
	EndAt         time.Time
	Hours         float64
	Status        string
	ApproverID    int64   // 0 if NULL
	Reason        *string // 권한자만, 그 외 nil (마스킹)
}

// CalendarHoliday — view 표현.
type CalendarHoliday struct {
	ID          int64
	Date        time.Time
	Name        string
	IsRecurring bool
	CountryCode string
}

// CalendarAttendance — view 표현 (본인만).
type CalendarAttendance struct {
	ID         int64
	UserID     int64
	WorkDate   time.Time
	CheckInAt  *time.Time
	CheckOutAt *time.Time
	Status     string
}

// Response — List 결과.
type Response struct {
	Leaves      []CalendarLeave
	Holidays    []CalendarHoliday
	Attendances []CalendarAttendance
}

// ---------- List ----------

// List — calendar view 조회.
//
// 검증:
//  1. From / To 모두 nonzero, From <= To → 아니면 ErrInvalidDateRange.
//  2. To - From <= MaxDateRange → 아니면 ErrDateRangeTooLarge.
//
// 가시성:
//   - Scope=me → 본인 휴가만.
//   - HR/super_admin / 본인 / 결재자 → reason 노출, 그 외 마스킹.
//   - attendances → ActorID 본인 row 만 (scope 무관, 정책 명세).
func (s *Service) List(ctx context.Context, in ListInput) (Response, error) {
	if in.From.IsZero() || in.To.IsZero() || in.To.Before(in.From) {
		return Response{}, ErrInvalidDateRange
	}
	if in.To.Sub(in.From) > MaxDateRange {
		return Response{}, ErrDateRangeTooLarge
	}
	if in.TenantID == 0 {
		in.TenantID = 1
	}
	scope := in.Scope
	if scope == "" {
		scope = ScopeAll
	}

	// 휴가 조회: start_at < (to + 1day) AND end_at > from.
	// to 가 같은 날의 자정(00:00) 이면 같은 날 휴가도 잡으려면 +1day 보정 필요.
	toAt := in.To.Add(24 * time.Hour)
	leaveRows, err := s.store.ListCalendarLeaves(ctx, dbq.ListCalendarLeavesParams{
		TenantID: in.TenantID,
		FromAt:   pgtype.Timestamptz{Time: in.From, Valid: true},
		ToAt:     pgtype.Timestamptz{Time: toAt, Valid: true},
	})
	if err != nil {
		return Response{}, err
	}

	hrOrAbove := permission.IsHRManagerOrAbove(in.Role)
	leaves := make([]CalendarLeave, 0, len(leaveRows))
	for _, r := range leaveRows {
		// scope=me 필터: requester != actor 제외.
		if scope == ScopeMe && r.RequesterID != in.ActorID {
			continue
		}
		leaves = append(leaves, toCalendarLeave(r, in.ActorID, hrOrAbove))
	}

	// 공휴일 조회.
	holidayRows, err := s.store.ListHolidaysInRange(ctx, dbq.ListHolidaysInRangeParams{
		TenantID: in.TenantID,
		Date:     pgtype.Date{Time: in.From, Valid: true},
		Date_2:   pgtype.Date{Time: in.To, Valid: true},
	})
	if err != nil {
		return Response{}, err
	}
	holidays := make([]CalendarHoliday, 0, len(holidayRows))
	for _, h := range holidayRows {
		holidays = append(holidays, toCalendarHoliday(h))
	}

	// 본인 출퇴근.
	attRows, err := s.store.ListCalendarAttendances(ctx, dbq.ListCalendarAttendancesParams{
		TenantID: in.TenantID,
		UserID:   in.ActorID,
		FromDate: pgtype.Date{Time: in.From, Valid: true},
		ToDate:   pgtype.Date{Time: in.To, Valid: true},
	})
	if err != nil {
		return Response{}, err
	}
	attendances := make([]CalendarAttendance, 0, len(attRows))
	for _, a := range attRows {
		attendances = append(attendances, toCalendarAttendance(a))
	}

	return Response{
		Leaves:      leaves,
		Holidays:    holidays,
		Attendances: attendances,
	}, nil
}

// ---------- mappers ----------

// toCalendarLeave — sqlc row → view + reason 마스킹.
//
// reason 노출 조건 (plan.md §캘린더 가시성):
//   - actorID == requesterID (본인)
//   - actorID == approverID (결재자)
//   - hrOrAbove == true (HR / super_admin)
//
// 그 외 → Reason = nil.
func toCalendarLeave(r dbq.ListCalendarLeavesRow, actorID int64, hrOrAbove bool) CalendarLeave {
	v := CalendarLeave{
		ID:            r.ID,
		RequesterID:   r.RequesterID,
		RequesterName: r.RequesterName,
		LeaveTypeID:   r.LeaveTypeID,
		LeaveTypeCode: r.LeaveTypeCode,
		LeaveTypeName: r.LeaveTypeName,
		Hours:         numericToFloat(r.Hours),
		Status:        string(r.Status),
	}
	if r.StartAt.Valid {
		v.StartAt = r.StartAt.Time.In(leave.KSTLocation())
	}
	if r.EndAt.Valid {
		v.EndAt = r.EndAt.Time.In(leave.KSTLocation())
	}
	if r.ApproverID.Valid {
		v.ApproverID = r.ApproverID.Int64
	}

	// reason 마스킹.
	visible := hrOrAbove ||
		actorID == r.RequesterID ||
		(r.ApproverID.Valid && r.ApproverID.Int64 == actorID)
	if visible && r.Reason.Valid {
		s := r.Reason.String
		v.Reason = &s
	}
	return v
}

func toCalendarHoliday(h dbq.Holiday) CalendarHoliday {
	v := CalendarHoliday{
		ID:          h.ID,
		Name:        h.Name,
		IsRecurring: h.IsRecurring,
		CountryCode: h.CountryCode,
	}
	if h.Date.Valid {
		v.Date = h.Date.Time
	}
	return v
}

func toCalendarAttendance(a dbq.ListCalendarAttendancesRow) CalendarAttendance {
	v := CalendarAttendance{
		ID:     a.ID,
		UserID: a.UserID,
		Status: string(a.Status),
	}
	if a.WorkDate.Valid {
		v.WorkDate = a.WorkDate.Time
	}
	if a.CheckInAt.Valid {
		t := a.CheckInAt.Time
		v.CheckInAt = &t
	}
	if a.CheckOutAt.Valid {
		t := a.CheckOutAt.Time
		v.CheckOutAt = &t
	}
	return v
}

// numericToFloat — pgtype.Numeric → float64. 잘못된 값은 0.
func numericToFloat(n pgtype.Numeric) float64 {
	if !n.Valid || n.NaN {
		return 0
	}
	f, err := n.Float64Value()
	if err == nil && f.Valid {
		return f.Float64
	}
	return 0
}
