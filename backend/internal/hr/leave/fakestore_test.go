package leave_test

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// fakeLeaveStore — LeaveTypeStore + LeaveBalanceStore 통합 메모리 구현.
type fakeLeaveStore struct {
	leaveTypes  map[int64]dbq.LeaveType
	balances    map[int64]dbq.LeaveBalance
	adjustments []dbq.LeaveBalanceAdjustment
	users       map[int64]dbq.User
	nextLT      int64
	nextBal     int64
	nextAdj     int64
}

func newFakeLeaveStore() *fakeLeaveStore {
	return &fakeLeaveStore{
		leaveTypes: map[int64]dbq.LeaveType{},
		balances:   map[int64]dbq.LeaveBalance{},
		users:      map[int64]dbq.User{},
	}
}

func (f *fakeLeaveStore) seedLeaveType(lt dbq.LeaveType) dbq.LeaveType {
	if lt.ID == 0 {
		f.nextLT++
		lt.ID = f.nextLT
	}
	if lt.TenantID == 0 {
		lt.TenantID = 1
	}
	if lt.AccrualPolicy == nil {
		lt.AccrualPolicy = []byte(`{"type":"fixed"}`)
	}
	if !lt.CreatedAt.Valid {
		lt.CreatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	}
	if !lt.UpdatedAt.Valid {
		lt.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	}
	f.leaveTypes[lt.ID] = lt
	if lt.ID > f.nextLT {
		f.nextLT = lt.ID
	}
	return lt
}

func (f *fakeLeaveStore) seedUser(u dbq.User) dbq.User {
	if u.TenantID == 0 {
		u.TenantID = 1
	}
	if u.Status == "" {
		u.Status = dbq.UserStatusActive
	}
	f.users[u.ID] = u
	return u
}

// ---- LeaveTypeStore ----

func (f *fakeLeaveStore) GetLeaveTypeByID(_ context.Context, arg dbq.GetLeaveTypeByIDParams) (dbq.LeaveType, error) {
	lt, ok := f.leaveTypes[arg.ID]
	if !ok || lt.TenantID != arg.TenantID || lt.DeletedAt.Valid {
		return dbq.LeaveType{}, pgx.ErrNoRows
	}
	return lt, nil
}

func (f *fakeLeaveStore) GetLeaveTypeByCode(_ context.Context, arg dbq.GetLeaveTypeByCodeParams) (dbq.LeaveType, error) {
	for _, lt := range f.leaveTypes {
		if lt.Code == arg.Code && lt.TenantID == arg.TenantID && !lt.DeletedAt.Valid {
			return lt, nil
		}
	}
	return dbq.LeaveType{}, pgx.ErrNoRows
}

func (f *fakeLeaveStore) ListLeaveTypes(_ context.Context, arg dbq.ListLeaveTypesParams) ([]dbq.LeaveType, error) {
	out := []dbq.LeaveType{}
	for _, lt := range f.leaveTypes {
		if lt.TenantID == arg.TenantID && !lt.DeletedAt.Valid {
			out = append(out, lt)
		}
	}
	return out, nil
}

func (f *fakeLeaveStore) CountLeaveTypes(_ context.Context, tenantID int64) (int64, error) {
	var n int64
	for _, lt := range f.leaveTypes {
		if lt.TenantID == tenantID && !lt.DeletedAt.Valid {
			n++
		}
	}
	return n, nil
}

func (f *fakeLeaveStore) CreateLeaveType(_ context.Context, arg dbq.CreateLeaveTypeParams) (dbq.LeaveType, error) {
	f.nextLT++
	lt := dbq.LeaveType{
		ID: f.nextLT, TenantID: arg.TenantID, Code: arg.Code, Name: arg.Name,
		DefaultHours: arg.DefaultHours, AccrualPolicy: arg.AccrualPolicy,
		IsPaid: arg.IsPaid, IsActive: arg.IsActive,
		CreatedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
		UpdatedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}
	f.leaveTypes[lt.ID] = lt
	return lt, nil
}

func (f *fakeLeaveStore) UpdateLeaveType(_ context.Context, arg dbq.UpdateLeaveTypeParams) (dbq.LeaveType, error) {
	lt, ok := f.leaveTypes[arg.ID]
	if !ok || lt.TenantID != arg.TenantID || lt.DeletedAt.Valid {
		return dbq.LeaveType{}, pgx.ErrNoRows
	}
	if arg.Name.Valid {
		lt.Name = arg.Name.String
	}
	if arg.DefaultHours.Valid {
		lt.DefaultHours = arg.DefaultHours
	}
	if arg.AccrualPolicy != nil {
		lt.AccrualPolicy = arg.AccrualPolicy
	}
	if arg.IsPaid.Valid {
		lt.IsPaid = arg.IsPaid.Bool
	}
	if arg.IsActive.Valid {
		lt.IsActive = arg.IsActive.Bool
	}
	lt.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	f.leaveTypes[lt.ID] = lt
	return lt, nil
}

func (f *fakeLeaveStore) SoftDeleteLeaveType(_ context.Context, arg dbq.SoftDeleteLeaveTypeParams) error {
	lt, ok := f.leaveTypes[arg.ID]
	if !ok || lt.TenantID != arg.TenantID || lt.DeletedAt.Valid {
		return nil
	}
	lt.DeletedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	f.leaveTypes[lt.ID] = lt
	return nil
}

// ---- LeaveBalanceStore (subset) ----

func (f *fakeLeaveStore) GetLeaveBalanceByID(_ context.Context, arg dbq.GetLeaveBalanceByIDParams) (dbq.LeaveBalance, error) {
	b, ok := f.balances[arg.ID]
	if !ok || b.TenantID != arg.TenantID {
		return dbq.LeaveBalance{}, pgx.ErrNoRows
	}
	return b, nil
}

func (f *fakeLeaveStore) GetLeaveBalanceForUserTypeYear(_ context.Context, arg dbq.GetLeaveBalanceForUserTypeYearParams) (dbq.LeaveBalance, error) {
	for _, b := range f.balances {
		if b.UserID == arg.UserID && b.LeaveTypeID == arg.LeaveTypeID &&
			b.PeriodYear == arg.PeriodYear && b.TenantID == arg.TenantID {
			return b, nil
		}
	}
	return dbq.LeaveBalance{}, pgx.ErrNoRows
}

func (f *fakeLeaveStore) ListLeaveBalancesByUser(_ context.Context, arg dbq.ListLeaveBalancesByUserParams) ([]dbq.LeaveBalance, error) {
	out := []dbq.LeaveBalance{}
	for _, b := range f.balances {
		if b.UserID == arg.UserID && b.TenantID == arg.TenantID {
			out = append(out, b)
		}
	}
	return out, nil
}

func (f *fakeLeaveStore) UpsertLeaveBalanceGrant(_ context.Context, arg dbq.UpsertLeaveBalanceGrantParams) (dbq.LeaveBalance, error) {
	// find existing
	for id, b := range f.balances {
		if b.UserID == arg.UserID && b.LeaveTypeID == arg.LeaveTypeID && b.PeriodYear == arg.PeriodYear {
			b.GrantedHours = arg.GrantedHours
			b.ExpiresAt = arg.ExpiresAt
			b.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
			f.balances[id] = b
			return b, nil
		}
	}
	f.nextBal++
	b := dbq.LeaveBalance{
		ID: f.nextBal, TenantID: arg.TenantID, UserID: arg.UserID,
		LeaveTypeID: arg.LeaveTypeID, PeriodYear: arg.PeriodYear,
		GrantedHours: arg.GrantedHours, ExpiresAt: arg.ExpiresAt,
		CreatedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
		UpdatedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}
	f.balances[b.ID] = b
	return b, nil
}

func (f *fakeLeaveStore) AdjustLeaveBalanceHours(_ context.Context, arg dbq.AdjustLeaveBalanceHoursParams) (dbq.LeaveBalance, error) {
	b, ok := f.balances[arg.ID]
	if !ok || b.TenantID != arg.TenantID {
		return dbq.LeaveBalance{}, pgx.ErrNoRows
	}
	cur := numericFloat(b.GrantedHours)
	delta := numericFloat(arg.DeltaHours)
	b.GrantedHours = numericFromFloatTest(cur + delta)
	b.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	f.balances[b.ID] = b
	return b, nil
}

func (f *fakeLeaveStore) CreateLeaveBalanceAdjustment(_ context.Context, arg dbq.CreateLeaveBalanceAdjustmentParams) (dbq.LeaveBalanceAdjustment, error) {
	f.nextAdj++
	adj := dbq.LeaveBalanceAdjustment{
		ID: f.nextAdj, TenantID: arg.TenantID, BalanceID: arg.BalanceID,
		ActorUserID: arg.ActorUserID, DeltaHours: arg.DeltaHours, Reason: arg.Reason,
		CreatedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}
	f.adjustments = append(f.adjustments, adj)
	return adj, nil
}

func (f *fakeLeaveStore) GetUserByID(_ context.Context, arg dbq.GetUserByIDParams) (dbq.User, error) {
	u, ok := f.users[arg.ID]
	if !ok || u.TenantID != arg.TenantID || u.DeletedAt.Valid {
		return dbq.User{}, pgx.ErrNoRows
	}
	return u, nil
}
