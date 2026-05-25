package stats_test

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/attendance/stats"
	"github.com/sjseo/docflow/backend/internal/hr/scope"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// ---- fake stores ----

type fakeAttendanceStore struct {
	records []dbq.AttendanceRecord
	calls   atomic.Int64
	// lastScope — Service 가 Repository 호출 시 어떤 Scope 를 전달했는지 캡처 (테스트 단정).
	lastScope scope.Scope
}

func (f *fakeAttendanceStore) ListAttendanceForRange(_ context.Context, sc scope.Scope, from, to time.Time) ([]dbq.AttendanceRecord, error) {
	f.calls.Add(1)
	f.lastScope = sc
	var out []dbq.AttendanceRecord
	for _, r := range f.records {
		if !r.WorkDate.Valid {
			continue
		}
		d := r.WorkDate.Time
		if d.Before(from) || d.After(to) {
			continue
		}
		if sc.TenantID != 0 && r.TenantID != sc.TenantID {
			continue
		}
		if sc.UserID != nil && r.UserID != *sc.UserID {
			continue
		}
		if !sc.All && sc.UserID == nil && len(sc.TeamIDs) > 0 {
			// TeamIDs 기반 필터: store 가 user→team 매핑을 알고 있어야 하므로 테스트에서는
			// 이미 seed 단계에서 records 가 적합한 user 만 포함하도록 한다.
		}
		out = append(out, r)
	}
	return out, nil
}

type fakeUserStore struct {
	users map[int64]dbq.User
}

func (f *fakeUserStore) GetUserByID(_ context.Context, arg dbq.GetUserByIDParams) (dbq.User, error) {
	u, ok := f.users[arg.ID]
	if !ok || u.TenantID != arg.TenantID {
		return dbq.User{}, pgx.ErrNoRows
	}
	return u, nil
}

func (f *fakeUserStore) ListUsersByTeams(_ context.Context, tenantID int64, teamIDs []int64) ([]dbq.User, error) {
	if len(teamIDs) == 0 {
		return nil, nil
	}
	set := map[int64]bool{}
	for _, id := range teamIDs {
		set[id] = true
	}
	var out []dbq.User
	for _, u := range f.users {
		if u.TenantID != tenantID {
			continue
		}
		if u.TeamID.Valid && set[u.TeamID.Int64] {
			out = append(out, u)
		}
	}
	return out, nil
}

type fakeHolidayStore struct {
	holidays []dbq.Holiday
}

func (f *fakeHolidayStore) ListHolidaysInRange(_ context.Context, arg dbq.ListHolidaysInRangeParams) ([]dbq.Holiday, error) {
	var out []dbq.Holiday
	for _, h := range f.holidays {
		if h.TenantID != arg.TenantID {
			continue
		}
		if !h.Date.Valid {
			continue
		}
		d := h.Date.Time
		if d.Before(arg.Date.Time) || d.After(arg.Date_2.Time) {
			continue
		}
		out = append(out, h)
	}
	return out, nil
}

type fakeHierarchy struct {
	descendants map[int64][]int64
}

func (f fakeHierarchy) DescendantsOf(teamID int64) []int64 {
	if v, ok := f.descendants[teamID]; ok {
		return v
	}
	return []int64{teamID}
}

// ---- helpers ----

func seedUser(id int64, role permission.Role, teamID int64) dbq.User {
	u := dbq.User{
		ID: id, TenantID: 1, Role: dbq.UserRole(role),
		WorkStartTime: pgtype.Time{Microseconds: 9 * 3600_000_000, Valid: true},
		WorkEndTime:   pgtype.Time{Microseconds: 18 * 3600_000_000, Valid: true},
	}
	if teamID != 0 {
		u.TeamID = pgtype.Int8{Int64: teamID, Valid: true}
	}
	return u
}

func attendanceRow(id, userID int64, date, in, out string) dbq.AttendanceRecord {
	r := dbq.AttendanceRecord{
		ID: id, TenantID: 1, UserID: userID,
		WorkDate:          pgtype.Date{Time: mustParseStr(date), Valid: true},
		LunchBreakMinutes: 60,
		Source:            dbq.AttendanceSourceButton,
		Status:            dbq.AttendanceStatusNormal,
	}
	if in != "" {
		r.CheckInAt = pgtype.Timestamptz{Time: mustParseTSStr(in), Valid: true}
	}
	if out != "" {
		r.CheckOutAt = pgtype.Timestamptz{Time: mustParseTSStr(out), Valid: true}
	}
	return r
}

func mustParseStr(ymd string) time.Time {
	v, err := time.Parse("2006-01-02", ymd)
	if err != nil {
		panic(err)
	}
	return v
}

func mustParseTSStr(ts string) time.Time {
	v, err := time.Parse("2006-01-02 15:04", ts)
	if err != nil {
		panic(err)
	}
	return v
}

func newSvc(att *fakeAttendanceStore, us *fakeUserStore, hs *fakeHolidayStore, hier fakeHierarchy) *stats.Service {
	if att == nil {
		att = &fakeAttendanceStore{}
	}
	if us == nil {
		us = &fakeUserStore{users: map[int64]dbq.User{}}
	}
	if hs == nil {
		hs = &fakeHolidayStore{}
	}
	return stats.NewService(att, us, hs, hier, stats.NoopLeaveAdjustmentFetcher{})
}

// ---- tests ----

// Mine — general 본인 통계 (scope=me, day).
func TestService_Mine_Day_Success(t *testing.T) {
	user := seedUser(7, permission.RoleGeneral, 10)
	us := &fakeUserStore{users: map[int64]dbq.User{7: user}}

	att := &fakeAttendanceStore{records: []dbq.AttendanceRecord{
		attendanceRow(1, 7, "2026-05-25", "2026-05-25 09:00", "2026-05-25 18:00"),
	}}

	svc := newSvc(att, us, nil, fakeHierarchy{})
	res, err := svc.Mine(context.Background(), scope.Actor{ID: 7, TenantID: 1, Role: permission.RoleGeneral, TeamID: 10},
		"day", mustParseStr("2026-05-25"))
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if len(res.Records) != 1 {
		t.Fatalf("records=%d want 1", len(res.Records))
	}
	if res.Period.TotalActualMinutes != 480 {
		t.Errorf("actual=%d want 480", res.Period.TotalActualMinutes)
	}
	if att.lastScope.UserID == nil || *att.lastScope.UserID != 7 {
		t.Errorf("scope.UserID=%v want &7", att.lastScope.UserID)
	}
}

// Team — team_lead 본인 팀 조회.
func TestService_Team_TeamLead_OwnTeam_Success(t *testing.T) {
	lead := seedUser(7, permission.RoleTeamLead, 10)
	member := seedUser(8, permission.RoleGeneral, 10)
	us := &fakeUserStore{users: map[int64]dbq.User{7: lead, 8: member}}

	att := &fakeAttendanceStore{records: []dbq.AttendanceRecord{
		attendanceRow(1, 8, "2026-05-25", "2026-05-25 09:00", "2026-05-25 18:00"),
	}}

	svc := newSvc(att, us, nil, fakeHierarchy{})
	res, err := svc.Team(context.Background(),
		scope.Actor{ID: 7, TenantID: 1, Role: permission.RoleTeamLead, TeamID: 10},
		nil, // 본인 팀 묵시 — TeamID=nil 이면 자기 팀.
		"day", mustParseStr("2026-05-25"))
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if len(res.Members) == 0 {
		t.Fatal("members empty")
	}
}

// Team — team_lead 가 다른 팀 ID 요청 → ErrForbidden.
func TestService_Team_TeamLead_OtherTeam_Forbidden(t *testing.T) {
	lead := seedUser(7, permission.RoleTeamLead, 10)
	us := &fakeUserStore{users: map[int64]dbq.User{7: lead}}
	att := &fakeAttendanceStore{}
	svc := newSvc(att, us, nil, fakeHierarchy{})

	other := int64(99)
	_, err := svc.Team(context.Background(),
		scope.Actor{ID: 7, TenantID: 1, Role: permission.RoleTeamLead, TeamID: 10},
		&other, "day", mustParseStr("2026-05-25"))
	if !errors.Is(err, scope.ErrForbidden) {
		t.Fatalf("err=%v want ErrForbidden", err)
	}
}

// All — HR+ only.
func TestService_All_HRManager_Success(t *testing.T) {
	hr := seedUser(7, permission.RoleHRManager, 0)
	other := seedUser(8, permission.RoleGeneral, 10)
	us := &fakeUserStore{users: map[int64]dbq.User{7: hr, 8: other}}
	att := &fakeAttendanceStore{records: []dbq.AttendanceRecord{
		attendanceRow(1, 8, "2026-05-25", "2026-05-25 09:00", "2026-05-25 18:00"),
	}}
	svc := newSvc(att, us, nil, fakeHierarchy{})

	res, err := svc.All(context.Background(),
		scope.Actor{ID: 7, TenantID: 1, Role: permission.RoleHRManager, TeamID: 0},
		"day", mustParseStr("2026-05-25"))
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if !att.lastScope.All {
		t.Error("scope.All=false want true")
	}
	if res.Period.TotalActualMinutes != 480 {
		t.Errorf("actual=%d want 480", res.Period.TotalActualMinutes)
	}
}

// All — general → ErrForbidden.
func TestService_All_General_Forbidden(t *testing.T) {
	g := seedUser(7, permission.RoleGeneral, 10)
	us := &fakeUserStore{users: map[int64]dbq.User{7: g}}
	svc := newSvc(&fakeAttendanceStore{}, us, nil, fakeHierarchy{})

	_, err := svc.All(context.Background(),
		scope.Actor{ID: 7, TenantID: 1, Role: permission.RoleGeneral, TeamID: 10},
		"day", mustParseStr("2026-05-25"))
	if !errors.Is(err, scope.ErrForbidden) {
		t.Fatalf("err=%v want ErrForbidden", err)
	}
}

// Mine + Holiday 영업일 계산.
func TestService_Mine_Month_BusinessDaysWithHolidays(t *testing.T) {
	user := seedUser(7, permission.RoleGeneral, 10)
	us := &fakeUserStore{users: map[int64]dbq.User{7: user}}

	hs := &fakeHolidayStore{holidays: []dbq.Holiday{
		{ID: 1, TenantID: 1, Date: pgtype.Date{Time: mustParseStr("2026-05-05"), Valid: true}, Name: "어린이날"},
	}}

	att := &fakeAttendanceStore{}
	svc := newSvc(att, us, hs, fakeHierarchy{})

	res, err := svc.Mine(context.Background(),
		scope.Actor{ID: 7, TenantID: 1, Role: permission.RoleGeneral, TeamID: 10},
		"month", mustParseStr("2026-05-15"))
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	// 2026-05: 31일, 주말 (2/3, 9/10, 16/17, 23/24, 30/31) = 10일, 공휴일 1일(5월5일) = 평일 1개 차감.
	// 5월 1일 금, 5월 4일 월, 5/5 화 = 공휴일, 5/6 수 ...
	// 영업일 = 31 - 10 - 1 = 20.
	if res.Period.BusinessDays != 20 {
		t.Errorf("BusinessDays=%d want 20", res.Period.BusinessDays)
	}
}
