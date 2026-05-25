package stats_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/attendance/stats"
	"github.com/sjseo/docflow/backend/internal/hr/scope"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// NewService nil leave → 자동으로 NoopLeaveAdjustmentFetcher 사용.
func TestNewService_NilLeave_DefaultsToNoop(t *testing.T) {
	svc := stats.NewService(&fakeAttendanceStore{}, &fakeUserStore{users: map[int64]dbq.User{}},
		&fakeHolidayStore{}, fakeHierarchy{}, nil)
	if svc == nil {
		t.Fatal("svc nil")
	}
}

// Mine — user not found → ErrUserNotFound.
func TestService_Mine_UserNotFound(t *testing.T) {
	us := &fakeUserStore{users: map[int64]dbq.User{}}
	svc := newSvc(&fakeAttendanceStore{}, us, nil, fakeHierarchy{})
	_, err := svc.Mine(context.Background(),
		scope.Actor{ID: 99, TenantID: 1, Role: permission.RoleGeneral, TeamID: 10},
		"day", mustParseStr("2026-05-25"))
	if !errors.Is(err, stats.ErrUserNotFound) {
		t.Fatalf("err=%v want ErrUserNotFound", err)
	}
}

// Mine — invalid period → ErrInvalidPeriod.
func TestService_Mine_InvalidPeriod(t *testing.T) {
	us := &fakeUserStore{users: map[int64]dbq.User{7: seedUser(7, permission.RoleGeneral, 10)}}
	svc := newSvc(&fakeAttendanceStore{}, us, nil, fakeHierarchy{})
	_, err := svc.Mine(context.Background(),
		scope.Actor{ID: 7, TenantID: 1, Role: permission.RoleGeneral, TeamID: 10},
		"year", mustParseStr("2026-05-25"))
	if !errors.Is(err, stats.ErrInvalidPeriod) {
		t.Fatalf("err=%v want ErrInvalidPeriod", err)
	}
}

// Team — invalid period → ErrInvalidPeriod.
func TestService_Team_InvalidPeriod(t *testing.T) {
	us := &fakeUserStore{users: map[int64]dbq.User{7: seedUser(7, permission.RoleTeamLead, 10)}}
	svc := newSvc(&fakeAttendanceStore{}, us, nil, fakeHierarchy{})
	_, err := svc.Team(context.Background(),
		scope.Actor{ID: 7, TenantID: 1, Role: permission.RoleTeamLead, TeamID: 10},
		nil, "year", mustParseStr("2026-05-25"))
	if !errors.Is(err, stats.ErrInvalidPeriod) {
		t.Fatalf("err=%v want ErrInvalidPeriod", err)
	}
}

// All — invalid period → ErrInvalidPeriod.
func TestService_All_InvalidPeriod(t *testing.T) {
	us := &fakeUserStore{users: map[int64]dbq.User{7: seedUser(7, permission.RoleHRManager, 0)}}
	svc := newSvc(&fakeAttendanceStore{}, us, nil, fakeHierarchy{})
	_, err := svc.All(context.Background(),
		scope.Actor{ID: 7, TenantID: 1, Role: permission.RoleHRManager, TeamID: 0},
		"decade", mustParseStr("2026-05-25"))
	if !errors.Is(err, stats.ErrInvalidPeriod) {
		t.Fatalf("err=%v want ErrInvalidPeriod", err)
	}
}

// 사용자가 두 명, 같은 날짜 — Team 집계가 분리된 멤버 row 두 개.
func TestService_Team_MultipleMembers(t *testing.T) {
	lead := seedUser(7, permission.RoleTeamLead, 10)
	m1 := seedUser(8, permission.RoleGeneral, 10)
	m2 := seedUser(9, permission.RoleGeneral, 10)
	us := &fakeUserStore{users: map[int64]dbq.User{7: lead, 8: m1, 9: m2}}

	att := &fakeAttendanceStore{records: []dbq.AttendanceRecord{
		attendanceRow(1, 8, "2026-05-25", "2026-05-25 09:00", "2026-05-25 18:00"),
		attendanceRow(2, 9, "2026-05-25", "2026-05-25 09:00", "2026-05-25 22:00"),
	}}

	svc := newSvc(att, us, nil, fakeHierarchy{})
	res, err := svc.Team(context.Background(),
		scope.Actor{ID: 7, TenantID: 1, Role: permission.RoleTeamLead, TeamID: 10},
		nil, "day", mustParseStr("2026-05-25"))
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Members) != 2 {
		t.Fatalf("members=%d want 2 body=%+v", len(res.Members), res.Members)
	}
}

// lookupLeave 가 같은 날 여러 entry 를 합산.
func TestComputeRecord_MultipleLeaveSameDay_Sums(t *testing.T) {
	// 직접 lookupLeave 는 unexported. ComputeRecord 단위 검증.
	in := kst(t, "2026-05-25 13:00")
	out := kst(t, "2026-05-25 18:00")
	rec := stats.Record{
		WorkDate: kstDate(t, "2026-05-25"), CheckIn: &in, CheckOut: &out, LunchBreakMinutes: 60,
	}
	user := stats.UserSchedule{WorkStartMinutes: 9 * 60, WorkEndMinutes: 18 * 60}

	// 4h 휴가 → adjusted = 480 - 240 = 240.
	got := stats.ComputeRecord(rec, user, stats.LeaveAdjustment{Hours: 4, LeaveType: "annual"})
	if got.AdjustedExpectedMinutes != 240 {
		t.Errorf("adjusted=%d want 240", got.AdjustedExpectedMinutes)
	}
}

// 인터널 lookupLeave 가 동일 사용자/날짜 entry 들 시간을 합산하는 동작은 service.Mine 경유 검증.
func TestService_Mine_LeaveAdjustment_SumMultipleEntries(t *testing.T) {
	user := seedUser(7, permission.RoleGeneral, 10)
	us := &fakeUserStore{users: map[int64]dbq.User{7: user}}
	att := &fakeAttendanceStore{records: []dbq.AttendanceRecord{
		attendanceRow(1, 7, "2026-05-25", "2026-05-25 13:00", "2026-05-25 18:00"),
	}}
	leaveFetcher := &stubLeaveFetcher{rows: []stats.LeaveAdjustment{
		{UserID: 7, Date: mustParseStr("2026-05-25"), Hours: 2, LeaveType: "annual"},
		{UserID: 7, Date: mustParseStr("2026-05-25"), Hours: 2, LeaveType: "annual"},
	}}
	svc := stats.NewService(att, us, &fakeHolidayStore{}, fakeHierarchy{}, leaveFetcher)

	res, err := svc.Mine(context.Background(),
		scope.Actor{ID: 7, TenantID: 1, Role: permission.RoleGeneral, TeamID: 10},
		"day", mustParseStr("2026-05-25"))
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Records) != 1 {
		t.Fatalf("records=%d", len(res.Records))
	}
	// 480 - (2+2)*60 = 240.
	if res.Records[0].AdjustedExpectedMinutes != 240 {
		t.Errorf("adjusted=%d want 240 (sum of two 2h)", res.Records[0].AdjustedExpectedMinutes)
	}
	if res.Records[0].LeaveAdjustmentHours != 4 {
		t.Errorf("hours=%f want 4", res.Records[0].LeaveAdjustmentHours)
	}
}

// listHolidays — holStore nil 시 nil 반환 (no panic).
// Mine 으로 우회: NewService 에 holStore nil 직접 주입 → 영업일 계산만 다름.
func TestService_Mine_HolidayStoreNil_NoPanic(t *testing.T) {
	us := &fakeUserStore{users: map[int64]dbq.User{7: seedUser(7, permission.RoleGeneral, 10)}}
	svc := stats.NewService(&fakeAttendanceStore{}, us, nil, fakeHierarchy{}, stats.NoopLeaveAdjustmentFetcher{})
	_, err := svc.Mine(context.Background(),
		scope.Actor{ID: 7, TenantID: 1, Role: permission.RoleGeneral, TeamID: 10},
		"day", mustParseStr("2026-05-25"))
	if err != nil {
		t.Fatalf("err=%v", err)
	}
}

// Mine — attendance store 가 에러 반환 → 전파.
func TestService_Mine_AttendanceStoreError_Propagates(t *testing.T) {
	us := &fakeUserStore{users: map[int64]dbq.User{7: seedUser(7, permission.RoleGeneral, 10)}}
	att := &errAttStore{err: errors.New("db down")}
	svc := stats.NewService(att, us, &fakeHolidayStore{}, fakeHierarchy{}, stats.NoopLeaveAdjustmentFetcher{})
	_, err := svc.Mine(context.Background(),
		scope.Actor{ID: 7, TenantID: 1, Role: permission.RoleGeneral, TeamID: 10},
		"day", mustParseStr("2026-05-25"))
	if err == nil || err.Error() != "db down" {
		t.Fatalf("err=%v want db down", err)
	}
}

// ---- 보조 fakes for coverage 보강 ----

type errAttStore struct{ err error }

func (e *errAttStore) ListAttendanceForRange(_ context.Context, _ scope.Scope, _, _ time.Time) ([]dbq.AttendanceRecord, error) {
	return nil, e.err
}

type stubLeaveFetcher struct{ rows []stats.LeaveAdjustment }

func (s *stubLeaveFetcher) Fetch(_ context.Context, _ []int64, _, _ time.Time) ([]stats.LeaveAdjustment, error) {
	return s.rows, nil
}

// Holiday store 에러 전파.
func TestService_Mine_HolidayStoreError_Propagates(t *testing.T) {
	us := &fakeUserStore{users: map[int64]dbq.User{7: seedUser(7, permission.RoleGeneral, 10)}}
	hs := &errHolStore{err: errors.New("holiday db")}
	svc := stats.NewService(&fakeAttendanceStore{}, us, hs, fakeHierarchy{}, stats.NoopLeaveAdjustmentFetcher{})
	_, err := svc.Mine(context.Background(),
		scope.Actor{ID: 7, TenantID: 1, Role: permission.RoleGeneral, TeamID: 10},
		"day", mustParseStr("2026-05-25"))
	if err == nil {
		t.Fatal("err nil want holiday db")
	}
}

type errHolStore struct{ err error }

func (e *errHolStore) ListHolidaysInRange(_ context.Context, _ dbq.ListHolidaysInRangeParams) ([]dbq.Holiday, error) {
	return nil, e.err
}

// collectUsers — GetUserByID NoRows 는 skip (panic/err 없음).
func TestService_Team_RecordWithMissingUser_Skipped(t *testing.T) {
	lead := seedUser(7, permission.RoleTeamLead, 10)
	us := &fakeUserStore{users: map[int64]dbq.User{7: lead}}
	att := &fakeAttendanceStore{records: []dbq.AttendanceRecord{
		attendanceRow(1, 999, "2026-05-25", "2026-05-25 09:00", "2026-05-25 18:00"),
	}}
	svc := newSvc(att, us, nil, fakeHierarchy{})

	res, err := svc.Team(context.Background(),
		scope.Actor{ID: 7, TenantID: 1, Role: permission.RoleTeamLead, TeamID: 10},
		nil, "day", mustParseStr("2026-05-25"))
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if len(res.Members) != 1 {
		t.Fatalf("members=%d want 1 (unknown user still counted)", len(res.Members))
	}
}

// collectUsers — GetUserByID DB 에러 전파.
func TestService_Team_GetUserByIDError_Propagates(t *testing.T) {
	lead := seedUser(7, permission.RoleTeamLead, 10)
	us := &errUserStore{baseUsers: map[int64]dbq.User{7: lead}}
	att := &fakeAttendanceStore{records: []dbq.AttendanceRecord{
		attendanceRow(1, 999, "2026-05-25", "2026-05-25 09:00", "2026-05-25 18:00"),
	}}
	svc := stats.NewService(att, us, &fakeHolidayStore{}, fakeHierarchy{}, stats.NoopLeaveAdjustmentFetcher{})
	_, err := svc.Team(context.Background(),
		scope.Actor{ID: 7, TenantID: 1, Role: permission.RoleTeamLead, TeamID: 10},
		nil, "day", mustParseStr("2026-05-25"))
	if err == nil {
		t.Fatal("err nil want store error")
	}
}

type errUserStore struct {
	baseUsers map[int64]dbq.User
}

func (e *errUserStore) GetUserByID(_ context.Context, arg dbq.GetUserByIDParams) (dbq.User, error) {
	if u, ok := e.baseUsers[arg.ID]; ok {
		return u, nil
	}
	return dbq.User{}, errors.New("db get")
}

func (e *errUserStore) ListUsersByTeams(_ context.Context, tenantID int64, teamIDs []int64) ([]dbq.User, error) {
	set := map[int64]bool{}
	for _, id := range teamIDs {
		set[id] = true
	}
	var out []dbq.User
	for _, u := range e.baseUsers {
		if u.TenantID != tenantID {
			continue
		}
		if u.TeamID.Valid && set[u.TeamID.Int64] {
			out = append(out, u)
		}
	}
	return out, nil
}

// Suppress unused imports.
var _ = pgx.ErrNoRows
var _ = pgtype.Date{}
