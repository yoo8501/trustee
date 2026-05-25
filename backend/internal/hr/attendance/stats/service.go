package stats

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/scope"
)

// Sentinel errors. handler 가 ErrorCode 매핑에 사용.
var (
	// ErrUserNotFound — actor 자신의 user record 가 사라진 경우 (terminated 직전 race).
	ErrUserNotFound = errors.New("stats: user not found")
)

// AttendanceStore — Repository-layer Scoped Querier.
//
// 모든 메서드가 [scope.Scope] 를 받아 (1) tenant_id 필수 WHERE, (2) UserID/TeamIDs/All
// 분기를 자동 적용한다. 실제 구현은 sqlc 가 생성한 row 위에서 scope.* 를 SQL WHERE 로
// 변환하는 wrap repository (별도 구현체).
type AttendanceStore interface {
	ListAttendanceForRange(ctx context.Context, sc scope.Scope, from, to time.Time) ([]dbq.AttendanceRecord, error)
}

// UserStore — 사용자/팀 조회 (actor 본인 + team 멤버 펼치기).
type UserStore interface {
	GetUserByID(ctx context.Context, arg dbq.GetUserByIDParams) (dbq.User, error)
	// ListUsersByTeams — 주어진 team_ids 에 속한 active 사용자 목록 (tenant scoped).
	// scope.TeamIDs 가 채워져 있을 때 service 가 멤버별 통계 집계용으로 사용.
	ListUsersByTeams(ctx context.Context, tenantID int64, teamIDs []int64) ([]dbq.User, error)
}

// HolidayStore — 영업일 계산용 공휴일 조회.
type HolidayStore interface {
	ListHolidaysInRange(ctx context.Context, arg dbq.ListHolidaysInRangeParams) ([]dbq.Holiday, error)
}

// Service — 출퇴근 통계 도메인.
type Service struct {
	attStore  AttendanceStore
	userStore UserStore
	holStore  HolidayStore
	hierarchy scope.TeamHierarchy
	leave     LeaveAdjustmentFetcher
}

// NewService — 의존성 주입. leave 가 nil 이면 [NoopLeaveAdjustmentFetcher] 사용.
func NewService(att AttendanceStore, us UserStore, hs HolidayStore, hier scope.TeamHierarchy, lf LeaveAdjustmentFetcher) *Service {
	if lf == nil {
		lf = NoopLeaveAdjustmentFetcher{}
	}
	return &Service{
		attStore:  att,
		userStore: us,
		holStore:  hs,
		hierarchy: hier,
		leave:     lf,
	}
}

// MineResult — Service.Mine 응답.
type MineResult struct {
	Period  PeriodStats
	Records []RecordStats
}

// TeamMember — Service.Team 응답의 멤버별 요약.
type TeamMember struct {
	UserID               int64
	TotalActualMinutes   int
	TotalOvertimeMinutes int
	DaysPresent          int
	DaysLate             int
	DaysEarlyLeave       int
	DaysAutoClosed       int
	AttendanceRate       float64
}

// TeamResult — Service.Team / Service.All 공용 응답.
type TeamResult struct {
	Period  PeriodStats
	Members []TeamMember
}

// Mine — 본인 통계 (scope=me). actor.Role 무관 (모든 role 이 본인 조회 가능).
func (s *Service) Mine(ctx context.Context, actor scope.Actor, period string, date time.Time) (MineResult, error) {
	from, to, err := PeriodRange(period, date)
	if err != nil {
		return MineResult{}, err
	}

	sc, err := scope.Resolve(ctx, actor, scope.Request{Scope: "me"}, s.hierarchy)
	if err != nil {
		return MineResult{}, err
	}

	user, err := s.userStore.GetUserByID(ctx, dbq.GetUserByIDParams{
		ID: actor.ID, TenantID: actor.TenantID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MineResult{}, ErrUserNotFound
		}
		return MineResult{}, err
	}

	rows, err := s.attStore.ListAttendanceForRange(ctx, sc, from, to)
	if err != nil {
		return MineResult{}, err
	}

	adjustments, err := s.leave.Fetch(ctx, []int64{actor.ID}, from, to)
	if err != nil {
		return MineResult{}, err
	}

	schedule := userScheduleFrom(user)
	records := make([]RecordStats, 0, len(rows))
	for _, r := range rows {
		rec := rowToRecord(r)
		leaveAdj := lookupLeave(adjustments, rec.UserID, rec.WorkDate)
		records = append(records, ComputeRecord(rec, schedule, leaveAdj))
	}

	holidays, err := s.listHolidays(ctx, actor.TenantID, from, to)
	if err != nil {
		return MineResult{}, err
	}
	bd := CountBusinessDays(from, to, holidays)
	period_ := AggregatePeriod(records, AggregateInput{BusinessDays: bd})
	period_.From = from
	period_.To = to

	return MineResult{Period: period_, Records: records}, nil
}

// Team — 팀 통계. team_lead/dept_head/HR+ 가 호출.
// teamID == nil → 본인 팀 (team_lead) 또는 산하 전체 (dept_head) 또는 전사 (HR+).
func (s *Service) Team(ctx context.Context, actor scope.Actor, teamID *int64, period string, date time.Time) (TeamResult, error) {
	from, to, err := PeriodRange(period, date)
	if err != nil {
		return TeamResult{}, err
	}

	sc, err := scope.Resolve(ctx, actor, scope.Request{Scope: "team", TeamID: teamID}, s.hierarchy)
	if err != nil {
		return TeamResult{}, err
	}

	return s.aggregateByScope(ctx, actor, sc, from, to)
}

// All — 전사 통계 (HR / super_admin only).
func (s *Service) All(ctx context.Context, actor scope.Actor, period string, date time.Time) (TeamResult, error) {
	from, to, err := PeriodRange(period, date)
	if err != nil {
		return TeamResult{}, err
	}

	sc, err := scope.Resolve(ctx, actor, scope.Request{Scope: "all"}, s.hierarchy)
	if err != nil {
		return TeamResult{}, err
	}

	return s.aggregateByScope(ctx, actor, sc, from, to)
}

func (s *Service) aggregateByScope(ctx context.Context, actor scope.Actor, sc scope.Scope, from, to time.Time) (TeamResult, error) {
	rows, err := s.attStore.ListAttendanceForRange(ctx, sc, from, to)
	if err != nil {
		return TeamResult{}, err
	}

	// userId → User (work_start/end 분 단위). actor 본인도 포함되어야 (자기 통계도 자기 팀에 들어가므로).
	userMap, err := s.collectUsers(ctx, actor.TenantID, sc, rows)
	if err != nil {
		return TeamResult{}, err
	}

	userIDs := make([]int64, 0, len(userMap))
	for id := range userMap {
		userIDs = append(userIDs, id)
	}
	adjustments, err := s.leave.Fetch(ctx, userIDs, from, to)
	if err != nil {
		return TeamResult{}, err
	}

	// userId → records 묶기.
	byUser := map[int64][]RecordStats{}
	for _, r := range rows {
		rec := rowToRecord(r)
		schedule := UserSchedule{}
		if u, ok := userMap[rec.UserID]; ok {
			schedule = userScheduleFrom(u)
		}
		leaveAdj := lookupLeave(adjustments, rec.UserID, rec.WorkDate)
		byUser[rec.UserID] = append(byUser[rec.UserID], ComputeRecord(rec, schedule, leaveAdj))
	}

	holidays, err := s.listHolidays(ctx, actor.TenantID, from, to)
	if err != nil {
		return TeamResult{}, err
	}
	bd := CountBusinessDays(from, to, holidays)

	members := make([]TeamMember, 0, len(byUser))
	var totalActual, totalOvertime, totalExpected int
	var totalPresent, totalAbsent int
	for uid, recs := range byUser {
		p := AggregatePeriod(recs, AggregateInput{BusinessDays: bd})
		members = append(members, TeamMember{
			UserID:               uid,
			TotalActualMinutes:   p.TotalActualMinutes,
			TotalOvertimeMinutes: p.TotalOvertimeMinutes,
			DaysPresent:          p.DaysPresent,
			DaysLate:             p.DaysLate,
			DaysEarlyLeave:       p.DaysEarlyLeave,
			DaysAutoClosed:       p.DaysAutoClosed,
			AttendanceRate:       p.AttendanceRate,
		})
		totalActual += p.TotalActualMinutes
		totalOvertime += p.TotalOvertimeMinutes
		totalExpected += p.TotalExpectedMinutes
		totalPresent += p.DaysPresent
		totalAbsent += p.DaysAbsent
	}

	period := PeriodStats{
		From:                 from,
		To:                   to,
		TotalActualMinutes:   totalActual,
		TotalOvertimeMinutes: totalOvertime,
		TotalExpectedMinutes: totalExpected,
		DaysPresent:          totalPresent,
		DaysAbsent:           totalAbsent,
		BusinessDays:         bd,
		AttendanceRate:       AttendanceRate(bd, totalPresent, totalAbsent),
	}
	return TeamResult{Period: period, Members: members}, nil
}

// collectUsers — scope 와 attendance row 에 등장하는 user 의 work_schedule 정보를 한 번에 모은다.
//
//   - sc.All == true       → row 에 등장한 user_id 들을 1건씩 GetUserByID.
//   - sc.TeamIDs 비어있지 않음 → ListUsersByTeams + row 의 user 들을 보충.
//   - sc.UserID != nil    → GetUserByID 1건.
func (s *Service) collectUsers(ctx context.Context, tenantID int64, sc scope.Scope, rows []dbq.AttendanceRecord) (map[int64]dbq.User, error) {
	out := map[int64]dbq.User{}

	if len(sc.TeamIDs) > 0 {
		users, err := s.userStore.ListUsersByTeams(ctx, tenantID, sc.TeamIDs)
		if err != nil {
			return nil, err
		}
		for _, u := range users {
			out[u.ID] = u
		}
	}

	// row 의 user_id 중 누락된 entry 는 단건 조회로 보충.
	for _, r := range rows {
		if _, ok := out[r.UserID]; ok {
			continue
		}
		u, err := s.userStore.GetUserByID(ctx, dbq.GetUserByIDParams{ID: r.UserID, TenantID: tenantID})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				continue
			}
			return nil, err
		}
		out[u.ID] = u
	}
	return out, nil
}

func (s *Service) listHolidays(ctx context.Context, tenantID int64, from, to time.Time) ([]time.Time, error) {
	if s.holStore == nil {
		return nil, nil
	}
	rows, err := s.holStore.ListHolidaysInRange(ctx, dbq.ListHolidaysInRangeParams{
		TenantID: tenantID,
		Date:     pgtype.Date{Time: from, Valid: true},
		Date_2:   pgtype.Date{Time: to, Valid: true},
	})
	if err != nil {
		return nil, err
	}
	out := make([]time.Time, 0, len(rows))
	for _, h := range rows {
		if h.Date.Valid {
			out = append(out, h.Date.Time)
		}
	}
	return out, nil
}

// ---- pgtype → 도메인 변환 helpers ----

func rowToRecord(r dbq.AttendanceRecord) Record {
	rec := Record{
		ID:                r.ID,
		UserID:            r.UserID,
		LunchBreakMinutes: int(r.LunchBreakMinutes),
		Status:            string(r.Status),
	}
	if r.WorkDate.Valid {
		rec.WorkDate = r.WorkDate.Time
	}
	if r.CheckInAt.Valid {
		t := r.CheckInAt.Time
		rec.CheckIn = &t
	}
	if r.CheckOutAt.Valid {
		t := r.CheckOutAt.Time
		rec.CheckOut = &t
	}
	return rec
}

func userScheduleFrom(u dbq.User) UserSchedule {
	return UserSchedule{
		WorkStartMinutes: pgTimeToMinutes(u.WorkStartTime),
		WorkEndMinutes:   pgTimeToMinutes(u.WorkEndTime),
	}
}

func pgTimeToMinutes(t pgtype.Time) int {
	if !t.Valid {
		return 0
	}
	return int(t.Microseconds / 60_000_000)
}

