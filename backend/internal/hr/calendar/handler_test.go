package calendar_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/calendar"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

func engineFor(actorID int64, role permission.Role, svc *calendar.Service) *gin.Engine {
	gin.SetMode(gin.TestMode)
	eng := gin.New()
	eng.Use(func(c *gin.Context) {
		c.Set("auth:user_id", actorID)
		c.Set("auth:role", role)
		c.Set("auth:tenant_id", tenantID)
		c.Next()
	})
	h := calendar.NewHandler(svc)
	eng.POST("/api/hr/calendar/list", h.List)
	return eng
}

func doJSON(eng *gin.Engine, method, path string, body any) (*httptest.ResponseRecorder, []byte) {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	raw, _ := io.ReadAll(w.Body)
	return w, raw
}

type calendarLeaveData struct {
	ID            int64   `json:"id"`
	RequesterID   int64   `json:"requesterId"`
	RequesterName string  `json:"requesterName"`
	LeaveTypeID   int64   `json:"leaveTypeId"`
	LeaveTypeCode string  `json:"leaveTypeCode"`
	LeaveTypeName string  `json:"leaveTypeName"`
	StartAt       string  `json:"startAt"`
	EndAt         string  `json:"endAt"`
	Status        string  `json:"status"`
	Reason        *string `json:"reason,omitempty"`
}

type calendarHolidayData struct {
	ID          int64  `json:"id"`
	Date        string `json:"date"`
	Name        string `json:"name"`
	IsRecurring bool   `json:"isRecurring"`
	CountryCode string `json:"countryCode"`
}

type calendarAttendanceData struct {
	ID         int64   `json:"id"`
	UserID     int64   `json:"userId"`
	WorkDate   string  `json:"workDate"`
	CheckInAt  *string `json:"checkInAt,omitempty"`
	CheckOutAt *string `json:"checkOutAt,omitempty"`
	Status     string  `json:"status"`
}

type calendarData struct {
	Leaves      []calendarLeaveData      `json:"leaves"`
	Holidays    []calendarHolidayData    `json:"holidays"`
	Attendances []calendarAttendanceData `json:"attendances"`
}

func TestHandler_List_Success_Envelope(t *testing.T) {
	f := newFakeStore()
	f.addLeave(dbq.ListCalendarLeavesRow{
		ID: 1, TenantID: tenantID, RequesterID: actorID,
		LeaveTypeID:   leaveTypeID,
		StartAt:       pgTS(kstAt(t, "2026-06-01 09:00")),
		EndAt:         pgTS(kstAt(t, "2026-06-01 18:00")),
		Hours:         numericFromFloat(8),
		Reason:        pgText("개인 사유"),
		Status:        dbq.LeaveRequestStatusApproved,
		ApproverID:    pgInt8(approverID),
		RequesterName: "본인",
		LeaveTypeCode: "annual",
		LeaveTypeName: "연차",
	})
	f.addHoliday(dbq.Holiday{
		ID: 10, TenantID: tenantID, Date: pgDate(kstDay(t, "2026-06-06")),
		Name: "현충일", IsRecurring: true, CountryCode: "KR",
	})

	eng := engineFor(actorID, permission.RoleGeneral, newSvc(f))
	w, raw := doJSON(eng, http.MethodPost, "/api/hr/calendar/list", map[string]any{
		"from":  "2026-05-25",
		"to":    "2026-06-30",
		"scope": "all",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[calendarData]
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatal(err)
	}
	if !env.Success || env.Data == nil {
		t.Fatalf("env=%+v", env)
	}
	if len(env.Data.Leaves) != 1 || len(env.Data.Holidays) != 1 {
		t.Errorf("leaves=%d holidays=%d", len(env.Data.Leaves), len(env.Data.Holidays))
	}
	// 본인 사유 노출 확인.
	if env.Data.Leaves[0].Reason == nil || *env.Data.Leaves[0].Reason != "개인 사유" {
		t.Errorf("requester reason should be visible, got=%v", env.Data.Leaves[0].Reason)
	}
}

func TestHandler_List_DateRangeTooLarge_400(t *testing.T) {
	f := newFakeStore()
	eng := engineFor(actorID, permission.RoleGeneral, newSvc(f))
	w, raw := doJSON(eng, http.MethodPost, "/api/hr/calendar/list", map[string]any{
		"from":  "2026-01-01",
		"to":    "2026-05-01", // 4개월
		"scope": "all",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Success || env.Details == nil || env.Details.ErrorCode != errorcode.DateRangeTooLarge {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_List_InvalidDateFormat_400(t *testing.T) {
	f := newFakeStore()
	eng := engineFor(actorID, permission.RoleGeneral, newSvc(f))
	w, raw := doJSON(eng, http.MethodPost, "/api/hr/calendar/list", map[string]any{
		"from": "bad-date", "to": "2026-06-30", "scope": "all",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Success || env.Details == nil || env.Details.ErrorCode != errorcode.ValidationFailed {
		t.Fatalf("env=%+v", env)
	}
}

func TestHandler_List_MissingFromTo_400(t *testing.T) {
	f := newFakeStore()
	eng := engineFor(actorID, permission.RoleGeneral, newSvc(f))
	w, raw := doJSON(eng, http.MethodPost, "/api/hr/calendar/list", map[string]any{
		"scope": "all",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
}
