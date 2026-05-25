package leaverequest_test

import (
	"context"
	"testing"

	"github.com/sjseo/docflow/backend/internal/hr/leaverequest"
)

// 잔여 부족 시 shortfall_hours 가 정확히 계산되어야 한다.
func TestService_Create_InsufficientBalance_ShortfallCalculation(t *testing.T) {
	cases := []struct {
		name      string
		granted   float64
		used      float64
		requested float64
		want      float64
	}{
		{"0 / 0 → 8 부족", 0, 0, 8, 8},
		{"4 / 0 → 8 부족 (4)", 4, 0, 8, 4},
		{"16 / 12 → 8 부족 (4)", 16, 12, 8, 4},
		{"8 / 0 → 8.5 부족 (0.5)", 8, 0, 8.5, 0.5},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newFakeStore()
			seedBasicCase(f, tc.granted)
			if tc.used > 0 {
				// Update existing balance with used hours.
				for id, b := range f.balances {
					if b.UserID == requesterID && b.LeaveTypeID == leaveTypeID {
						b.UsedHours = numericFromFloat(tc.used)
						f.balances[id] = b
					}
				}
			}
			svc := newService(f)
			_, err := svc.Create(context.Background(), leaverequest.CreateInput{
				TenantID: tenantID, RequesterID: requesterID, LeaveTypeID: leaveTypeID,
				StartAt: kstAt(t, "2026-06-01 09:00"),
				EndAt:   kstAt(t, "2026-06-01 18:00"),
				Hours:   tc.requested,
			})
			ibe, ok := leaverequest.IsInsufficientBalance(err)
			if !ok {
				t.Fatalf("err=%v want InsufficientBalanceError", err)
			}
			if ibe.ShortfallHours != tc.want {
				t.Errorf("shortfall=%v want %v", ibe.ShortfallHours, tc.want)
			}
		})
	}
}
