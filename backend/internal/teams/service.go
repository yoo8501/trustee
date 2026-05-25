// Package teams — 팀(부서) CRUD service / handler.
package teams

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// Sentinel errors.
var (
	ErrNotFound = errors.New("teams: not found")
)

// Store — teams 서비스 DB 의존성.
type Store interface {
	GetTeamByID(ctx context.Context, arg dbq.GetTeamByIDParams) (dbq.Team, error)
	ListTeams(ctx context.Context, arg dbq.ListTeamsParams) ([]dbq.Team, error)
	CountTeams(ctx context.Context, tenantID int64) (int64, error)
	CreateTeam(ctx context.Context, arg dbq.CreateTeamParams) (dbq.Team, error)
	UpdateTeam(ctx context.Context, arg dbq.UpdateTeamParams) (dbq.Team, error)
	SoftDeleteTeam(ctx context.Context, arg dbq.SoftDeleteTeamParams) error
}

var _ Store = (*dbq.Queries)(nil)

// Service — 팀 비즈니스 로직.
type Service struct {
	store Store
}

func NewService(store Store) *Service {
	return &Service{store: store}
}

// Get — 단건 조회.
func (s *Service) Get(ctx context.Context, id, tenantID int64) (dbq.Team, error) {
	t, err := s.store.GetTeamByID(ctx, dbq.GetTeamByIDParams{ID: id, TenantID: tenantID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return dbq.Team{}, ErrNotFound
		}
		return dbq.Team{}, err
	}
	return t, nil
}

// ListInput — 목록 입력.
type ListInput struct {
	Page int32
	Size int32
}

// ListResult — 목록 결과.
type ListResult struct {
	Items []dbq.Team
	Total int64
}

// List — 팀 목록 (tenant scoped).
func (s *Service) List(ctx context.Context, tenantID int64, in ListInput) (ListResult, error) {
	if in.Page < 1 {
		in.Page = 1
	}
	if in.Size < 1 || in.Size > 200 {
		in.Size = 20
	}
	offset := (in.Page - 1) * in.Size
	items, err := s.store.ListTeams(ctx, dbq.ListTeamsParams{
		TenantID: tenantID,
		Limit:    in.Size,
		Offset:   offset,
	})
	if err != nil {
		return ListResult{}, err
	}
	total, err := s.store.CountTeams(ctx, tenantID)
	if err != nil {
		return ListResult{}, err
	}
	return ListResult{Items: items, Total: total}, nil
}

// CreateInput — 팀 생성 입력.
type CreateInput struct {
	TenantID     int64
	Name         string
	ParentTeamID *int64
	TeamLeadID   *int64
	HRManagerID  *int64
}

// Create — 팀 생성.
func (s *Service) Create(ctx context.Context, in CreateInput) (dbq.Team, error) {
	if in.Name == "" {
		return dbq.Team{}, errors.New("teams: name required")
	}
	params := dbq.CreateTeamParams{
		TenantID: in.TenantID,
		Name:     in.Name,
	}
	if in.ParentTeamID != nil {
		params.ParentTeamID = pgtype.Int8{Int64: *in.ParentTeamID, Valid: true}
	}
	if in.TeamLeadID != nil {
		params.TeamLeadID = pgtype.Int8{Int64: *in.TeamLeadID, Valid: true}
	}
	if in.HRManagerID != nil {
		params.HrManagerID = pgtype.Int8{Int64: *in.HRManagerID, Valid: true}
	}
	t, err := s.store.CreateTeam(ctx, params)
	if err != nil {
		return dbq.Team{}, err
	}
	return t, nil
}

// UpdateInput — 팀 수정 입력. *Set 플래그로 미변경/null 구분.
type UpdateInput struct {
	ID       int64
	TenantID int64

	Name *string

	ParentSet    bool
	ParentTeamID *int64

	LeadSet    bool
	TeamLeadID *int64

	HRSet       bool
	HRManagerID *int64
}

// Update — 팀 수정.
func (s *Service) Update(ctx context.Context, in UpdateInput) (dbq.Team, error) {
	params := dbq.UpdateTeamParams{
		ID:       in.ID,
		TenantID: in.TenantID,
	}
	if in.Name != nil {
		params.Name = pgtype.Text{String: *in.Name, Valid: true}
	}
	if in.ParentSet {
		params.ParentSet = true
		if in.ParentTeamID != nil {
			params.ParentTeamID = pgtype.Int8{Int64: *in.ParentTeamID, Valid: true}
		}
	}
	if in.LeadSet {
		params.LeadSet = true
		if in.TeamLeadID != nil {
			params.TeamLeadID = pgtype.Int8{Int64: *in.TeamLeadID, Valid: true}
		}
	}
	if in.HRSet {
		params.HrSet = true
		if in.HRManagerID != nil {
			params.HrManagerID = pgtype.Int8{Int64: *in.HRManagerID, Valid: true}
		}
	}
	t, err := s.store.UpdateTeam(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return dbq.Team{}, ErrNotFound
		}
		return dbq.Team{}, err
	}
	return t, nil
}

// Delete — soft delete.
func (s *Service) Delete(ctx context.Context, id, tenantID int64) error {
	// 우선 존재 확인 — DB UPDATE 만으로는 0-row 가 not found 인지 already deleted 인지 모름.
	if _, err := s.Get(ctx, id, tenantID); err != nil {
		return err
	}
	return s.store.SoftDeleteTeam(ctx, dbq.SoftDeleteTeamParams{ID: id, TenantID: tenantID})
}
