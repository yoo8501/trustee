package leaverequest_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/leaverequest"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// engineFor — actorID/role 을 인증 context 에 주입하는 미니 라우터.
func engineFor(actorID int64, role permission.Role, svc *leaverequest.Service) *gin.Engine {
	gin.SetMode(gin.TestMode)
	eng := gin.New()
	eng.Use(func(c *gin.Context) {
		c.Set("auth:user_id", actorID)
		c.Set("auth:role", role)
		c.Set("auth:tenant_id", tenantID)
		c.Next()
	})
	h := leaverequest.NewHandler(svc)
	eng.POST("/api/hr/leave-requests", h.Create)
	eng.GET("/api/hr/leave-requests/:id", h.Get)
	eng.POST("/api/hr/leave-requests/me/list", h.MyList)
	eng.POST("/api/hr/leave-requests/pending/list", h.PendingList)
	eng.POST("/api/hr/leave-requests/:id/approve", h.Approve)
	eng.POST("/api/hr/leave-requests/:id/reject", h.Reject)
	eng.POST("/api/hr/leave-requests/:id/cancel", h.Cancel)
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

type leaveRequestData struct {
	ID          int64   `json:"id"`
	RequesterID int64   `json:"requesterId"`
	LeaveTypeID int64   `json:"leaveTypeId"`
	Status      string  `json:"status"`
	Hours       float64 `json:"hours"`
	ApproverID  int64   `json:"approverId,omitempty"`
}

func newSvc(f *fakeStore) *leaverequest.Service {
	return leaverequest.NewService(f, f, nil)
}

func TestHandler_Create_Success_201(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/leave-requests", map[string]any{
		"leaveTypeId": leaveTypeID,
		"startAt":     "2026-06-01T09:00:00+09:00",
		"endAt":       "2026-06-01T18:00:00+09:00",
		"hours":       8.0,
		"reason":      "휴식",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[leaveRequestData]
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatal(err)
	}
	if !env.Success || env.Data == nil {
		t.Fatalf("env=%+v body=%s", env, raw)
	}
	if env.Data.Status != string(dbq.LeaveRequestStatusPending) {
		t.Errorf("status=%s want pending", env.Data.Status)
	}
	if env.Data.ApproverID != managerID {
		t.Errorf("approverId=%d want manager=%d", env.Data.ApproverID, managerID)
	}
}

func TestHandler_Create_Validation_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/leave-requests", map[string]any{
		"hours": 8.0,
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Success || env.Details == nil || env.Details.ErrorCode != errorcode.ValidationFailed {
		t.Fatalf("env=%+v body=%s", env, raw)
	}
}

func TestHandler_Create_InsufficientBalance_409_WithShortfall(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 4) // 4h 만 granted.
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/leave-requests", map[string]any{
		"leaveTypeId": leaveTypeID,
		"startAt":     "2026-06-01T09:00:00+09:00",
		"endAt":       "2026-06-01T18:00:00+09:00",
		"hours":       8.0,
	})
	if w.Code != http.StatusConflict {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.InsufficientLeaveBalance {
		t.Fatalf("errorCode=%v body=%s", env.Details, raw)
	}
	// shortfall_hours = 8 - 4 = 4.0
	found := false
	for _, f := range env.Details.Fields {
		if f.Field == "shortfall_hours" {
			if v, err := strconv.ParseFloat(f.Reason, 64); err != nil || v != 4.0 {
				t.Errorf("shortfall=%v want 4.0", f.Reason)
			}
			found = true
		}
	}
	if !found {
		t.Errorf("shortfall_hours not in fields: %+v", env.Details.Fields)
	}
}

func TestHandler_Create_DuplicateLeaveDate_409(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	// 기존 pending 신청 시드 — 같은 날짜 겹침.
	existingStart, _ := time.Parse(time.RFC3339, "2026-06-01T09:00:00+09:00")
	existingEnd, _ := time.Parse(time.RFC3339, "2026-06-01T18:00:00+09:00")
	f.requests[100] = dbq.LeaveRequest{
		ID: 100, TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: pgtype.Timestamptz{Time: existingStart, Valid: true},
		EndAt:   pgtype.Timestamptz{Time: existingEnd, Valid: true},
		Status:  dbq.LeaveRequestStatusPending,
	}
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/leave-requests", map[string]any{
		"leaveTypeId": leaveTypeID,
		"startAt":     "2026-06-01T09:00:00+09:00",
		"endAt":       "2026-06-01T18:00:00+09:00",
		"hours":       8.0,
	})
	if w.Code != http.StatusConflict {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.DuplicateLeaveDate {
		t.Fatalf("errorCode=%v body=%s", env.Details, raw)
	}
}

func TestHandler_Create_InvalidDateRange_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/leave-requests", map[string]any{
		"leaveTypeId": leaveTypeID,
		"startAt":     "2026-06-02T09:00:00+09:00",
		"endAt":       "2026-06-01T18:00:00+09:00", // start > end
		"hours":       8.0,
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.InvalidDateRange {
		t.Fatalf("errorCode=%v body=%s", env.Details, raw)
	}
}

func TestHandler_Approve_Success_200(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	// 신청 시드 (pending).
	startAt, _ := time.Parse(time.RFC3339, "2026-06-01T09:00:00+09:00")
	endAt, _ := time.Parse(time.RFC3339, "2026-06-01T18:00:00+09:00")
	f.requests[200] = dbq.LeaveRequest{
		ID: 200, TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: pgtype.Timestamptz{Time: startAt, Valid: true},
		EndAt:   pgtype.Timestamptz{Time: endAt, Valid: true},
		Hours:   numericFromFloat(8),
		Status:  dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(managerID, permission.RoleTeamLead, newSvc(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/leave-requests/200/approve", map[string]any{
		"comment": "ok",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[leaveRequestData]
	_ = json.Unmarshal(raw, &env)
	if !env.Success || env.Data == nil || env.Data.Status != string(dbq.LeaveRequestStatusApproved) {
		t.Fatalf("env=%+v body=%s", env, raw)
	}
}

func TestHandler_Approve_AlreadyDecided_409(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	startAt, _ := time.Parse(time.RFC3339, "2026-06-01T09:00:00+09:00")
	endAt, _ := time.Parse(time.RFC3339, "2026-06-01T18:00:00+09:00")
	f.requests[201] = dbq.LeaveRequest{
		ID: 201, TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: pgtype.Timestamptz{Time: startAt, Valid: true},
		EndAt:   pgtype.Timestamptz{Time: endAt, Valid: true},
		Hours:   numericFromFloat(8),
		Status:  dbq.LeaveRequestStatusApproved, // 이미 승인됨.
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(managerID, permission.RoleTeamLead, newSvc(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/leave-requests/201/approve", map[string]any{})
	if w.Code != http.StatusConflict {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.ApprovalInvalidState {
		t.Fatalf("errorCode=%v body=%s", env.Details, raw)
	}
}

func TestHandler_Approve_OtherUsersApprover_403(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	startAt, _ := time.Parse(time.RFC3339, "2026-06-01T09:00:00+09:00")
	endAt, _ := time.Parse(time.RFC3339, "2026-06-01T18:00:00+09:00")
	f.requests[202] = dbq.LeaveRequest{
		ID: 202, TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: pgtype.Timestamptz{Time: startAt, Valid: true},
		EndAt:   pgtype.Timestamptz{Time: endAt, Valid: true},
		Hours:   numericFromFloat(8),
		Status:  dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	// otherUserID 가 결재 시도 — 본인 아님.
	eng := engineFor(otherUserID, permission.RoleTeamLead, newSvc(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/leave-requests/202/approve", map[string]any{})
	if w.Code != http.StatusForbidden {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.Forbidden {
		t.Fatalf("errorCode=%v body=%s", env.Details, raw)
	}
}

func TestHandler_Reject_CommentRequired_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	startAt, _ := time.Parse(time.RFC3339, "2026-06-01T09:00:00+09:00")
	endAt, _ := time.Parse(time.RFC3339, "2026-06-01T18:00:00+09:00")
	f.requests[203] = dbq.LeaveRequest{
		ID: 203, TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: pgtype.Timestamptz{Time: startAt, Valid: true},
		EndAt:   pgtype.Timestamptz{Time: endAt, Valid: true},
		Hours:   numericFromFloat(8),
		Status:  dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(managerID, permission.RoleTeamLead, newSvc(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/leave-requests/203/reject", map[string]any{
		"comment": "",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.ValidationFailed {
		t.Fatalf("errorCode=%v body=%s", env.Details, raw)
	}
}

func TestInsufficientBalanceError_Error(t *testing.T) {
	e := &leaverequest.InsufficientBalanceError{ShortfallHours: 4.0}
	if e.Error() == "" {
		t.Errorf("Error()=empty")
	}
}

func TestHandler_Create_MalformedJSON_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f))

	req := httptest.NewRequest(http.MethodPost, "/api/hr/leave-requests", bytes.NewBufferString("{not json"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(w.Body.Bytes(), &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.InvalidRequest {
		t.Fatalf("errorCode=%v", env.Details)
	}
}

func TestHandler_Reject_MalformedJSON_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	eng := engineFor(managerID, permission.RoleTeamLead, newSvc(f))

	req := httptest.NewRequest(http.MethodPost, "/api/hr/leave-requests/999/reject", bytes.NewBufferString("{not"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestHandler_Get_Own_200(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	startAt, _ := time.Parse(time.RFC3339, "2026-06-01T09:00:00+09:00")
	endAt, _ := time.Parse(time.RFC3339, "2026-06-01T18:00:00+09:00")
	f.requests[300] = dbq.LeaveRequest{
		ID: 300, TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: pgtype.Timestamptz{Time: startAt, Valid: true},
		EndAt:   pgtype.Timestamptz{Time: endAt, Valid: true},
		Hours:   numericFromFloat(8),
		Status:  dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f))

	req := httptest.NewRequest(http.MethodGet, "/api/hr/leave-requests/300", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestHandler_Get_OtherUser_403(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	startAt, _ := time.Parse(time.RFC3339, "2026-06-01T09:00:00+09:00")
	endAt, _ := time.Parse(time.RFC3339, "2026-06-01T18:00:00+09:00")
	f.requests[301] = dbq.LeaveRequest{
		ID: 301, TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: pgtype.Timestamptz{Time: startAt, Valid: true},
		EndAt:   pgtype.Timestamptz{Time: endAt, Valid: true},
		Hours:   numericFromFloat(8),
		Status:  dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(otherUserID, permission.RoleGeneral, newSvc(f))

	req := httptest.NewRequest(http.MethodGet, "/api/hr/leave-requests/301", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestHandler_Get_NotFound_404(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f))

	req := httptest.NewRequest(http.MethodGet, "/api/hr/leave-requests/9999", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestHandler_Get_InvalidID_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f))

	req := httptest.NewRequest(http.MethodGet, "/api/hr/leave-requests/abc", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestHandler_MyList_OK_200(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	startAt, _ := time.Parse(time.RFC3339, "2026-06-01T09:00:00+09:00")
	endAt, _ := time.Parse(time.RFC3339, "2026-06-01T18:00:00+09:00")
	f.requests[310] = dbq.LeaveRequest{
		ID: 310, TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: pgtype.Timestamptz{Time: startAt, Valid: true},
		EndAt:   pgtype.Timestamptz{Time: endAt, Valid: true},
		Hours:   numericFromFloat(8),
		Status:  dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/leave-requests/me/list", map[string]any{
		"page": 1, "size": 50,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[[]leaveRequestData]
	_ = json.Unmarshal(raw, &env)
	if !env.Success || env.Data == nil || len(*env.Data) != 1 {
		t.Fatalf("env=%+v body=%s", env, raw)
	}
}

func TestHandler_PendingList_OK_200(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	startAt, _ := time.Parse(time.RFC3339, "2026-06-01T09:00:00+09:00")
	endAt, _ := time.Parse(time.RFC3339, "2026-06-01T18:00:00+09:00")
	f.requests[320] = dbq.LeaveRequest{
		ID: 320, TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: pgtype.Timestamptz{Time: startAt, Valid: true},
		EndAt:   pgtype.Timestamptz{Time: endAt, Valid: true},
		Hours:   numericFromFloat(8),
		Status:  dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(managerID, permission.RoleTeamLead, newSvc(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/leave-requests/pending/list", map[string]any{})
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
}

func TestHandler_Reject_Success_200(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	startAt, _ := time.Parse(time.RFC3339, "2026-06-01T09:00:00+09:00")
	endAt, _ := time.Parse(time.RFC3339, "2026-06-01T18:00:00+09:00")
	f.requests[330] = dbq.LeaveRequest{
		ID: 330, TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: pgtype.Timestamptz{Time: startAt, Valid: true},
		EndAt:   pgtype.Timestamptz{Time: endAt, Valid: true},
		Hours:   numericFromFloat(8),
		Status:  dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(managerID, permission.RoleTeamLead, newSvc(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/leave-requests/330/reject", map[string]any{
		"comment": "사유 미흡",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[leaveRequestData]
	_ = json.Unmarshal(raw, &env)
	if env.Data == nil || env.Data.Status != string(dbq.LeaveRequestStatusRejected) {
		t.Fatalf("status=%s want rejected", env.Data.Status)
	}
}

func TestHandler_Cancel_Owner_Success_200(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	startAt, _ := time.Parse(time.RFC3339, "2026-06-01T09:00:00+09:00")
	endAt, _ := time.Parse(time.RFC3339, "2026-06-01T18:00:00+09:00")
	f.requests[340] = dbq.LeaveRequest{
		ID: 340, TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: pgtype.Timestamptz{Time: startAt, Valid: true},
		EndAt:   pgtype.Timestamptz{Time: endAt, Valid: true},
		Hours:   numericFromFloat(8),
		Status:  dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/leave-requests/340/cancel", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
}

func TestHandler_Cancel_AlreadyApproved_409(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	startAt, _ := time.Parse(time.RFC3339, "2026-06-01T09:00:00+09:00")
	endAt, _ := time.Parse(time.RFC3339, "2026-06-01T18:00:00+09:00")
	f.requests[341] = dbq.LeaveRequest{
		ID: 341, TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: pgtype.Timestamptz{Time: startAt, Valid: true},
		EndAt:   pgtype.Timestamptz{Time: endAt, Valid: true},
		Hours:   numericFromFloat(8),
		Status:  dbq.LeaveRequestStatusApproved,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/leave-requests/341/cancel", nil)
	if w.Code != http.StatusConflict {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.ApprovalInvalidState {
		t.Fatalf("errorCode=%v", env.Details)
	}
}

func TestHandler_Cancel_NotOwner_403(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f, 120)
	startAt, _ := time.Parse(time.RFC3339, "2026-06-01T09:00:00+09:00")
	endAt, _ := time.Parse(time.RFC3339, "2026-06-01T18:00:00+09:00")
	f.requests[204] = dbq.LeaveRequest{
		ID: 204, TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
		StartAt: pgtype.Timestamptz{Time: startAt, Valid: true},
		EndAt:   pgtype.Timestamptz{Time: endAt, Valid: true},
		Hours:   numericFromFloat(8),
		Status:  dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(otherUserID, permission.RoleGeneral, newSvc(f))

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/leave-requests/204/cancel", nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
}
