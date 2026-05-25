package expensereport_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/expensereport"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// resolveBaseApprover 경로: manager 없을 때 team_lead 사용.
func TestService_Create_NoManager_UsesTeamLead(t *testing.T) {
	f := newFakeStore()
	f.seedUser(dbq.User{
		ID: requesterID, TenantID: tenantID,
		TeamID: pgtype.Int8{Int64: teamID, Valid: true},
		// ManagerID 미지정.
	})
	f.seedUser(dbq.User{ID: managerID, TenantID: tenantID})
	f.seedTeam(dbq.Team{ID: teamID, TenantID: tenantID, Name: "팀A",
		TeamLeadID: pgtype.Int8{Int64: managerID, Valid: true},
	})
	svc := newService(f)

	v, err := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})
	if err != nil {
		t.Fatalf("create err=%v", err)
	}
	if v.ApproverID != managerID {
		t.Errorf("approverId=%d want %d (team_lead)", v.ApproverID, managerID)
	}
}

// approver 가 결정 안 되면 ErrApproverUnassigned.
func TestService_Create_NoApprover_Unassigned(t *testing.T) {
	f := newFakeStore()
	// 본인이 manager/team_lead 둘 다 없음.
	f.seedUser(dbq.User{ID: requesterID, TenantID: tenantID})
	svc := newService(f)

	_, err := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: requesterID,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})
	if !errors.Is(err, expensereport.ErrApproverUnassigned) {
		t.Fatalf("err=%v want ErrApproverUnassigned", err)
	}
}

// requester 미존재.
func TestService_Create_RequesterNotFound(t *testing.T) {
	f := newFakeStore()
	svc := newService(f)

	_, err := svc.Create(context.Background(), expensereport.CreateInput{
		TenantID: tenantID, RequesterID: 9999,
		AmountWon: 1000, Vendor: "v", Purpose: "p",
		PaidAt: kstAt(t, "2026-05-20"),
	})
	if !errors.Is(err, expensereport.ErrRequesterNotFound) {
		t.Fatalf("err=%v want ErrRequesterNotFound", err)
	}
}

// Get notFound.
func TestService_Get_NotFound(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	svc := newService(f)

	_, err := svc.Get(context.Background(), 9999, requesterID, tenantID, false)
	if !errors.Is(err, expensereport.ErrExpenseReportNotFound) {
		t.Fatalf("err=%v want ErrExpenseReportNotFound", err)
	}
}

// Cancel notFound.
func TestService_Cancel_NotFound(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	svc := newService(f)

	_, err := svc.Cancel(context.Background(), 9999, requesterID, tenantID)
	if !errors.Is(err, expensereport.ErrExpenseReportNotFound) {
		t.Fatalf("err=%v want ErrExpenseReportNotFound", err)
	}
}

// Approve notFound.
func TestService_Approve_NotFound(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	svc := newService(f)

	_, err := svc.Approve(context.Background(), 9999, managerID, tenantID, "ok")
	if !errors.Is(err, expensereport.ErrExpenseReportNotFound) {
		t.Fatalf("err=%v want ErrExpenseReportNotFound", err)
	}
}

// Reject notFound.
func TestService_Reject_NotFound(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	svc := newService(f)

	_, err := svc.Reject(context.Background(), 9999, managerID, tenantID, "사유")
	if !errors.Is(err, expensereport.ErrExpenseReportNotFound) {
		t.Fatalf("err=%v want ErrExpenseReportNotFound", err)
	}
}

// UpdateAttachmentURL notFound.
func TestService_UpdateAttachmentURL_NotFound(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	svc := newService(f)

	_, err := svc.UpdateAttachmentURL(context.Background(), 9999, tenantID, "x")
	if !errors.Is(err, expensereport.ErrExpenseReportNotFound) {
		t.Fatalf("err=%v want ErrExpenseReportNotFound", err)
	}
}

// GetRaw notFound.
func TestService_GetRaw_NotFound(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	svc := newService(f)

	_, err := svc.GetRaw(context.Background(), 9999, tenantID)
	if !errors.Is(err, expensereport.ErrExpenseReportNotFound) {
		t.Fatalf("err=%v want ErrExpenseReportNotFound", err)
	}
}

// Handler Approve invalid id.
func TestHandler_Approve_InvalidID_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	eng := engineFor(managerID, permission.RoleTeamLead, newSvc(f), nil)

	req := httptest.NewRequest(http.MethodPost, "/api/hr/expense-reports/abc/approve", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

// Handler Reject invalid id.
func TestHandler_Reject_InvalidID_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	eng := engineFor(managerID, permission.RoleTeamLead, newSvc(f), nil)

	req := httptest.NewRequest(http.MethodPost, "/api/hr/expense-reports/abc/reject", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

// Handler Reject malformed json.
func TestHandler_Reject_MalformedJSON_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	eng := engineFor(managerID, permission.RoleTeamLead, newSvc(f), nil)

	req := httptest.NewRequest(http.MethodPost, "/api/hr/expense-reports/1/reject", nil)
	req.Body = http.NoBody
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

// Handler Cancel invalid id.
func TestHandler_Cancel_InvalidID_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), nil)

	req := httptest.NewRequest(http.MethodPost, "/api/hr/expense-reports/abc/cancel", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

// Handler Get invalid id.
func TestHandler_Get_InvalidID_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), nil)

	req := httptest.NewRequest(http.MethodGet, "/api/hr/expense-reports/abc", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

// Handler Upload nil attach manager.
func TestHandler_Upload_NoAttachManager_500(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), nil)

	req := httptest.NewRequest(http.MethodPost, "/api/hr/expense-reports/1/attachment", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

// Handler Download nil attach manager.
func TestHandler_Download_NoAttachManager_500(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), nil)

	req := httptest.NewRequest(http.MethodGet, "/api/hr/expense-reports/1/attachment", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

// Handler Upload invalid id.
func TestHandler_Upload_InvalidID_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	storage := newFakeStorage()
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), expensereport.NewAttachmentManager(storage))

	req := httptest.NewRequest(http.MethodPost, "/api/hr/expense-reports/abc/attachment", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

// Handler Download invalid id.
func TestHandler_Download_InvalidID_400(t *testing.T) {
	f := newFakeStore()
	seedBasicCase(f)
	storage := newFakeStorage()
	eng := engineFor(requesterID, permission.RoleGeneral, newSvc(f), expensereport.NewAttachmentManager(storage))

	req := httptest.NewRequest(http.MethodGet, "/api/hr/expense-reports/abc/attachment", nil)
	w := httptest.NewRecorder()
	eng.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}
