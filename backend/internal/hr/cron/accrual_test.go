package cron_test

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/cron"
	"github.com/sjseo/docflow/backend/internal/hr/leave"
)

// fakeAccrualStore — AccrualStore 메모리 구현.
type fakeAccrualStore struct {
	users      []dbq.User
	leaveTypes []dbq.LeaveType
	// balances key: user_id|leave_type_id|period_year
	balances map[string]dbq.LeaveBalance
	upserts  atomic.Int64
}

func newFakeAccrualStore() *fakeAccrualStore {
	return &fakeAccrualStore{balances: map[string]dbq.LeaveBalance{}}
}

func balanceKey(uid, ltid int64, year int32) string {
	return string(rune(uid)) + "|" + string(rune(ltid)) + "|" + string(rune(year))
}

func (f *fakeAccrualStore) ListActiveUsersForAccrual(_ context.Context, tenantID int64) ([]dbq.User, error) {
	out := make([]dbq.User, 0, len(f.users))
	for _, u := range f.users {
		if u.TenantID == tenantID && u.Status == dbq.UserStatusActive && !u.DeletedAt.Valid {
			out = append(out, u)
		}
	}
	return out, nil
}

func (f *fakeAccrualStore) ListActiveLeaveTypes(_ context.Context, tenantID int64) ([]dbq.LeaveType, error) {
	out := make([]dbq.LeaveType, 0, len(f.leaveTypes))
	for _, lt := range f.leaveTypes {
		if lt.TenantID == tenantID && lt.IsActive && !lt.DeletedAt.Valid {
			out = append(out, lt)
		}
	}
	return out, nil
}

func (f *fakeAccrualStore) GetLeaveBalanceForUserTypeYear(_ context.Context, arg dbq.GetLeaveBalanceForUserTypeYearParams) (dbq.LeaveBalance, error) {
	b, ok := f.balances[balanceKey(arg.UserID, arg.LeaveTypeID, arg.PeriodYear)]
	if !ok {
		return dbq.LeaveBalance{}, pgx.ErrNoRows
	}
	return b, nil
}

func (f *fakeAccrualStore) UpsertLeaveBalanceGrant(_ context.Context, arg dbq.UpsertLeaveBalanceGrantParams) (dbq.LeaveBalance, error) {
	f.upserts.Add(1)
	k := balanceKey(arg.UserID, arg.LeaveTypeID, arg.PeriodYear)
	existing, ok := f.balances[k]
	if !ok {
		existing = dbq.LeaveBalance{
			ID:          int64(len(f.balances)) + 1,
			TenantID:    arg.TenantID,
			UserID:      arg.UserID,
			LeaveTypeID: arg.LeaveTypeID,
			PeriodYear:  arg.PeriodYear,
			CreatedAt:   pgtype.Timestamptz{Time: time.Now(), Valid: true},
		}
	}
	existing.GrantedHours = arg.GrantedHours
	existing.ExpiresAt = arg.ExpiresAt
	existing.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	f.balances[k] = existing
	return existing, nil
}

// helper: build leave_type with policy.
func makeLeaveType(t *testing.T, id int64, code string, pol leave.AccrualPolicy) dbq.LeaveType {
	t.Helper()
	raw, err := leave.MarshalAccrualPolicy(pol)
	if err != nil {
		t.Fatal(err)
	}
	return dbq.LeaveType{
		ID: id, TenantID: 1, Code: code, Name: code,
		AccrualPolicy: raw, IsActive: true, IsPaid: true,
	}
}

func makeUser(id int64, hireDate time.Time) dbq.User {
	return dbq.User{
		ID: id, TenantID: 1, Email: "u@x",
		Status: dbq.UserStatusActive,
		HireDate: pgtype.Date{Time: hireDate, Valid: true},
	}
}

func mustDate(t *testing.T, s string) time.Time {
	t.Helper()
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

// 입사 1년 미만 + day==1 → 1일=8h 적립 (monthly_annual leave_type).
func TestAccrualJob_Monthly_FirstOfMonth_Grants8h(t *testing.T) {
	store := newFakeAccrualStore()
	store.users = []dbq.User{makeUser(10, mustDate(t, "2026-01-15"))}
	store.leaveTypes = []dbq.LeaveType{
		makeLeaveType(t, 1, "monthly_annual",
			leave.AccrualPolicy{Type: leave.PolicyTypeMonthlyLtOneYear, BaseDays: 1}),
	}

	now := mustDate(t, "2026-03-01") // 1개월 경과 + 첫 일.
	job := cron.NewAccrualJob(cron.AccrualJobConfig{
		Store: store, TenantID: 1,
		Clock: func() time.Time { return now },
	})

	res, err := job.Run(context.Background())
	if err != nil {
		t.Fatalf("Run err=%v", err)
	}
	if res.GrantsApplied != 1 {
		t.Fatalf("grants=%d, want 1", res.GrantsApplied)
	}
	if store.upserts.Load() != 1 {
		t.Fatalf("upserts=%d", store.upserts.Load())
	}
	b := store.balances[balanceKey(10, 1, 2026)]
	if v := numericToFloat(b.GrantedHours); v != 8 {
		t.Fatalf("granted=%v, want 8", v)
	}
}

// 1년 이상 + anniversary → 15일=120h 적립.
func TestAccrualJob_Annual_Anniversary_Grants15d(t *testing.T) {
	store := newFakeAccrualStore()
	store.users = []dbq.User{makeUser(10, mustDate(t, "2024-01-15"))}
	store.leaveTypes = []dbq.LeaveType{
		makeLeaveType(t, 2, "annual",
			leave.AccrualPolicy{
				Type: leave.PolicyTypeAnnualHireAnniversary, BaseDays: 15,
				TenureBonusPer2Y: 1, TenureCapDays: 25,
			}),
	}

	now := mustDate(t, "2026-01-15") // 2주년 anniversary.
	job := cron.NewAccrualJob(cron.AccrualJobConfig{
		Store: store, TenantID: 1,
		Clock: func() time.Time { return now },
	})

	res, err := job.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if res.GrantsApplied != 1 {
		t.Fatalf("grants=%d", res.GrantsApplied)
	}
	b := store.balances[balanceKey(10, 2, 2026)]
	if v := numericToFloat(b.GrantedHours); v != 15*8 {
		t.Fatalf("granted=%v, want 120", v)
	}
}

// dryRun=true → upsert 호출 안 됨.
func TestAccrualJob_DryRun_NoWrite(t *testing.T) {
	store := newFakeAccrualStore()
	store.users = []dbq.User{makeUser(10, mustDate(t, "2024-01-15"))}
	store.leaveTypes = []dbq.LeaveType{
		makeLeaveType(t, 2, "annual",
			leave.AccrualPolicy{
				Type: leave.PolicyTypeAnnualHireAnniversary, BaseDays: 15,
				TenureBonusPer2Y: 1, TenureCapDays: 25,
			}),
	}
	now := mustDate(t, "2026-01-15")
	job := cron.NewAccrualJob(cron.AccrualJobConfig{
		Store: store, TenantID: 1, DryRun: true,
		Clock: func() time.Time { return now },
	})
	res, err := job.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !res.Dryrun {
		t.Fatal("dry_run flag not propagated")
	}
	if store.upserts.Load() != 0 {
		t.Fatalf("upserts=%d, want 0 in dry-run", store.upserts.Load())
	}
	if res.GrantsApplied != 1 {
		t.Fatalf("grants=%d, want 1 (dry-run still counts)", res.GrantsApplied)
	}
}

// 같은 (user, type, year) 가 이미 동일 값으로 grant 됐으면 두 번째 실행은 skip.
func TestAccrualJob_Idempotent(t *testing.T) {
	store := newFakeAccrualStore()
	store.users = []dbq.User{makeUser(10, mustDate(t, "2024-01-15"))}
	store.leaveTypes = []dbq.LeaveType{
		makeLeaveType(t, 2, "annual",
			leave.AccrualPolicy{
				Type: leave.PolicyTypeAnnualHireAnniversary, BaseDays: 15,
				TenureBonusPer2Y: 1, TenureCapDays: 25,
			}),
	}
	now := mustDate(t, "2026-01-15")
	job := cron.NewAccrualJob(cron.AccrualJobConfig{
		Store: store, TenantID: 1,
		Clock: func() time.Time { return now },
	})
	if _, err := job.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	first := store.upserts.Load()
	if first != 1 {
		t.Fatalf("first upserts=%d", first)
	}
	// 두 번째 실행 — 같은 값이라 skip.
	res, err := job.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if store.upserts.Load() != first {
		t.Fatalf("second run wrote: upserts=%d", store.upserts.Load())
	}
	if res.GrantsSkipped != 1 {
		t.Fatalf("skipped=%d, want 1", res.GrantsSkipped)
	}
}

// anniversary 가 아니면 적립 없음.
func TestAccrualJob_NotAnniversary_NoGrant(t *testing.T) {
	store := newFakeAccrualStore()
	store.users = []dbq.User{makeUser(10, mustDate(t, "2024-01-15"))}
	store.leaveTypes = []dbq.LeaveType{
		makeLeaveType(t, 2, "annual",
			leave.AccrualPolicy{
				Type: leave.PolicyTypeAnnualHireAnniversary, BaseDays: 15,
				TenureBonusPer2Y: 1, TenureCapDays: 25,
			}),
	}
	now := mustDate(t, "2026-05-25")
	job := cron.NewAccrualJob(cron.AccrualJobConfig{
		Store: store, TenantID: 1,
		Clock: func() time.Time { return now },
	})
	res, err := job.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if res.GrantsApplied != 0 || store.upserts.Load() != 0 {
		t.Fatalf("unexpected grants=%d upserts=%d", res.GrantsApplied, store.upserts.Load())
	}
}

// 다수 사용자 + 다수 정책 혼합 시나리오: 1년 이상 → annual, 1년 미만 → monthly.
func TestAccrualJob_MixedUsers(t *testing.T) {
	store := newFakeAccrualStore()
	store.users = []dbq.User{
		makeUser(10, mustDate(t, "2024-01-15")), // 1년 이상
		makeUser(11, mustDate(t, "2026-01-15")), // 1년 미만
	}
	store.leaveTypes = []dbq.LeaveType{
		makeLeaveType(t, 1, "monthly_annual",
			leave.AccrualPolicy{Type: leave.PolicyTypeMonthlyLtOneYear, BaseDays: 1}),
		makeLeaveType(t, 2, "annual",
			leave.AccrualPolicy{
				Type: leave.PolicyTypeAnnualHireAnniversary, BaseDays: 15,
				TenureBonusPer2Y: 1, TenureCapDays: 25,
			}),
		makeLeaveType(t, 3, "half_day",
			leave.AccrualPolicy{Type: leave.PolicyTypeFixed}),
	}
	now := mustDate(t, "2026-01-15") // user10 anniversary; user11 같은 날 입사 (1년 미만, day≠1).
	// user11 은 day=15 이므로 monthly 적립 X.
	job := cron.NewAccrualJob(cron.AccrualJobConfig{
		Store: store, TenantID: 1,
		Clock: func() time.Time { return now },
	})
	res, err := job.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if res.GrantsApplied != 1 {
		t.Fatalf("grants=%d, want 1 (only user10 anniversary)", res.GrantsApplied)
	}
}

// terminated / deleted 사용자는 제외.
func TestAccrualJob_FiltersInactiveUsers(t *testing.T) {
	store := newFakeAccrualStore()
	store.users = []dbq.User{
		{ID: 10, TenantID: 1, Status: dbq.UserStatusTerminated,
			HireDate: pgtype.Date{Time: mustDate(t, "2024-01-15"), Valid: true}},
	}
	store.leaveTypes = []dbq.LeaveType{
		makeLeaveType(t, 2, "annual",
			leave.AccrualPolicy{
				Type: leave.PolicyTypeAnnualHireAnniversary, BaseDays: 15,
				TenureBonusPer2Y: 1, TenureCapDays: 25,
			}),
	}
	now := mustDate(t, "2026-01-15")
	job := cron.NewAccrualJob(cron.AccrualJobConfig{
		Store: store, TenantID: 1,
		Clock: func() time.Time { return now },
	})
	res, _ := job.Run(context.Background())
	if res.UsersScanned != 0 {
		t.Fatalf("terminated user not filtered: scanned=%d", res.UsersScanned)
	}
}

// helper for tests.
func numericToFloat(n pgtype.Numeric) float64 {
	if !n.Valid {
		return 0
	}
	f, err := n.Float64Value()
	if err != nil || !f.Valid {
		return 0
	}
	return f.Float64
}
