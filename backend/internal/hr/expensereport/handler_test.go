package expensereport_test

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
	"github.com/sjseo/docflow/backend/internal/hr/expensereport"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// engineFor — actorID/role 을 인증 context 에 주입하는 미니 라우터.
func engineFor(actorID int64, role permission.Role, svc *expensereport.Service, attach *expensereport.AttachmentManager) *gin.Engine {
	gin.SetMode(gin.TestMode)
	eng := gin.New()
	eng.Use(func(c *gin.Context) {
		c.Set("auth:user_id", actorID)
		c.Set("auth:role", role)
		c.Set("auth:tenant_id", tenantID)
		c.Next()
	})
	h := expensereport.NewHandler(svc, attach)
	eng.POST("/api/hr/expense-reports", h.Create)
	eng.GET("/api/hr/expense-reports/:id", h.Get)
	eng.POST("/api/hr/expense-reports/me/list", h.MyList)
	eng.POST("/api/hr/expense-reports/pending/list", h.PendingList)
	eng.POST("/api/hr/expense-reports/:id/approve", h.Approve)
	eng.POST("/api/hr/expense-reports/:id/reject", h.Reject)
	eng.POST("/api/hr/expense-reports/:id/cancel", h.Cancel)
	eng.POST("/api/hr/expense-reports/:id/attachment", h.Upload)
	eng.GET("/api/hr/expense-reports/:id/attachment", h.Download)
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

type expenseData struct {
	ID            int64  `json:"id"`
	RequesterID   int64  `json:"requesterId"`
	AmountWon     int64  `json:"amountWon"`
	Vendor        string `json:"vendor"`
	Purpose       string `json:"purpose"`
	Status        string `json:"status"`
	ApproverID    int64  `json:"approverId,omitempty"`
	AttachmentURL string `json:"attachmentUrl,omitempty"`
}

func newSvc(f *fakeStore) *expensereport.Service {
	return expensereport.NewService(f, f, nil)
}

func TestHandler_Create_Success_201(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), nil)

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/expense-reports", map[string]any{
		"amountWon": 45000,
		"vendor":    "스타벅스",
		"purpose":   "거래처 미팅",
		"paidAt":    "2026-05-20",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[expenseData]
	_ = json.Unmarshal(raw, &env)
	if !env.Success || env.Data == nil {
		t.Fatalf("env=%+v body=%s", env, raw)
	}
	if env.Data.Status != string(dbq.LeaveRequestStatusPending) {
		t.Errorf("status=%s want pending", env.Data.Status)
	}
	if env.Data.ApproverID != managerID {
		t.Errorf("approverId=%d want %d", env.Data.ApproverID, managerID)
	}
}

func TestHandler_Create_Validation_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), nil)

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/expense-reports", map[string]any{
		"vendor": "v",
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

func TestHandler_Create_NegativeAmount_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), nil)

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/expense-reports", map[string]any{
		"amountWon": -100,
		"vendor":    "v",
		"purpose":   "p",
		"paidAt":    "2026-05-20",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
}

func TestHandler_Approve_Success_200(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	f.reports[200] = dbq.ExpenseReport{
		ID: 200, TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: pgDate(kstAt(t, "2026-05-20")),
		Status: dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(managerID, permission.RoleTeamLead, newSvc(f), nil)

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/expense-reports/200/approve", map[string]any{
		"comment": "ok",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[expenseData]
	_ = json.Unmarshal(raw, &env)
	if !env.Success || env.Data == nil || env.Data.Status != string(dbq.LeaveRequestStatusApproved) {
		t.Fatalf("env=%+v body=%s", env, raw)
	}
}

func TestHandler_Approve_AlreadyDecided_409(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	f.reports[201] = dbq.ExpenseReport{
		ID: 201, TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: pgDate(kstAt(t, "2026-05-20")),
		Status: dbq.LeaveRequestStatusApproved,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(managerID, permission.RoleTeamLead, newSvc(f), nil)

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/expense-reports/201/approve", map[string]any{})
	if w.Code != http.StatusConflict {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.ApprovalInvalidState {
		t.Fatalf("errorCode=%v body=%s", env.Details, raw)
	}
}

func TestHandler_Approve_OtherApprover_403(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	f.reports[202] = dbq.ExpenseReport{
		ID: 202, TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: pgDate(kstAt(t, "2026-05-20")),
		Status: dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(otherUserID, permission.RoleTeamLead, newSvc(f), nil)

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/expense-reports/202/approve", map[string]any{})
	if w.Code != http.StatusForbidden {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
}

func TestHandler_Reject_Success_200(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	f.reports[203] = dbq.ExpenseReport{
		ID: 203, TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: pgDate(kstAt(t, "2026-05-20")),
		Status: dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(managerID, permission.RoleTeamLead, newSvc(f), nil)

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/expense-reports/203/reject", map[string]any{
		"comment": "증빙 부족",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[expenseData]
	_ = json.Unmarshal(raw, &env)
	if env.Data == nil || env.Data.Status != string(dbq.LeaveRequestStatusRejected) {
		t.Fatalf("status=%v", env.Data)
	}
}

func TestHandler_Reject_CommentRequired_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	f.reports[204] = dbq.ExpenseReport{
		ID: 204, TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: pgDate(kstAt(t, "2026-05-20")),
		Status: dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(managerID, permission.RoleTeamLead, newSvc(f), nil)

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/expense-reports/204/reject", map[string]any{
		"comment": "",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.ValidationFailed {
		t.Fatalf("errorCode=%v", env.Details)
	}
}

func TestHandler_Cancel_Owner_Success_200(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	f.reports[205] = dbq.ExpenseReport{
		ID: 205, TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: pgDate(kstAt(t, "2026-05-20")),
		Status: dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), nil)

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/expense-reports/205/cancel", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
}

func TestHandler_Cancel_NotOwner_403(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	f.reports[206] = dbq.ExpenseReport{
		ID: 206, TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: pgDate(kstAt(t, "2026-05-20")),
		Status: dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(otherUserID, permission.RoleGeneral, newSvc(f), nil)

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/expense-reports/206/cancel", nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
}

func TestHandler_Get_Own_200(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	f.reports[300] = dbq.ExpenseReport{
		ID: 300, TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: pgDate(kstAt(t, "2026-05-20")),
		Status: dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), nil)

	req := httptest.NewRequest(http.MethodGet, "/api/hr/expense-reports/300", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestHandler_Get_NotFound_404(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), nil)

	req := httptest.NewRequest(http.MethodGet, "/api/hr/expense-reports/9999", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestHandler_MyList_OK_200(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	f.reports[310] = dbq.ExpenseReport{
		ID: 310, TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: pgDate(kstAt(t, "2026-05-20")),
		Status: dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), nil)

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/expense-reports/me/list", map[string]any{
		"page": 1, "size": 50,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[[]expenseData]
	_ = json.Unmarshal(raw, &env)
	if !env.Success || env.Data == nil || len(*env.Data) != 1 {
		t.Fatalf("env=%+v body=%s", env, raw)
	}
}

func TestHandler_PendingList_OK_200(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	f.reports[320] = dbq.ExpenseReport{
		ID: 320, TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: pgDate(kstAt(t, "2026-05-20")),
		Status: dbq.LeaveRequestStatusPending,
		ApproverID: pgtype.Int8{Int64: managerID, Valid: true},
	}
	eng := engineFor(managerID, permission.RoleTeamLead, newSvc(f), nil)

	w, raw := doJSON(eng, http.MethodPost, "/api/hr/expense-reports/pending/list", map[string]any{})
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, raw)
	}
}

func TestHandler_Create_MalformedJSON_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), nil)

	req := httptest.NewRequest(http.MethodPost, "/api/hr/expense-reports", bytes.NewBufferString("{not json"))
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
