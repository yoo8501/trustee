package leave_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// adjust 가 기존 balance 가 있을 때 ID 정확히 잡고 audit 1건 작성.
func TestLeaveBalanceHandler_Adjust_OnExistingBalance(t *testing.T) {
	store := newFakeLeaveStore()
	store.seedUser(dbq.User{ID: 5})
	lt := store.seedLeaveType(dbq.LeaveType{Code: "annual", Name: "연차", IsActive: true,
		DefaultHours: numericFromFloatTest(8.0), AccrualPolicy: []byte(`{"type":"fixed"}`),
	})
	// 기존 balance 200h.
	_, _ = store.UpsertLeaveBalanceGrant(nil, dbq.UpsertLeaveBalanceGrantParams{
		TenantID: 1, UserID: 5, LeaveTypeID: lt.ID, PeriodYear: 2026,
		GrantedHours: numericFromFloatTest(200),
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().AddDate(1, 0, 0), Valid: true},
	})
	eng := newLeaveBalanceEng(store, 1, permission.RoleHRManager)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/hr/leave-balances/5/adjust", map[string]any{
		"leaveTypeId": lt.ID, "periodYear": 2026, "deltaHours": -40, "reason": "사용분 정산",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	if len(store.adjustments) != 1 {
		t.Fatalf("audit rows=%d", len(store.adjustments))
	}
	// 응답 balance 의 grantedHours==160 검증.
	var env apiresult.Envelope[adjustResponseAPI]
	_ = json.Unmarshal(raw, &env)
	if env.Data == nil {
		t.Fatal("nil data")
	}
	if env.Data.Balance.GrantedHours != 160 {
		t.Fatalf("granted=%v want 160", env.Data.Balance.GrantedHours)
	}
}

type adjustResponseAPI struct {
	AdjustmentID int64      `json:"adjustmentId"`
	DeltaHours   float64    `json:"deltaHours"`
	Balance      balanceAPI `json:"balance"`
}

// Me 에서 expires_at 직렬화 검증.
func TestLeaveBalanceHandler_Me_ExpiresAtFormatted(t *testing.T) {
	store := newFakeLeaveStore()
	store.seedUser(dbq.User{ID: 5})
	lt := store.seedLeaveType(dbq.LeaveType{Code: "annual", Name: "연차", IsActive: true,
		DefaultHours: numericFromFloatTest(8.0), AccrualPolicy: []byte(`{"type":"fixed"}`),
	})
	exp := time.Date(2027, 1, 15, 9, 0, 0, 0, time.UTC)
	_, _ = store.UpsertLeaveBalanceGrant(nil, dbq.UpsertLeaveBalanceGrantParams{
		TenantID: 1, UserID: 5, LeaveTypeID: lt.ID, PeriodYear: 2026,
		GrantedHours: numericFromFloatTest(120),
		ExpiresAt: pgtype.Timestamptz{Time: exp, Valid: true},
	})
	eng := newLeaveBalanceEng(store, 5, permission.RoleGeneral)
	w, raw := doJSON(t, eng, http.MethodGet, "/api/hr/leave-balances/me", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", w.Code, raw)
	}
	type withExpires struct {
		balanceAPI
		ExpiresAt string `json:"expiresAt"`
	}
	var env apiresult.Envelope[[]withExpires]
	_ = json.Unmarshal(raw, &env)
	if env.Data == nil || len(*env.Data) != 1 {
		t.Fatalf("data=%+v", env.Data)
	}
	if (*env.Data)[0].ExpiresAt == "" {
		t.Fatalf("expiresAt empty")
	}
}

// KSTLocation 호출 — 단순 smoke.
func TestKSTLocation_Smoke(t *testing.T) {
	if leave.KSTLocation() == nil {
		t.Fatal("nil location")
	}
}
