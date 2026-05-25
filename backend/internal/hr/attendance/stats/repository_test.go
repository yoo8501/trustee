package stats_test

import (
	"context"
	"testing"
	"time"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/attendance/stats"
	"github.com/sjseo/docflow/backend/internal/hr/scope"
)

// fakeQuerier — stats.SQLCQuerier 메모리 구현. 호출된 메서드 이름 캡처.
type fakeQuerier struct {
	called string
}

func (f *fakeQuerier) ListAttendanceByUserRange(_ context.Context, _ dbq.ListAttendanceByUserRangeParams) ([]dbq.AttendanceRecord, error) {
	f.called = "user"
	return []dbq.AttendanceRecord{{ID: 1}}, nil
}

func (f *fakeQuerier) ListAttendanceByTeamsRange(_ context.Context, _ dbq.ListAttendanceByTeamsRangeParams) ([]dbq.AttendanceRecord, error) {
	f.called = "teams"
	return []dbq.AttendanceRecord{{ID: 2}}, nil
}

func (f *fakeQuerier) ListAttendanceByTenantRange(_ context.Context, _ dbq.ListAttendanceByTenantRangeParams) ([]dbq.AttendanceRecord, error) {
	f.called = "tenant"
	return []dbq.AttendanceRecord{{ID: 3}}, nil
}

func (f *fakeQuerier) ListUsersByTeams(_ context.Context, _ dbq.ListUsersByTeamsParams) ([]dbq.User, error) {
	return []dbq.User{{ID: 1}}, nil
}

func (f *fakeQuerier) GetUserByID(_ context.Context, _ dbq.GetUserByIDParams) (dbq.User, error) {
	return dbq.User{ID: 1}, nil
}

func (f *fakeQuerier) ListHolidaysInRange(_ context.Context, _ dbq.ListHolidaysInRangeParams) ([]dbq.Holiday, error) {
	return nil, nil
}

func (f *fakeQuerier) ListTeamDescendants(_ context.Context, _ dbq.ListTeamDescendantsParams) ([]int64, error) {
	return nil, nil
}

// All=true → tenant 쿼리 호출.
func TestSQLAttendanceStore_All_CallsTenantRange(t *testing.T) {
	q := &fakeQuerier{}
	store := stats.NewSQLAttendanceStore(q)

	got, err := store.ListAttendanceForRange(context.Background(),
		scope.Scope{TenantID: 1, All: true},
		time.Now(), time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if q.called != "tenant" {
		t.Errorf("called=%s want tenant", q.called)
	}
	if len(got) != 1 || got[0].ID != 3 {
		t.Errorf("got=%+v", got)
	}
}

// UserID != nil → user 쿼리 호출.
func TestSQLAttendanceStore_User_CallsUserRange(t *testing.T) {
	q := &fakeQuerier{}
	store := stats.NewSQLAttendanceStore(q)

	uid := int64(7)
	_, err := store.ListAttendanceForRange(context.Background(),
		scope.Scope{TenantID: 1, UserID: &uid},
		time.Now(), time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if q.called != "user" {
		t.Errorf("called=%s want user", q.called)
	}
}

// TeamIDs 비어있지 않음 → teams 쿼리.
func TestSQLAttendanceStore_Teams_CallsTeamsRange(t *testing.T) {
	q := &fakeQuerier{}
	store := stats.NewSQLAttendanceStore(q)

	_, err := store.ListAttendanceForRange(context.Background(),
		scope.Scope{TenantID: 1, TeamIDs: []int64{10, 11}},
		time.Now(), time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if q.called != "teams" {
		t.Errorf("called=%s want teams", q.called)
	}
}

// 모두 비어있는 scope → 빈 결과 (안전 default).
func TestSQLAttendanceStore_Empty_ReturnsNoRows(t *testing.T) {
	q := &fakeQuerier{}
	store := stats.NewSQLAttendanceStore(q)

	got, err := store.ListAttendanceForRange(context.Background(),
		scope.Scope{TenantID: 1},
		time.Now(), time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if q.called != "" {
		t.Errorf("called=%s want empty (no SQL call)", q.called)
	}
	if len(got) != 0 {
		t.Errorf("got=%v want empty", got)
	}
}

// SQLUserStore — empty teamIDs → no SQL call, nil result.
func TestSQLUserStore_EmptyTeamIDs_NoCall(t *testing.T) {
	q := &fakeQuerier{}
	store := stats.NewSQLUserStore(q)
	got, err := store.ListUsersByTeams(context.Background(), 1, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Errorf("got=%v want nil", got)
	}
}

// SQLUserStore — non-empty teamIDs → SQL call.
func TestSQLUserStore_TeamIDs_CallsQuery(t *testing.T) {
	q := &fakeQuerier{}
	store := stats.NewSQLUserStore(q)
	got, err := store.ListUsersByTeams(context.Background(), 1, []int64{10})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Errorf("got=%+v", got)
	}
}

// SQLUserStore.GetUserByID — passthrough.
func TestSQLUserStore_GetUserByID_Passthrough(t *testing.T) {
	q := &fakeQuerier{}
	store := stats.NewSQLUserStore(q)
	u, err := store.GetUserByID(context.Background(), dbq.GetUserByIDParams{ID: 1, TenantID: 1})
	if err != nil {
		t.Fatal(err)
	}
	if u.ID != 1 {
		t.Errorf("id=%d want 1", u.ID)
	}
}
