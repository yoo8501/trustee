package teams_test

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/teams"
)

type fakeStore struct {
	teams  map[int64]dbq.Team
	nextID int64
}

func newFakeStore() *fakeStore {
	return &fakeStore{teams: map[int64]dbq.Team{}}
}

func (f *fakeStore) seed(t dbq.Team) dbq.Team {
	if t.ID == 0 {
		f.nextID++
		t.ID = f.nextID
	}
	if t.TenantID == 0 {
		t.TenantID = 1
	}
	if !t.CreatedAt.Valid {
		t.CreatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	}
	if !t.UpdatedAt.Valid {
		t.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	}
	f.teams[t.ID] = t
	if t.ID > f.nextID {
		f.nextID = t.ID
	}
	return t
}

func (f *fakeStore) GetTeamByID(ctx context.Context, arg dbq.GetTeamByIDParams) (dbq.Team, error) {
	t, ok := f.teams[arg.ID]
	if !ok || t.TenantID != arg.TenantID || t.DeletedAt.Valid {
		return dbq.Team{}, pgx.ErrNoRows
	}
	return t, nil
}

func (f *fakeStore) ListTeams(ctx context.Context, arg dbq.ListTeamsParams) ([]dbq.Team, error) {
	var out []dbq.Team
	for _, t := range f.teams {
		if t.TenantID == arg.TenantID && !t.DeletedAt.Valid {
			out = append(out, t)
		}
	}
	return out, nil
}

func (f *fakeStore) CountTeams(ctx context.Context, tenantID int64) (int64, error) {
	var n int64
	for _, t := range f.teams {
		if t.TenantID == tenantID && !t.DeletedAt.Valid {
			n++
		}
	}
	return n, nil
}

func (f *fakeStore) CreateTeam(ctx context.Context, arg dbq.CreateTeamParams) (dbq.Team, error) {
	f.nextID++
	t := dbq.Team{
		ID:           f.nextID,
		TenantID:     arg.TenantID,
		Name:         arg.Name,
		ParentTeamID: arg.ParentTeamID,
		TeamLeadID:   arg.TeamLeadID,
		HrManagerID:  arg.HrManagerID,
		CreatedAt:    pgtype.Timestamptz{Time: time.Now(), Valid: true},
		UpdatedAt:    pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}
	f.teams[t.ID] = t
	return t, nil
}

func (f *fakeStore) UpdateTeam(ctx context.Context, arg dbq.UpdateTeamParams) (dbq.Team, error) {
	t, ok := f.teams[arg.ID]
	if !ok || t.TenantID != arg.TenantID || t.DeletedAt.Valid {
		return dbq.Team{}, pgx.ErrNoRows
	}
	if arg.Name.Valid {
		t.Name = arg.Name.String
	}
	if arg.ParentSet {
		t.ParentTeamID = arg.ParentTeamID
	}
	if arg.LeadSet {
		t.TeamLeadID = arg.TeamLeadID
	}
	if arg.HrSet {
		t.HrManagerID = arg.HrManagerID
	}
	t.UpdatedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	f.teams[t.ID] = t
	return t, nil
}

func (f *fakeStore) SoftDeleteTeam(ctx context.Context, arg dbq.SoftDeleteTeamParams) error {
	t, ok := f.teams[arg.ID]
	if !ok || t.TenantID != arg.TenantID || t.DeletedAt.Valid {
		return nil
	}
	t.DeletedAt = pgtype.Timestamptz{Time: time.Now(), Valid: true}
	f.teams[t.ID] = t
	return nil
}

var _ teams.Store = (*fakeStore)(nil)
