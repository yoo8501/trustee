package service

import (
	"context"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/crypto/bcrypt"

	"github.com/seosangjun/docflow/backend/internal/auth"
	"github.com/seosangjun/docflow/backend/internal/model"
	"github.com/seosangjun/docflow/backend/internal/repository"
)

type AuthService struct {
	queries    *repository.Queries
	jwtManager *auth.JWTManager
}

func NewAuthService(queries *repository.Queries, jwtManager *auth.JWTManager) *AuthService {
	return &AuthService{queries: queries, jwtManager: jwtManager}
}

type RegisterInput struct {
	Email      string
	Password   string
	Name       string
	TenantName string
}

type AuthResult struct {
	User         *model.User
	AccessToken  string
	RefreshToken string
}

func (s *AuthService) Register(ctx context.Context, input RegisterInput) (*AuthResult, error) {
	// Check if email already exists
	_, err := s.queries.GetUserByEmailAnyTenant(ctx, input.Email)
	if err == nil {
		return nil, model.ErrEmailAlreadyExists
	}
	if err != pgx.ErrNoRows {
		return nil, err
	}

	// Create tenant
	slug := generateSlug(input.TenantName)
	tenant, err := s.queries.CreateTenant(ctx, repository.CreateTenantParams{
		Name: input.TenantName,
		Slug: slug,
	})
	if err != nil {
		return nil, err
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), 12)
	if err != nil {
		return nil, err
	}

	// Create user as admin (first user of tenant)
	dbUser, err := s.queries.CreateUser(ctx, repository.CreateUserParams{
		TenantID:     tenant.ID,
		Email:        input.Email,
		PasswordHash: string(hash),
		Name:         input.Name,
		Role:         string(model.RoleAdmin),
	})
	if err != nil {
		return nil, err
	}

	user := toModelUser(dbUser)

	accessToken, err := s.jwtManager.GenerateAccessToken(user)
	if err != nil {
		return nil, err
	}
	refreshToken, err := s.jwtManager.GenerateRefreshToken(user)
	if err != nil {
		return nil, err
	}

	return &AuthResult{User: user, AccessToken: accessToken, RefreshToken: refreshToken}, nil
}

type LoginInput struct {
	Email    string
	Password string
}

func (s *AuthService) Login(ctx context.Context, input LoginInput) (*AuthResult, error) {
	dbUser, err := s.queries.GetUserByEmailAnyTenant(ctx, input.Email)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, model.ErrInvalidCredentials
		}
		return nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(dbUser.PasswordHash), []byte(input.Password)); err != nil {
		return nil, model.ErrInvalidCredentials
	}

	user := toModelUser(dbUser)

	accessToken, err := s.jwtManager.GenerateAccessToken(user)
	if err != nil {
		return nil, err
	}
	refreshToken, err := s.jwtManager.GenerateRefreshToken(user)
	if err != nil {
		return nil, err
	}

	return &AuthResult{User: user, AccessToken: accessToken, RefreshToken: refreshToken}, nil
}

func (s *AuthService) Refresh(ctx context.Context, refreshTokenStr string) (string, error) {
	claims, err := s.jwtManager.ValidateRefreshToken(refreshTokenStr)
	if err != nil {
		return "", model.ErrInvalidToken
	}

	// Verify user still exists
	dbUser, err := s.queries.GetUserByID(ctx, repository.GetUserByIDParams{
		ID:       pgtype.UUID{Bytes: claims.UserID, Valid: true},
		TenantID: pgtype.UUID{Bytes: claims.TenantID, Valid: true},
	})
	if err != nil {
		return "", model.ErrInvalidToken
	}

	user := toModelUser(dbUser)
	return s.jwtManager.GenerateAccessToken(user)
}

func toModelUser(u repository.User) *model.User {
	return &model.User{
		ID:        uuid.UUID(u.ID.Bytes),
		TenantID:  uuid.UUID(u.TenantID.Bytes),
		Email:     u.Email,
		Name:      u.Name,
		Role:      model.Role(u.Role),
		CreatedAt: u.CreatedAt.Time,
		UpdatedAt: u.UpdatedAt.Time,
	}
}

func toModelUserFromList(u repository.ListUsersByTenantRow) *model.User {
	return &model.User{
		ID:        uuid.UUID(u.ID.Bytes),
		TenantID:  uuid.UUID(u.TenantID.Bytes),
		Email:     u.Email,
		Name:      u.Name,
		Role:      model.Role(u.Role),
		CreatedAt: u.CreatedAt.Time,
		UpdatedAt: u.UpdatedAt.Time,
	}
}

var nonAlphaNumeric = regexp.MustCompile(`[^a-z0-9-]`)

func generateSlug(name string) string {
	slug := strings.ToLower(name)
	slug = nonAlphaNumeric.ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		slug = "org"
	}
	// Add timestamp suffix for uniqueness
	return slug + "-" + time.Now().Format("20060102150405")
}
