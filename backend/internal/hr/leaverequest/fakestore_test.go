package leaverequest_test

import (
	"context"
	"math/big"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/hr/leaverequest"
)

// fakeStore — leaverequest.Store + TxStore 통합 in-memory 구현.
//
// 트랜잭션은 mutex 로 직렬화 + WithTx 콜백이 에러 반환 시 in-memory snapshot 으로 rollback.
type fakeStore struct {
	mu          sync.Mutex
	requests    map[int64]dbq.LeaveRequest
	balances    map[int64]dbq.LeaveBalance
	leaveTypes  map[int64]dbq.LeaveType
	users       map[int64]dbq.User
	teams       map[int64]dbq.Team
	delegations map[int64]dbq.Delegation
	nextReq     int64
	nextBal     int64

	// 통계 / 디버깅용.
	createCount int
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		requests:    map[int64]dbq.LeaveRequest{},
		balances:    map[int64]dbq.LeaveBalance{},
		leaveTypes:  map[int64]dbq.LeaveType{},
		users:       map[int64]dbq.User{},
		teams:       map[int64]dbq.Team{},
		delegations: map[int64]dbq.Delegation{},
	}
}

// ---- snapshot for tx rollback ----

func (f *fakeStore) snapshot() *fakeStore {
	dst := newFakeStore()
	for k, v := range f.requests {
		dst.requests[k] = v
	}
	for k, v := range f.balances {
		dst.balances[k] = v
	}
	for k, v := range f.leaveTypes {
		dst.leaveTypes[k] = v
	}
	for k, v := range f.users {
		dst.users[k] = v
	}
	for k, v := range f.teams {
		dst.teams[k] = v
	}
	for k, v := range f.delegations {
		dst.delegations[k] = v
	}
	dst.nextReq = f.nextReq
	dst.nextBal = f.nextBal
	dst.createCount = f.createCount
	return dst
}

func (f *fakeStore) restoreFrom(src *fakeStore) {
	f.requests = src.requests
	f.balances = src.balances
	f.leaveTypes = src.leaveTypes
	f.users = src.users
	f.teams = src.teams
	f.delegations = src.delegations
	f.nextReq = src.nextReq
	f.nextBal = src.nextBal
	f.createCount = src.createCount
}

// ---- TxManager ----

func (f *fakeStore) WithTx(ctx context.Context, fn func(leaverequest.TxStore) error) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	snap := f.snapshot()
	if err := fn(f); err != nil {
		f.restoreFrom(snap)
		return err
	}
	return nil
}

// ---- seeders ----

func (f *fakeStore) seedUser(u dbq.User) dbq.User {
	if u.TenantID == 0 {
		u.TenantID = 1
	}
	if u.Status == "" {
		u.Status = dbq.UserStatusActive
	}
	f.users[u.ID] = u
	return u
}

func (f *fakeStore) seedTeam(t dbq.Team) dbq.Team {
	if t.TenantID == 0 {
		t.TenantID = 1
	}
	f.teams[t.ID] = t
	return t
}

func (f *fakeStore) seedLeaveType(lt dbq.LeaveType) dbq.LeaveType {
	if lt.TenantID == 0 {
		lt.TenantID = 1
	}
	if lt.AccrualPolicy == nil {
		lt.AccrualPolicy = []byte(`{"type":"fixed"}`)
	}
	f.leaveTypes[lt.ID] = lt
	return lt
}

func (f *fakeStore) seedBalance(b dbq.LeaveBalance) dbq.LeaveBalance {
	if b.TenantID == 0 {
		b.TenantID = 1
	}
	if b.ID == 0 {
		f.nextBal++
		b.ID = f.nextBal
	}
	f.balances[b.ID] = b
	return b
}

// ---- Store impl: leave_requests ----

func (f *fakeStore) GetLeaveRequestByID(_ context.Context, arg dbq.GetLeaveRequestByIDParams) (dbq.LeaveRequest, error) {
	r, ok := f.requests[arg.ID]
	if !ok || r.TenantID != arg.TenantID {
		return dbq.LeaveRequest{}, pgx.ErrNoRows
	}
	return r, nil
}

func (f *fakeStore) GetLeaveRequestForUpdate(_ context.Context, arg dbq.GetLeaveRequestForUpdateParams) (dbq.LeaveRequest, error) {
	r, ok := f.requests[arg.ID]
	if !ok || r.TenantID != arg.TenantID {
		return dbq.LeaveRequest{}, pgx.ErrNoRows
	}
	return r, nil
}

func (f *fakeStore) CreateLeaveRequest(_ context.Context, arg dbq.CreateLeaveRequestParams) (dbq.LeaveRequest, error) {
	f.nextReq++
	r := dbq.LeaveRequest{
		ID:          f.nextReq,
		TenantID:    arg.TenantID,
		RequesterID: arg.RequesterID,
		LeaveTypeID: arg.LeaveTypeID,
		StartAt:     arg.StartAt,
		EndAt:       arg.EndAt,
		Hours:       arg.Hours,
		Reason:      arg.Reason,
		Status:      dbq.LeaveRequestStatusPending,
		ApproverID:  arg.ApproverID,
		CreatedAt:   pgtype.Timestamptz{Time: time.Now(), Valid: true},
		UpdatedAt:   pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}
	f.requests[r.ID] = r
	f.createCount++
	return r, nil
}

func (f *fakeStore) FindOverlappingLeaveRequests(_ context.Context, arg dbq.FindOverlappingLeaveRequestsParams) ([]dbq.LeaveRequest, error) {
	var out []dbq.LeaveRequest
	for _, r := range f.requests {
		if r.TenantID != arg.TenantID || r.RequesterID != arg.RequesterID {
			continue
		}
		if r.Status != dbq.LeaveRequestStatusPending && r.Status != dbq.LeaveRequestStatusApproved {
			continue
		}
		// start_at < $end AND end_at > $start
		if r.StartAt.Time.Before(arg.EndAt.Time) && r.EndAt.Time.After(arg.StartAt.Time) {
			out = append(out, r)
		}
	}
	return out, nil
}

func (f *fakeStore) UpdateLeaveRequestDecision(_ context.Context, arg dbq.UpdateLeaveRequestDecisionParams) (dbq.LeaveRequest, error) {
	r, ok := f.requests[arg.ID]
	if !ok || r.TenantID != arg.TenantID {
		return dbq.LeaveRequest{}, pgx.ErrNoRows
	}
	r.Status = arg.Status
	r.ApproverID = arg.ApproverID
	r.DecidedAt = arg.DecidedAt
	r.DecisionComment = arg.DecisionComment
	r.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	f.requests[r.ID] = r
	return r, nil
}

func (f *fakeStore) CancelLeaveRequest(_ context.Context, arg dbq.CancelLeaveRequestParams) (dbq.LeaveRequest, error) {
	r, ok := f.requests[arg.ID]
	if !ok || r.TenantID != arg.TenantID || r.RequesterID != arg.RequesterID || r.Status != dbq.LeaveRequestStatusPending {
		return dbq.LeaveRequest{}, pgx.ErrNoRows
	}
	r.Status = dbq.LeaveRequestStatusCancelled
	r.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	f.requests[r.ID] = r
	return r, nil
}

func (f *fakeStore) ListLeaveRequestsByRequester(_ context.Context, arg dbq.ListLeaveRequestsByRequesterParams) ([]dbq.LeaveRequest, error) {
	var out []dbq.LeaveRequest
	for _, r := range f.requests {
		if r.TenantID == arg.TenantID && r.RequesterID == arg.RequesterID {
			out = append(out, r)
		}
	}
	// simple pagination — apply offset/limit.
	start := int(arg.Offset)
	if start > len(out) {
		start = len(out)
	}
	end := start + int(arg.Limit)
	if end > len(out) {
		end = len(out)
	}
	return out[start:end], nil
}

func (f *fakeStore) CountLeaveRequestsByRequester(_ context.Context, arg dbq.CountLeaveRequestsByRequesterParams) (int64, error) {
	var n int64
	for _, r := range f.requests {
		if r.TenantID == arg.TenantID && r.RequesterID == arg.RequesterID {
			n++
		}
	}
	return n, nil
}

func (f *fakeStore) ListPendingLeaveRequestsByApprover(_ context.Context, arg dbq.ListPendingLeaveRequestsByApproverParams) ([]dbq.LeaveRequest, error) {
	var out []dbq.LeaveRequest
	for _, r := range f.requests {
		if r.TenantID != arg.TenantID || !r.ApproverID.Valid || r.ApproverID.Int64 != arg.ApproverID.Int64 {
			continue
		}
		if r.Status != dbq.LeaveRequestStatusPending {
			continue
		}
		out = append(out, r)
	}
	start := int(arg.Offset)
	if start > len(out) {
		start = len(out)
	}
	end := start + int(arg.Limit)
	if end > len(out) {
		end = len(out)
	}
	return out[start:end], nil
}

func (f *fakeStore) CountPendingLeaveRequestsByApprover(_ context.Context, arg dbq.CountPendingLeaveRequestsByApproverParams) (int64, error) {
	var n int64
	for _, r := range f.requests {
		if r.TenantID == arg.TenantID && r.ApproverID.Valid && r.ApproverID.Int64 == arg.ApproverID.Int64 && r.Status == dbq.LeaveRequestStatusPending {
			n++
		}
	}
	return n, nil
}

// ---- leave_balances ----

func (f *fakeStore) GetLeaveBalanceForUserTypeYear(_ context.Context, arg dbq.GetLeaveBalanceForUserTypeYearParams) (dbq.LeaveBalance, error) {
	for _, b := range f.balances {
		if b.UserID == arg.UserID && b.LeaveTypeID == arg.LeaveTypeID && b.PeriodYear == arg.PeriodYear && b.TenantID == arg.TenantID {
			return b, nil
		}
	}
	return dbq.LeaveBalance{}, pgx.ErrNoRows
}

func (f *fakeStore) IncrementLeaveBalanceUsed(_ context.Context, arg dbq.IncrementLeaveBalanceUsedParams) (dbq.LeaveBalance, error) {
	// upsert
	for id, b := range f.balances {
		if b.UserID == arg.UserID && b.LeaveTypeID == arg.LeaveTypeID && b.PeriodYear == arg.PeriodYear && b.TenantID == arg.TenantID {
			cur := numericFloat(b.UsedHours)
			delta := numericFloat(arg.UsedHours)
			b.UsedHours = numericFromFloat(cur + delta)
			b.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
			f.balances[id] = b
			return b, nil
		}
	}
	// insert new
	f.nextBal++
	b := dbq.LeaveBalance{
		ID:           f.nextBal,
		TenantID:     arg.TenantID,
		UserID:       arg.UserID,
		LeaveTypeID:  arg.LeaveTypeID,
		PeriodYear:   arg.PeriodYear,
		GrantedHours: numericFromFloat(0),
		UsedHours:    arg.UsedHours,
		CreatedAt:    pgtype.Timestamptz{Time: time.Now(), Valid: true},
		UpdatedAt:    pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}
	f.balances[b.ID] = b
	return b, nil
}

// ---- users / teams / leave_types ----

func (f *fakeStore) GetUserByID(_ context.Context, arg dbq.GetUserByIDParams) (dbq.User, error) {
	u, ok := f.users[arg.ID]
	if !ok || u.TenantID != arg.TenantID || u.DeletedAt.Valid {
		return dbq.User{}, pgx.ErrNoRows
	}
	return u, nil
}

func (f *fakeStore) GetTeamByID(_ context.Context, arg dbq.GetTeamByIDParams) (dbq.Team, error) {
	t, ok := f.teams[arg.ID]
	if !ok || t.TenantID != arg.TenantID || t.DeletedAt.Valid {
		return dbq.Team{}, pgx.ErrNoRows
	}
	return t, nil
}

func (f *fakeStore) GetLeaveTypeByID(_ context.Context, arg dbq.GetLeaveTypeByIDParams) (dbq.LeaveType, error) {
	lt, ok := f.leaveTypes[arg.ID]
	if !ok || lt.TenantID != arg.TenantID || lt.DeletedAt.Valid {
		return dbq.LeaveType{}, pgx.ErrNoRows
	}
	return lt, nil
}

// ---- numeric helpers ----

func numericFromFloat(v float64) pgtype.Numeric {
	scaled := int64(v*10 + 0.5)
	if v < 0 {
		scaled = int64(v*10 - 0.5)
	}
	return pgtype.Numeric{Int: big.NewInt(scaled), Exp: -1, Valid: true}
}

func numericFloat(n pgtype.Numeric) float64 {
	if !n.Valid || n.NaN {
		return 0
	}
	f, err := n.Float64Value()
	if err != nil || !f.Valid {
		return 0
	}
	return f.Float64
}

func pgTimestamptz(t time.Time) pgtype.Timestamptz {
	if t.IsZero() {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: t, Valid: true}
}
