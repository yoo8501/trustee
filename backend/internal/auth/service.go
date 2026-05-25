package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// Service — 인증 비즈니스 로직 (register / login / refresh / logout).
//
// 트랜잭션/락은 Sprint 4 이후 도입 — 현재는 단순한 시나리오 (단일 SELECT/INSERT/UPDATE) 이므로
// 별도 트랜잭션 없이도 무결성이 유지된다 (UNIQUE 제약 + 1회용 UPDATE 의 0-row 감지).
type Service struct {
	store    Store
	issuer   *TokenIssuer
	tenantID int64
	now      func() time.Time
}

// NewService — service 생성. tenantID 는 단일 조직 운영 단계의 기본값 (CLAUDE.md §3.6).
func NewService(store Store, issuer *TokenIssuer, tenantID int64) *Service {
	return &Service{store: store, issuer: issuer, tenantID: tenantID, now: time.Now}
}

// WithClock — 테스트용 시계 교체.
func (s *Service) WithClock(now func() time.Time) *Service {
	cp := *s
	cp.now = now
	return &cp
}

// RegisterInput — 회원가입 입력.
type RegisterInput struct {
	Email    string
	Password string
	Name     string
	HireDate time.Time // 비어 있으면 service 가 오늘 날짜로 채움.
}

// Register — 신규 user 생성. 기본 role=general, status=active.
// 이메일 중복은 ErrEmailDuplicate, 빈 패스워드는 ErrEmptyPassword.
func (s *Service) Register(ctx context.Context, in RegisterInput) (dbq.User, error) {
	email := strings.ToLower(strings.TrimSpace(in.Email))
	if email == "" || in.Name == "" || in.Password == "" {
		return dbq.User{}, ErrInvalidCredentials // input 검증 — handler 가 더 구체 메시지를 생성.
	}

	hash, err := HashPassword(in.Password)
	if err != nil {
		return dbq.User{}, err
	}

	hireDate := in.HireDate
	if hireDate.IsZero() {
		hireDate = s.now()
	}

	user, err := s.store.CreateUser(ctx, dbq.CreateUserParams{
		TenantID:     s.tenantID,
		Email:        email,
		PasswordHash: hash,
		Name:         in.Name,
		HireDate:     pgtype.Date{Time: hireDate, Valid: true},
		Role:         dbq.UserRoleGeneral,
		TeamID:       pgtype.Int8{Valid: false},
		ManagerID:    pgtype.Int8{Valid: false},
	})
	if err != nil {
		if isUniqueViolation(err) {
			return dbq.User{}, ErrEmailDuplicate
		}
		return dbq.User{}, err
	}
	return user, nil
}

// TokenPair — login / refresh 응답.
type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int64 // access TTL 초.
}

// Login — email + password 검증 후 access + refresh 발급.
//
// 실패 사유 우선순위: not found / password mismatch → ErrInvalidCredentials (이메일 존재 여부 노출 금지),
// terminated → ErrUserTerminated.
func (s *Service) Login(ctx context.Context, email, password string) (TokenPair, dbq.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || password == "" {
		return TokenPair{}, dbq.User{}, ErrInvalidCredentials
	}

	user, err := s.store.GetUserByEmail(ctx, dbq.GetUserByEmailParams{
		Email:    email,
		TenantID: s.tenantID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return TokenPair{}, dbq.User{}, ErrInvalidCredentials
		}
		return TokenPair{}, dbq.User{}, err
	}

	if !VerifyPassword(user.PasswordHash, password) {
		return TokenPair{}, dbq.User{}, ErrInvalidCredentials
	}

	if user.Status == dbq.UserStatusTerminated {
		return TokenPair{}, dbq.User{}, ErrUserTerminated
	}

	pair, err := s.issueTokenPair(ctx, user)
	if err != nil {
		return TokenPair{}, dbq.User{}, err
	}
	return pair, user, nil
}

// Refresh — 1회용 회전. 입력 refresh 토큰 검증 → DB lookup → MarkUsed (atomic) → 새 access+refresh 발급.
//
// reuse 감지: MarkRefreshTokenUsed 가 0 rows 면 이미 used 된 토큰을 재사용한 것으로 간주,
// user.token_version 을 증가시켜 해당 사용자의 모든 토큰을 무효화한다 (탈취 의심).
func (s *Service) Refresh(ctx context.Context, refreshToken string) (TokenPair, error) {
	claims, err := s.issuer.Verify(refreshToken, TokenTypeRefresh)
	if err != nil {
		return TokenPair{}, err
	}

	userID, err := claims.UserID()
	if err != nil {
		return TokenPair{}, ErrTokenInvalid
	}

	if claims.ID == "" {
		return TokenPair{}, ErrTokenInvalid
	}
	jti, err := uuid.Parse(claims.ID)
	if err != nil {
		return TokenPair{}, ErrTokenInvalid
	}

	pgJti := pgtype.UUID{Bytes: jti, Valid: true}

	// 1차: DB 조회로 jti 존재/소유 확인.
	rec, err := s.store.GetRefreshToken(ctx, pgJti)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// jti 자체가 없다 — token_version 검증으로 전체 토큰을 무효화하지는 않는다 (서명만 위조 가능).
			return TokenPair{}, ErrRefreshNotFound
		}
		return TokenPair{}, err
	}
	if rec.UserID != userID || rec.TenantID != claims.TenantID {
		return TokenPair{}, ErrTokenInvalid
	}

	// 2차: atomic MarkUsed. 이미 used 인 경우 0 rows → reuse 감지.
	_, err = s.store.MarkRefreshTokenUsed(ctx, pgJti)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// reuse 감지: 즉시 token_version 증가 → 해당 사용자 모든 토큰 무효.
			_, _ = s.store.IncrementUserTokenVersion(ctx, dbq.IncrementUserTokenVersionParams{
				ID:       userID,
				TenantID: claims.TenantID,
			})
			return TokenPair{}, ErrRefreshReused
		}
		return TokenPair{}, err
	}

	// 3차: 사용자 현재 상태 / token_version 확인 — logout / role 변경 등 무효화 처리.
	uv, err := s.store.GetUserTokenVersion(ctx, dbq.GetUserTokenVersionParams{
		ID:       userID,
		TenantID: claims.TenantID,
	})
	if err != nil {
		return TokenPair{}, err
	}
	if uv.Status == dbq.UserStatusTerminated {
		return TokenPair{}, ErrUserTerminated
	}
	if uv.TokenVersion != claims.TokenVersion {
		return TokenPair{}, ErrTokenRevoked
	}

	// 4차: 새 토큰 발급.
	user, err := s.store.GetUserByID(ctx, dbq.GetUserByIDParams{
		ID:       userID,
		TenantID: claims.TenantID,
	})
	if err != nil {
		return TokenPair{}, err
	}
	return s.issueTokenPair(ctx, user)
}

// Logout — user.token_version 증가. 기존 모든 access / refresh 토큰을 즉시 무효화한다.
func (s *Service) Logout(ctx context.Context, userID, tenantID int64) error {
	_, err := s.store.IncrementUserTokenVersion(ctx, dbq.IncrementUserTokenVersionParams{
		ID:       userID,
		TenantID: tenantID,
	})
	return err
}

func (s *Service) issueTokenPair(ctx context.Context, user dbq.User) (TokenPair, error) {
	access, err := s.issuer.IssueAccess(user.ID, user.TenantID, permission.Role(user.Role), user.TokenVersion)
	if err != nil {
		return TokenPair{}, err
	}
	refresh, jti, expiresAt, err := s.issuer.IssueRefresh(user.ID, user.TenantID, permission.Role(user.Role), user.TokenVersion)
	if err != nil {
		return TokenPair{}, err
	}

	now := s.now()
	if err := s.store.CreateRefreshToken(ctx, dbq.CreateRefreshTokenParams{
		Jti:       pgtype.UUID{Bytes: jti, Valid: true},
		UserID:    user.ID,
		TenantID:  user.TenantID,
		IssuedAt:  pgtype.Timestamptz{Time: now, Valid: true},
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	}); err != nil {
		return TokenPair{}, err
	}

	return TokenPair{
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    int64(AccessTokenTTL.Seconds()),
	}, nil
}

// isUniqueViolation — Postgres unique constraint violation 감지.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}
