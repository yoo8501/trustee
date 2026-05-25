package delegation_test

import (
	"context"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// fakeStore — in-memory delegation.Store 구현 (테스트 전용).
type fakeStore struct {
	mu          sync.Mutex
	delegations map[int64]dbq.Delegation
	users       map[int64]dbq.User
	nextID      int64
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		delegations: map[int64]dbq.Delegation{},
		users:       map[int64]dbq.User{},
	}
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

func (f *fakeStore) seedDelegation(d dbq.Delegation) dbq.Delegation {
	if d.TenantID == 0 {
		d.TenantID = 1
	}
	if d.ID == 0 {
		f.nextID++
		d.ID = f.nextID
	}
	f.delegations[d.ID] = d
	return d
}

// ---- Store impl ----

func (f *fakeStore) CreateDelegation(_ context.Context, arg dbq.CreateDelegationParams) (dbq.Delegation, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.nextID++
	d := dbq.Delegation{
		ID:          f.nextID,
		TenantID:    arg.TenantID,
		DelegatorID: arg.DelegatorID,
		DelegateID:  arg.DelegateID,
		ValidFrom:   arg.ValidFrom,
		ValidTo:     arg.ValidTo,
		Scope:       arg.Scope,
		CreatedAt:   pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}
	f.delegations[d.ID] = d
	return d, nil
}

func (f *fakeStore) GetDelegationByID(_ context.Context, arg dbq.GetDelegationByIDParams) (dbq.Delegation, error) {
	d, ok := f.delegations[arg.ID]
	if !ok || d.TenantID != arg.TenantID {
		return dbq.Delegation{}, pgx.ErrNoRows
	}
	return d, nil
}

func (f *fakeStore) DeleteDelegation(_ context.Context, arg dbq.DeleteDelegationParams) error {
	d, ok := f.delegations[arg.ID]
	if !ok || d.TenantID != arg.TenantID || d.DelegatorID != arg.DelegatorID {
		return pgx.ErrNoRows
	}
	delete(f.delegations, arg.ID)
	return nil
}

func (f *fakeStore) ListDelegationsByDelegator(_ context.Context, arg dbq.ListDelegationsByDelegatorParams) ([]dbq.Delegation, error) {
	var out []dbq.Delegation
	for _, d := range f.delegations {
		if d.TenantID == arg.TenantID && d.DelegatorID == arg.DelegatorID {
			out = append(out, d)
		}
	}
	return out, nil
}

func (f *fakeStore) ListActiveDelegationsByDelegator(_ context.Context, arg dbq.ListActiveDelegationsByDelegatorParams) ([]dbq.Delegation, error) {
	var out []dbq.Delegation
	at := arg.ValidFrom.Time
	for _, d := range f.delegations {
		if d.TenantID != arg.TenantID || d.DelegatorID != arg.DelegatorID {
			continue
		}
		// valid_from <= at <= valid_to.
		if d.ValidFrom.Valid && d.ValidFrom.Time.After(at) {
			continue
		}
		if d.ValidTo.Valid && d.ValidTo.Time.Before(at) {
			continue
		}
		out = append(out, d)
	}
	return out, nil
}

func (f *fakeStore) GetUserByID(_ context.Context, arg dbq.GetUserByIDParams) (dbq.User, error) {
	u, ok := f.users[arg.ID]
	if !ok || u.TenantID != arg.TenantID || u.DeletedAt.Valid {
		return dbq.User{}, pgx.ErrNoRows
	}
	return u, nil
}
