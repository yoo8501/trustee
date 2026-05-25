package stats_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/attendance/stats"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func fakeAuth(userID int64, role permission.Role, teamID int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("auth:user_id", userID)
		c.Set("auth:tenant_id", int64(1))
		c.Set("auth:role", role)
		c.Set("auth:team_id", teamID) // 핸들러가 actor 구성에 사용.
		c.Next()
	}
}

func newHandlerEngine(h *stats.Handler, userID int64, role permission.Role, teamID int64) *gin.Engine {
	eng := gin.New()
	eng.POST("/api/hr/attendance/me/stats", fakeAuth(userID, role, teamID), h.Mine)
	eng.POST("/api/hr/attendance/team/:teamId/stats", fakeAuth(userID, role, teamID), h.Team)
	eng.POST("/api/hr/attendance/all/stats", fakeAuth(userID, role, teamID), h.All)
	return eng
}

func doJSON(t *testing.T, eng *gin.Engine, method, path string, body any) (*httptest.ResponseRecorder, []byte) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	raw, _ := io.ReadAll(w.Body)
	return w, raw
}

// statsAPI — 응답 envelope 검증용.
type periodAPI struct {
	From                 string  `json:"from"`
	To                   string  `json:"to"`
	TotalActualMinutes   int     `json:"totalActualMinutes"`
	TotalOvertimeMinutes int     `json:"totalOvertimeMinutes"`
	BusinessDays         int     `json:"businessDays"`
	AttendanceRate       float64 `json:"attendanceRate"`
}

type recordAPI struct {
	Date              string `json:"date"`
	Status            string `json:"status"`
	ActualWorkMinutes int    `json:"actualWorkMinutes"`
	OvertimeMinutes   int    `json:"overtimeMinutes"`
}

type mineResp struct {
	Period  periodAPI   `json:"period"`
	Records []recordAPI `json:"records"`
}

type teamResp struct {
	Period  periodAPI       `json:"period"`
	Members []memberSummary `json:"members"`
}

type memberSummary struct {
	UserID             int64 `json:"userId"`
	TotalActualMinutes int   `json:"totalActualMinutes"`
}

// 200 + envelope shape (Mine).
func TestHandler_Mine_Success_Envelope(t *testing.T) {
	user := seedUser(7, permission.RoleGeneral, 10)
	us := &fakeUserStore{users: map[int64]dbq.User{7: user}}
	att := &fakeAttendanceStore{records: []dbq.AttendanceRecord{
		attendanceRow(1, 7, "2026-05-25", "2026-05-25 09:00", "2026-05-25 18:00"),
	}}
	svc := newSvc(att, us, nil, fakeHierarchy{})
	hdl := stats.NewHandler(svc)
	eng := newHandlerEngine(hdl, 7, permission.RoleGeneral, 10)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/attendance/me/stats", map[string]any{
		"period": "day", "date": "2026-05-25",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[mineResp]
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatalf("unmarshal: %v body=%s", err, raw)
	}
	if !env.Success || env.Data == nil {
		t.Fatalf("envelope: %+v body=%s", env, raw)
	}
	if env.Data.Period.TotalActualMinutes != 480 {
		t.Errorf("totalActual=%d want 480", env.Data.Period.TotalActualMinutes)
	}
	if len(env.Data.Records) != 1 {
		t.Errorf("records=%d want 1", len(env.Data.Records))
	}
}

// 400 — invalid period.
func TestHandler_Mine_InvalidPeriod_400(t *testing.T) {
	us := &fakeUserStore{users: map[int64]dbq.User{7: seedUser(7, permission.RoleGeneral, 10)}}
	svc := newSvc(nil, us, nil, fakeHierarchy{})
	hdl := stats.NewHandler(svc)
	eng := newHandlerEngine(hdl, 7, permission.RoleGeneral, 10)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/attendance/me/stats", map[string]any{
		"period": "year", "date": "2026-05-25",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.ValidationFailed {
		t.Fatalf("errorCode=%+v", env.Details)
	}
}

// 400 — invalid date 형식.
func TestHandler_Mine_InvalidDate_400(t *testing.T) {
	us := &fakeUserStore{users: map[int64]dbq.User{7: seedUser(7, permission.RoleGeneral, 10)}}
	svc := newSvc(nil, us, nil, fakeHierarchy{})
	hdl := stats.NewHandler(svc)
	eng := newHandlerEngine(hdl, 7, permission.RoleGeneral, 10)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/attendance/me/stats", map[string]any{
		"period": "day", "date": "not-a-date",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	_ = raw
}

// Team — team_lead 본인 팀 200.
func TestHandler_Team_TeamLead_OwnTeam_200(t *testing.T) {
	lead := seedUser(7, permission.RoleTeamLead, 10)
	member := seedUser(8, permission.RoleGeneral, 10)
	us := &fakeUserStore{users: map[int64]dbq.User{7: lead, 8: member}}
	att := &fakeAttendanceStore{records: []dbq.AttendanceRecord{
		attendanceRow(1, 8, "2026-05-25", "2026-05-25 09:00", "2026-05-25 18:00"),
	}}
	svc := newSvc(att, us, nil, fakeHierarchy{})
	hdl := stats.NewHandler(svc)
	eng := newHandlerEngine(hdl, 7, permission.RoleTeamLead, 10)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/attendance/team/10/stats", map[string]any{
		"period": "day", "date": "2026-05-25",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[teamResp]
	_ = json.Unmarshal(raw, &env)
	if env.Data == nil {
		t.Fatalf("data nil body=%s", raw)
	}
}

// Team — team_lead 다른 팀 → 403.
func TestHandler_Team_TeamLead_OtherTeam_403(t *testing.T) {
	lead := seedUser(7, permission.RoleTeamLead, 10)
	us := &fakeUserStore{users: map[int64]dbq.User{7: lead}}
	att := &fakeAttendanceStore{}
	svc := newSvc(att, us, nil, fakeHierarchy{})
	hdl := stats.NewHandler(svc)
	eng := newHandlerEngine(hdl, 7, permission.RoleTeamLead, 10)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/attendance/team/99/stats", map[string]any{
		"period": "day", "date": "2026-05-25",
	})
	if w.Code != http.StatusForbidden {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.Forbidden {
		t.Fatalf("errorCode=%+v", env.Details)
	}
}

// All — hr_manager 200.
func TestHandler_All_HR_200(t *testing.T) {
	hr := seedUser(7, permission.RoleHRManager, 0)
	us := &fakeUserStore{users: map[int64]dbq.User{7: hr,
		8: seedUser(8, permission.RoleGeneral, 10)}}
	att := &fakeAttendanceStore{records: []dbq.AttendanceRecord{
		attendanceRow(1, 8, "2026-05-25", "2026-05-25 09:00", "2026-05-25 18:00"),
	}}
	svc := newSvc(att, us, nil, fakeHierarchy{})
	hdl := stats.NewHandler(svc)
	eng := newHandlerEngine(hdl, 7, permission.RoleHRManager, 0)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/attendance/all/stats", map[string]any{
		"period": "day", "date": "2026-05-25",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	_ = raw
}

// All — general → 403 (handler가 service 호출 후 ErrForbidden 매핑).
func TestHandler_All_General_403(t *testing.T) {
	g := seedUser(7, permission.RoleGeneral, 10)
	us := &fakeUserStore{users: map[int64]dbq.User{7: g}}
	svc := newSvc(&fakeAttendanceStore{}, us, nil, fakeHierarchy{})
	hdl := stats.NewHandler(svc)
	eng := newHandlerEngine(hdl, 7, permission.RoleGeneral, 10)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/attendance/all/stats", map[string]any{
		"period": "day", "date": "2026-05-25",
	})
	if w.Code != http.StatusForbidden {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.Forbidden {
		t.Fatalf("errorCode=%+v", env.Details)
	}
}

// 401 — 인증 없이 호출.
func TestHandler_Mine_Unauthenticated_401(t *testing.T) {
	us := &fakeUserStore{users: map[int64]dbq.User{}}
	svc := newSvc(nil, us, nil, fakeHierarchy{})
	hdl := stats.NewHandler(svc)
	eng := gin.New()
	eng.POST("/api/hr/attendance/me/stats", hdl.Mine) // 인증 미들웨어 없음

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/attendance/me/stats", map[string]any{
		"period": "day", "date": "2026-05-25",
	})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
}

// 패키지 비참여 import 가드 (linter).
var _ = pgtype.Date{}
