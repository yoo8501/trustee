package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/crypto/bcrypt"

	"github.com/seosangjun/docflow/backend/internal/model"
	"github.com/seosangjun/docflow/backend/internal/repository"
)

type UserService struct {
	queries *repository.Queries
}

func NewUserService(queries *repository.Queries) *UserService {
	return &UserService{queries: queries}
}

func (s *UserService) GetByID(ctx context.Context, userID, tenantID uuid.UUID) (*model.User, error) {
	dbUser, err := s.queries.GetUserByID(ctx, repository.GetUserByIDParams{
		ID:       pgtype.UUID{Bytes: userID, Valid: true},
		TenantID: pgtype.UUID{Bytes: tenantID, Valid: true},
	})
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, model.ErrUserNotFound
		}
		return nil, err
	}
	return toModelUser(dbUser), nil
}

func (s *UserService) UpdateName(ctx context.Context, userID, tenantID uuid.UUID, name string) (*model.User, error) {
	dbUser, err := s.queries.UpdateUserName(ctx, repository.UpdateUserNameParams{
		Name:     name,
		ID:       pgtype.UUID{Bytes: userID, Valid: true},
		TenantID: pgtype.UUID{Bytes: tenantID, Valid: true},
	})
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, model.ErrUserNotFound
		}
		return nil, err
	}
	return toModelUser(dbUser), nil
}

func (s *UserService) ChangePassword(ctx context.Context, userID, tenantID uuid.UUID, currentPassword, newPassword string) error {
	dbUser, err := s.queries.GetUserByID(ctx, repository.GetUserByIDParams{
		ID:       pgtype.UUID{Bytes: userID, Valid: true},
		TenantID: pgtype.UUID{Bytes: tenantID, Valid: true},
	})
	if err != nil {
		return model.ErrUserNotFound
	}

	if err := bcrypt.CompareHashAndPassword([]byte(dbUser.PasswordHash), []byte(currentPassword)); err != nil {
		return model.ErrInvalidCurrentPassword
	}

	if err := bcrypt.CompareHashAndPassword([]byte(dbUser.PasswordHash), []byte(newPassword)); err == nil {
		return model.ErrSamePassword
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), 12)
	if err != nil {
		return err
	}

	return s.queries.UpdateUserPassword(ctx, repository.UpdateUserPasswordParams{
		PasswordHash: string(hash),
		ID:           pgtype.UUID{Bytes: userID, Valid: true},
		TenantID:     pgtype.UUID{Bytes: tenantID, Valid: true},
	})
}

type ListUsersResult struct {
	Users []*model.User
	Total int64
}

func (s *UserService) ListUsers(ctx context.Context, tenantID uuid.UUID, limit, offset int32) (*ListUsersResult, error) {
	rows, err := s.queries.ListUsersByTenant(ctx, repository.ListUsersByTenantParams{
		TenantID: pgtype.UUID{Bytes: tenantID, Valid: true},
		Limit:    limit,
		Offset:   offset,
	})
	if err != nil {
		return nil, err
	}

	count, err := s.queries.CountUsersByTenant(ctx, pgtype.UUID{Bytes: tenantID, Valid: true})
	if err != nil {
		return nil, err
	}

	users := make([]*model.User, len(rows))
	for i, row := range rows {
		users[i] = toModelUserFromList(row)
	}

	return &ListUsersResult{Users: users, Total: count}, nil
}

func (s *UserService) UpdateRole(ctx context.Context, targetUserID, requesterUserID, tenantID uuid.UUID, role string) (*model.User, error) {
	if targetUserID == requesterUserID {
		return nil, model.ErrCannotChangeOwnRole
	}

	dbUser, err := s.queries.UpdateUserRole(ctx, repository.UpdateUserRoleParams{
		Role:     role,
		ID:       pgtype.UUID{Bytes: targetUserID, Valid: true},
		TenantID: pgtype.UUID{Bytes: tenantID, Valid: true},
	})
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, model.ErrUserNotFound
		}
		return nil, err
	}
	return toModelUser(dbUser), nil
}
