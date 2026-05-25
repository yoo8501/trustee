// Package permission_test — Sprint 5 권한 매트릭스: 역할 5종 × 리소스 3종 (me / team / all) = 15+ 케이스.
//
// 본 테스트는 stats handler 가 Scoped Querier (Resolve) 를 통해 권한을 어떻게 강제하는지
// 매트릭스로 검증한다. domain 동작 (계산값 정확성) 은 stats 단위 테스트가 책임.
package permission_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/attendance/stats"
	"github.com/sjseo/docflow/backend/internal/hr/scope"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// ---- fakes (stats 패키지의 fake 와 중복이지만 cross-package import 회피) ----

type attStore struct {
	records []dbq.AttendanceRecord
	calls   atomic.Int64
}

func (s *attStore) ListAttendanceForRange(_ context.Context, sc scope.Scope, from, to time.Time) ([]dbq.AttendanceRecord, error) {
	s.calls.Add(1)
	var out []dbq.AttendanceRecord
	for _, r := range s.records {
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
		out = append(out, r)
	}
	return out, nil
}

type userStore struct {
	users map[int64]dbq.User
}

func (s *userStore) GetUserByID(_ context.Context, arg dbq.GetUserByIDParams) (dbq.User, error) {
	u, ok := s.users[arg.ID]
	if !ok || u.TenantID != arg.TenantID {
		return dbq.User{}, pgx.ErrNoRows
	}
	return u, nil
}

func (s *userStore) ListUsersByTeams(_ context.Context, tenantID int64, teamIDs []int64) ([]dbq.User, error) {
	set := map[int64]bool{}
	for _, id := range teamIDs {
		set[id] = true
	}
	var out []dbq.User
	for _, u := range s.users {
		if u.TenantID != tenantID {
			continue
		}
		if u.TeamID.Valid && set[u.TeamID.Int64] {
			out = append(out, u)
		}
	}
	return out, nil
}

type holStore struct{}

func (holStore) ListHolidaysInRange(_ context.Context, _ dbq.ListHolidaysInRangeParams) ([]dbq.Holiday, error) {
	return nil, nil
}

type hierarchy struct{}

func (hierarchy) DescendantsOf(teamID int64) []int64 { return []int64{teamID} }

// ---- helpers ----

func mkUser(id int64, role permission.Role, teamID int64) dbq.User {
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

func fakeAuth(userID int64, role permission.Role, teamID int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("auth:user_id", userID)
		c.Set("auth:tenant_id", int64(1))
		c.Set("auth:role", role)
		c.Set("auth:team_id", teamID)
		c.Next()
	}
}

func newEngine(t *testing.T, actor dbq.User) (*gin.Engine, *attStore) {
	t.Helper()
	us := &userStore{users: map[int64]dbq.User{actor.ID: actor}}
	att := &attStore{}
	svc := stats.NewService(att, us, holStore{}, hierarchy{}, stats.NoopLeaveAdjustmentFetcher{})
	hdl := stats.NewHandler(svc)

	teamID := int64(0)
	if actor.TeamID.Valid {
		teamID = actor.TeamID.Int64
	}

	eng := gin.New()
	g := eng.Group("/")
	g.Use(fakeAuth(actor.ID, permission.Role(actor.Role), teamID))
	g.POST("/api/hr/attendance/me/stats", hdl.Mine)
	g.POST("/api/hr/attendance/team/:teamId/stats", hdl.Team)
	g.POST("/api/hr/attendance/all/stats", hdl.All)
	return eng, att
}

func doPost(t *testing.T, eng *gin.Engine, path string, body any) (*httptest.ResponseRecorder, []byte) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(http.MethodPost, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	raw, _ := io.ReadAll(w.Body)
	return w, raw
}

// ---- matrix ----

func TestSprint5_PermissionMatrix_RoleByResource(t *testing.T) {
	type tc struct {
		name            string
		role            permission.Role
		teamID          int64
		method          string
		path            string
		body            map[string]any
		expectStatus    int
		expectErrorCode string
	}
	dayBody := map[string]any{"period": "day", "date": "2026-05-25"}

	cases := []tc{
		// ---- general ----
		{"general → /me 200", permission.RoleGeneral, 10, "POST", "/api/hr/attendance/me/stats",
			dayBody, http.StatusOK, ""},
		{"general → /team/10 403", permission.RoleGeneral, 10, "POST", "/api/hr/attendance/team/10/stats",
			dayBody, http.StatusForbidden, errorcode.Forbidden},
		{"general → /all 403", permission.RoleGeneral, 10, "POST", "/api/hr/attendance/all/stats",
			dayBody, http.StatusForbidden, errorcode.Forbidden},

		// ---- team_lead ----
		{"team_lead → /me 200", permission.RoleTeamLead, 10, "POST", "/api/hr/attendance/me/stats",
			dayBody, http.StatusOK, ""},
		{"team_lead → /team/10 (own) 200", permission.RoleTeamLead, 10, "POST", "/api/hr/attendance/team/10/stats",
			dayBody, http.StatusOK, ""},
		{"team_lead → /team/99 (other) 403", permission.RoleTeamLead, 10, "POST", "/api/hr/attendance/team/99/stats",
			dayBody, http.StatusForbidden, errorcode.Forbidden},
		{"team_lead → /all 403", permission.RoleTeamLead, 10, "POST", "/api/hr/attendance/all/stats",
			dayBody, http.StatusForbidden, errorcode.Forbidden},

		// ---- dept_head ----
		{"dept_head → /me 200", permission.RoleDeptHead, 100, "POST", "/api/hr/attendance/me/stats",
			dayBody, http.StatusOK, ""},
		{"dept_head → /team/100 (own dept) 200", permission.RoleDeptHead, 100, "POST", "/api/hr/attendance/team/100/stats",
			dayBody, http.StatusOK, ""},
		{"dept_head → /all 403", permission.RoleDeptHead, 100, "POST", "/api/hr/attendance/all/stats",
			dayBody, http.StatusForbidden, errorcode.Forbidden},

		// ---- hr_manager ----
		{"hr_manager → /me 200", permission.RoleHRManager, 0, "POST", "/api/hr/attendance/me/stats",
			dayBody, http.StatusOK, ""},
		{"hr_manager → /team/77 200", permission.RoleHRManager, 0, "POST", "/api/hr/attendance/team/77/stats",
			dayBody, http.StatusOK, ""},
		{"hr_manager → /all 200", permission.RoleHRManager, 0, "POST", "/api/hr/attendance/all/stats",
			dayBody, http.StatusOK, ""},

		// ---- super_admin ----
		{"super_admin → /me 200", permission.RoleSuperAdmin, 0, "POST", "/api/hr/attendance/me/stats",
			dayBody, http.StatusOK, ""},
		{"super_admin → /team/55 200", permission.RoleSuperAdmin, 0, "POST", "/api/hr/attendance/team/55/stats",
			dayBody, http.StatusOK, ""},
		{"super_admin → /all 200", permission.RoleSuperAdmin, 0, "POST", "/api/hr/attendance/all/stats",
			dayBody, http.StatusOK, ""},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			user := mkUser(7, c.role, c.teamID)
			eng, _ := newEngine(t, user)

			w, raw := doPost(t, eng, c.path, c.body)
			if w.Code != c.expectStatus {
				t.Fatalf("code=%d want %d body=%s", w.Code, c.expectStatus, raw)
			}
			if c.expectErrorCode != "" {
				var env apiresult.Envelope[any]
				if err := json.Unmarshal(raw, &env); err != nil {
					t.Fatalf("unmarshal err=%v body=%s", err, raw)
				}
				if env.Details == nil || env.Details.ErrorCode != c.expectErrorCode {
					t.Fatalf("errorCode=%+v want %s", env.Details, c.expectErrorCode)
				}
			}
		})
	}
}

// 회계 검증 (DoD): 자기 통계 합계 = 원본 attendance_records 합계, diff=0.
func TestSprint5_Mine_AccountingInvariant(t *testing.T) {
	user := mkUser(7, permission.RoleGeneral, 10)
	us := &userStore{users: map[int64]dbq.User{7: user}}

	records := []dbq.AttendanceRecord{
		mkRecord(1, 7, "2026-05-25", "2026-05-25 09:00", "2026-05-25 18:00"),
		mkRecord(2, 7, "2026-05-26", "2026-05-26 08:30", "2026-05-26 19:30"),
		mkRecord(3, 7, "2026-05-27", "2026-05-27 10:30", "2026-05-27 17:00"),
		mkRecord(4, 7, "2026-05-28", "2026-05-28 09:00", "2026-05-28 22:00"),
	}
	att := &attStore{records: records}

	svc := stats.NewService(att, us, holStore{}, hierarchy{}, stats.NoopLeaveAdjustmentFetcher{})

	// 원본 합계 (handler 우회, 수동 계산) - lunch_break_minutes=60 가정.
	var rawSum int
	for _, r := range records {
		actual := int(r.CheckOutAt.Time.Sub(r.CheckInAt.Time).Minutes()) - int(r.LunchBreakMinutes)
		if actual < 0 {
			actual = 0
		}
		rawSum += actual
	}

	res, err := svc.Mine(context.Background(),
		scope.Actor{ID: 7, TenantID: 1, Role: permission.RoleGeneral, TeamID: 10},
		"week", mustDate("2026-05-25"))
	if err != nil {
		t.Fatal(err)
	}
	diff := res.Period.TotalActualMinutes - rawSum
	if diff != 0 {
		t.Fatalf("ACCOUNTING DIFF=%d raw=%d period=%d", diff, rawSum, res.Period.TotalActualMinutes)
	}
}

// ---- record helpers ----

func mkRecord(id, userID int64, date, in, out string) dbq.AttendanceRecord {
	r := dbq.AttendanceRecord{
		ID: id, TenantID: 1, UserID: userID,
		WorkDate:          pgtype.Date{Time: mustDate(date), Valid: true},
		LunchBreakMinutes: 60,
		Source:            dbq.AttendanceSourceButton,
		Status:            dbq.AttendanceStatusNormal,
	}
	if in != "" {
		r.CheckInAt = pgtype.Timestamptz{Time: mustTS(in), Valid: true}
	}
	if out != "" {
		r.CheckOutAt = pgtype.Timestamptz{Time: mustTS(out), Valid: true}
	}
	return r
}

func mustDate(ymd string) time.Time {
	v, err := time.Parse("2006-01-02", ymd)
	if err != nil {
		panic(err)
	}
	return v
}

func mustTS(ts string) time.Time {
	v, err := time.Parse("2006-01-02 15:04", ts)
	if err != nil {
		panic(err)
	}
	return v
}

// 패키지 import 가드.
var _ = errors.Is
