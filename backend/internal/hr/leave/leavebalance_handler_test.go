package leave_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

func newLeaveBalanceEng(store *fakeLeaveStore, actorID int64, role permission.Role) *gin.Engine {
	svc := leave.NewLeaveBalanceService(store)
	h := leave.NewLeaveBalanceHandler(svc)
	eng := gin.New()
	eng.GET("/api/hr/leave-balances/me", fakeAuth(actorID, 1, role), h.Me)
	eng.POST("/api/hr/leave-balances/:user_id/adjust", fakeAuth(actorID, 1, role), h.Adjust)
	return eng
}

type balanceAPI struct {
	ID             int64   `json:"id"`
	UserID         int64   `json:"userId"`
	LeaveTypeID    int64   `json:"leaveTypeId"`
	LeaveTypeCode  string  `json:"leaveTypeCode"`
	PeriodYear     int32   `json:"periodYear"`
	GrantedHours   float64 `json:"grantedHours"`
	UsedHours      float64 `json:"usedHours"`
	RemainingHours float64 `json:"remainingHours"`
}

func TestLeaveBalanceHandler_Me_Success(t *testing.T) {
	store := newFakeLeaveStore()
	store.seedUser(dbq.User{ID: 5})
	lt := store.seedLeaveType(dbq.LeaveType{Code: "annual", Name: "연차", IsActive: true,
		DefaultHours: numericFromFloatTest(8.0), AccrualPolicy: []byte(`{"type":"fixed"}`),
	})
	// seed a balance directly via upsert
	_, _ = store.UpsertLeaveBalanceGrant(nil, dbq.UpsertLeaveBalanceGrantParams{
		TenantID: 1, UserID: 5, LeaveTypeID: lt.ID, PeriodYear: 2026,
		GrantedHours: numericFromFloatTest(120),
	})
	eng := newLeaveBalanceEng(store, 5, permission.RoleGeneral)
	w, raw := doJSON(t, eng, http.MethodGet, "/api/hr/leave-balances/me", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[[]balanceAPI]
	_ = json.Unmarshal(raw, &env)
	if env.Data == nil || len(*env.Data) != 1 {
		t.Fatalf("data=%+v", env.Data)
	}
	got := (*env.Data)[0]
	if got.GrantedHours != 120 || got.LeaveTypeCode != "annual" {
		t.Fatalf("balance=%+v", got)
	}
}

func TestLeaveBalanceHandler_Adjust_Success_WritesAudit(t *testing.T) {
	store := newFakeLeaveStore()
	store.seedUser(dbq.User{ID: 5}) // target
	lt := store.seedLeaveType(dbq.LeaveType{Code: "annual", Name: "연차", IsActive: true,
		DefaultHours: numericFromFloatTest(8.0), AccrualPolicy: []byte(`{"type":"fixed"}`),
	})
	eng := newLeaveBalanceEng(store, 1, permission.RoleHRManager)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/leave-balances/5/adjust", map[string]any{
		"leaveTypeId": lt.ID, "deltaHours": 16, "reason": "수동 보정 — 2024 캐리오버",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	if len(store.adjustments) != 1 {
		t.Fatalf("audit log not written: %d rows", len(store.adjustments))
	}
	if store.adjustments[0].Reason == "" {
		t.Fatal("reason empty in audit log")
	}
	// 잔여가 0 → 16 으로 증가했어야 함.
	var totalGranted float64
	for _, b := range store.balances {
		totalGranted = numericFloat(b.GrantedHours)
	}
	if totalGranted != 16 {
		t.Fatalf("balance not adjusted: %v", totalGranted)
	}
}

func TestLeaveBalanceHandler_Adjust_MissingReason_ValidationFailed(t *testing.T) {
	store := newFakeLeaveStore()
	store.seedUser(dbq.User{ID: 5})
	lt := store.seedLeaveType(dbq.LeaveType{Code: "annual", Name: "연차", IsActive: true,
		DefaultHours: numericFromFloatTest(8.0), AccrualPolicy: []byte(`{"type":"fixed"}`),
	})
	eng := newLeaveBalanceEng(store, 1, permission.RoleHRManager)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/leave-balances/5/adjust", map[string]any{
		"leaveTypeId": lt.ID, "deltaHours": 8, "reason": "",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.ValidationFailed {
		t.Fatalf("env=%+v", env)
	}
	if len(store.adjustments) != 0 {
		t.Fatalf("audit log written despite validation failure: %d", len(store.adjustments))
	}
}

func TestLeaveBalanceHandler_Adjust_TargetUserNotFound(t *testing.T) {
	store := newFakeLeaveStore()
	lt := store.seedLeaveType(dbq.LeaveType{Code: "annual", Name: "연차", IsActive: true,
		DefaultHours: numericFromFloatTest(8.0), AccrualPolicy: []byte(`{"type":"fixed"}`),
	})
	eng := newLeaveBalanceEng(store, 1, permission.RoleHRManager)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/leave-balances/999/adjust", map[string]any{
		"leaveTypeId": lt.ID, "deltaHours": 8, "reason": "x",
	})
	if w.Code != http.StatusNotFound {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
}

func TestLeaveBalanceHandler_Adjust_LeaveTypeNotFound(t *testing.T) {
	store := newFakeLeaveStore()
	store.seedUser(dbq.User{ID: 5})
	eng := newLeaveBalanceEng(store, 1, permission.RoleHRManager)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/leave-balances/5/adjust", map[string]any{
		"leaveTypeId": 999, "deltaHours": 8, "reason": "x",
	})
	if w.Code != http.StatusNotFound {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
}

func TestLeaveBalanceHandler_Adjust_NegativeResult_Conflict(t *testing.T) {
	store := newFakeLeaveStore()
	store.seedUser(dbq.User{ID: 5})
	lt := store.seedLeaveType(dbq.LeaveType{Code: "annual", Name: "연차", IsActive: true,
		DefaultHours: numericFromFloatTest(8.0), AccrualPolicy: []byte(`{"type":"fixed"}`),
	})
	eng := newLeaveBalanceEng(store, 1, permission.RoleHRManager)
	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/leave-balances/5/adjust", map[string]any{
		"leaveTypeId": lt.ID, "deltaHours": -8, "reason": "차감",
	})
	if w.Code != http.StatusConflict {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.Conflict {
		t.Fatalf("env=%+v", env)
	}
}
