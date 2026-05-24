# user-authentication Design Document

> **Summary**: 회원가입, 로그인, JWT 인증, 역할 기반 권한 관리 설계
>
> **Project**: DocFlow
> **Author**: seosangjun
> **Date**: 2026-03-22
> **Status**: Draft
> **Planning Doc**: [user-authentication.plan.md](../../01-plan/features/user-authentication.plan.md)
> **Parent Design**: [document-management-system.design.md](./document-management-system.design.md)

---

## 1. 개요

### 1.1 설계 목표

- 멀티테넌시 SaaS 인증 기반 구축 (테넌트별 데이터 격리의 출발점)
- JWT 이중 토큰 (Access + Refresh)으로 안전한 세션 관리
- Handler → Service → Repository 클린 아키텍처 패턴 확립
- 이후 모든 기능(문서, 결재 등)이 재사용할 인증/인가 미들웨어 제공

### 1.2 설계 원칙

- **보안 우선**: bcrypt 해싱, httpOnly 쿠키, Rate Limiting
- **Fail-fast**: 입력 검증 → 인증 → 인가 순서로 빠르게 거부
- **테넌트 격리**: JWT claims에 tenant_id 포함, 모든 쿼리에 tenant_id 바인딩

---

## 2. 아키텍처

### 2.1 인증 흐름도

```
[회원가입]
Client ─── POST /api/auth/register ──→ AuthHandler.Register
                                         → AuthService.Register
                                           → 테넌트 생성 (첫 가입)
                                           → bcrypt 해싱
                                           → UserRepository.Create
                                           → JWT 발급
                                         ← Set-Cookie: access_token, refresh_token

[로그인]
Client ─── POST /api/auth/login ──→ AuthHandler.Login
                                      → AuthService.Login
                                        → UserRepository.GetByEmail
                                        → bcrypt 비교
                                        → JWT 발급
                                      ← Set-Cookie: access_token, refresh_token

[인증된 API 요청]
Client ─── GET /api/users/me ──→ AuthMiddleware
  (Cookie: access_token)           → JWT 검증
                                   → claims에서 user_id, tenant_id, role 추출
                                   → context에 주입
                                 → UserHandler.GetMe
                                   → UserService.GetByID(ctx)
                                 ← Response { data: User }

[토큰 갱신]
Client ─── POST /api/auth/refresh ──→ AuthHandler.Refresh
  (Cookie: refresh_token)              → RefreshToken 검증
                                       → 새 AccessToken 발급
                                     ← Set-Cookie: access_token (new)
```

### 2.2 미들웨어 체인

```
요청 → CORS → Logger → RateLimiter → AuthMiddleware → RoleMiddleware → Handler
                                        │                  │
                                        │ (public 라우트   │ (admin 전용
                                        │  에서는 스킵)     │  라우트만 적용)
                                        ▼                  ▼
                                  context에 주입:      role 체크:
                                  - user_id            - admin이면 통과
                                  - tenant_id          - 아니면 403
                                  - role
```

### 2.3 의존성 맵

| 컴포넌트 | 의존 대상 | 용도 |
|----------|----------|------|
| AuthHandler | AuthService | 인증 비즈니스 로직 위임 |
| UserHandler | UserService | 사용자 관리 로직 위임 |
| AuthService | UserRepository, JWT 패키지 | 사용자 조회, 토큰 발급 |
| UserService | UserRepository | 사용자 CRUD |
| AuthMiddleware | JWT 패키지 | 토큰 검증, context 주입 |
| RoleMiddleware | context (AuthMiddleware 결과) | 역할 체크 |

---

## 3. 데이터 모델

### 3.1 PostgreSQL 스키마

```sql
-- =========================================
-- Migration 001: tenants
-- =========================================
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================
-- Migration 002: users
-- =========================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user'
        CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, email)
);

-- 인덱스
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_tenant_email ON users(tenant_id, email);

-- RLS (Row Level Security)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 같은 tenant의 사용자만 조회 가능
-- (애플리케이션에서 SET app.current_tenant_id = 'uuid' 설정 후 쿼리)
CREATE POLICY users_tenant_isolation ON users
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

### 3.2 sqlc 쿼리 정의

```sql
-- db/queries/tenants.sql

-- name: CreateTenant :one
INSERT INTO tenants (name, slug)
VALUES ($1, $2)
RETURNING *;

-- name: GetTenantBySlug :one
SELECT * FROM tenants WHERE slug = $1;

-- name: GetTenantByID :one
SELECT * FROM tenants WHERE id = $1;
```

```sql
-- db/queries/users.sql

-- name: CreateUser :one
INSERT INTO users (tenant_id, email, password_hash, name, role)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetUserByEmail :one
SELECT * FROM users
WHERE tenant_id = $1 AND email = $2;

-- name: GetUserByID :one
SELECT * FROM users
WHERE id = $1 AND tenant_id = $2;

-- name: ListUsersByTenant :many
SELECT id, tenant_id, email, name, role, created_at, updated_at
FROM users
WHERE tenant_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountUsersByTenant :one
SELECT COUNT(*) FROM users WHERE tenant_id = $1;

-- name: UpdateUserName :one
UPDATE users
SET name = $1, updated_at = NOW()
WHERE id = $2 AND tenant_id = $3
RETURNING *;

-- name: UpdateUserPassword :exec
UPDATE users
SET password_hash = $1, updated_at = NOW()
WHERE id = $2 AND tenant_id = $3;

-- name: UpdateUserRole :one
UPDATE users
SET role = $1, updated_at = NOW()
WHERE id = $2 AND tenant_id = $3
RETURNING *;
```

### 3.3 Go 도메인 모델

```go
// internal/model/user.go
package model

import (
    "time"
    "github.com/google/uuid"
)

type Role string

const (
    RoleAdmin Role = "admin"
    RoleUser  Role = "user"
)

type User struct {
    ID        uuid.UUID `json:"id"`
    TenantID  uuid.UUID `json:"tenant_id"`
    Email     string    `json:"email"`
    Name      string    `json:"name"`
    Role      Role      `json:"role"`
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}

// 비밀번호 해시는 User 구조체에 포함하지 않음 (API 응답에 노출 방지)

type Tenant struct {
    ID        uuid.UUID `json:"id"`
    Name      string    `json:"name"`
    Slug      string    `json:"slug"`
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}
```

---

## 4. API 상세 설계

### 4.1 공통 규칙

**쿠키 설정** (모든 토큰 응답에 적용):
```
Set-Cookie: access_token=<jwt>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600
Set-Cookie: refresh_token=<jwt>; Path=/api/auth/refresh; HttpOnly; Secure; SameSite=Strict; Max-Age=604800
```

**응답 형식**:
```json
// 성공
{ "data": { ... } }

// 에러
{ "error": { "code": "ERROR_CODE", "message": "설명" } }
```

### 4.2 인증 API

#### POST /api/auth/register

```go
// Request body
type RegisterRequest struct {
    Email      string `json:"email" binding:"required,email,max=255"`
    Password   string `json:"password" binding:"required,min=8,max=72"`
    Name       string `json:"name" binding:"required,min=1,max=100"`
    TenantName string `json:"tenant_name" binding:"required,min=1,max=255"`
}
```

```json
// Request
{
  "email": "admin@company.com",
  "password": "SecurePass123!",
  "name": "홍길동",
  "tenant_name": "우리회사"
}

// Response 201
{
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "tenant_id": "660e8400-e29b-41d4-a716-446655440000",
      "email": "admin@company.com",
      "name": "홍길동",
      "role": "admin",
      "created_at": "2026-03-22T10:00:00Z"
    }
  }
}
// + Set-Cookie: access_token, refresh_token
```

**비즈니스 로직**:
1. 이메일 형식 검증 + 비밀번호 정책 검증
2. tenant_name → slug 변환 (소문자, 특수문자 제거, 중복 시 숫자 접미사)
3. 테넌트 생성
4. 비밀번호 bcrypt 해싱 (cost=12)
5. 사용자 생성 (role = 'admin', 첫 가입자)
6. JWT 토큰 쌍 발급
7. httpOnly 쿠키로 토큰 설정

**에러**:
- `400 VALIDATION_ERROR`: 입력값 검증 실패
- `409 EMAIL_ALREADY_EXISTS`: 동일 테넌트 내 이메일 중복

#### POST /api/auth/login

```go
type LoginRequest struct {
    Email    string `json:"email" binding:"required,email"`
    Password string `json:"password" binding:"required"`
}
```

```json
// Request
{ "email": "admin@company.com", "password": "SecurePass123!" }

// Response 200
{
  "data": {
    "user": {
      "id": "550e8400-...",
      "tenant_id": "660e8400-...",
      "email": "admin@company.com",
      "name": "홍길동",
      "role": "admin"
    }
  }
}
// + Set-Cookie: access_token, refresh_token
```

**비즈니스 로직**:
1. 이메일로 사용자 조회
2. bcrypt 비밀번호 비교
3. JWT 토큰 쌍 발급
4. httpOnly 쿠키로 토큰 설정

**에러**:
- `401 INVALID_CREDENTIALS`: 이메일 또는 비밀번호 불일치 (구체적 원인 미노출)
- `429 TOO_MANY_REQUESTS`: Rate Limit 초과 (5회/분)

#### POST /api/auth/refresh

```json
// Request: Cookie에서 refresh_token 자동 전달 (body 없음)

// Response 200
{ "data": { "message": "Token refreshed" } }
// + Set-Cookie: access_token (new)
```

**비즈니스 로직**:
1. refresh_token 쿠키에서 토큰 추출
2. 토큰 유효성 검증 (만료, 서명)
3. claims에서 user_id 추출 → DB에서 사용자 존재 확인
4. 새 access_token 발급
5. access_token 쿠키 갱신

**에러**:
- `401 TOKEN_EXPIRED`: Refresh Token 만료 → 재로그인 필요
- `401 INVALID_TOKEN`: 토큰 변조

#### POST /api/auth/logout

```json
// Response 200
{ "data": { "message": "Logged out" } }
// + Set-Cookie: access_token=; Max-Age=0
// + Set-Cookie: refresh_token=; Max-Age=0
```

### 4.3 사용자 API

#### GET /api/users/me
**인증**: 필수 (user, admin)

```json
// Response 200
{
  "data": {
    "id": "550e8400-...",
    "tenant_id": "660e8400-...",
    "email": "admin@company.com",
    "name": "홍길동",
    "role": "admin",
    "created_at": "2026-03-22T10:00:00Z",
    "updated_at": "2026-03-22T10:00:00Z"
  }
}
```

#### PATCH /api/users/me
**인증**: 필수 (user, admin)

```go
type UpdateMeRequest struct {
    Name string `json:"name" binding:"required,min=1,max=100"`
}
```

```json
// Request
{ "name": "김길동" }

// Response 200
{ "data": { "id": "...", "name": "김길동", ... } }
```

#### PATCH /api/users/me/password
**인증**: 필수 (user, admin)

```go
type ChangePasswordRequest struct {
    CurrentPassword string `json:"current_password" binding:"required"`
    NewPassword     string `json:"new_password" binding:"required,min=8,max=72"`
}
```

```json
// Request
{ "current_password": "OldPass123!", "new_password": "NewPass456!" }

// Response 200
{ "data": { "message": "Password changed" } }
```

**에러**:
- `400 INVALID_CURRENT_PASSWORD`: 현재 비밀번호 불일치
- `400 SAME_PASSWORD`: 새 비밀번호가 현재와 동일

#### GET /api/users
**인증**: admin 전용

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| page | int | 페이지 번호 (기본 1) |
| limit | int | 페이지 크기 (기본 20, 최대 100) |

```json
// Response 200
{
  "data": [
    {
      "id": "550e8400-...",
      "email": "user1@company.com",
      "name": "김직원",
      "role": "user",
      "created_at": "2026-03-22T11:00:00Z"
    }
  ],
  "total": 25
}
```

#### PATCH /api/users/:id
**인증**: admin 전용

```go
type UpdateUserRoleRequest struct {
    Role string `json:"role" binding:"required,oneof=admin user"`
}
```

```json
// Request
{ "role": "admin" }

// Response 200
{ "data": { "id": "...", "role": "admin", ... } }
```

**에러**:
- `400 CANNOT_CHANGE_OWN_ROLE`: 자기 자신의 역할 변경 불가
- `404 USER_NOT_FOUND`: 사용자 없음

---

## 5. 백엔드 상세 설계

### 5.1 파일 구조

```
backend/
├── cmd/
│   └── server/
│       └── main.go                  # 엔트리포인트
├── internal/
│   ├── config/
│   │   └── config.go                # 환경변수 로드
│   ├── handler/
│   │   ├── auth_handler.go          # Register, Login, Refresh, Logout
│   │   ├── user_handler.go          # GetMe, UpdateMe, ChangePassword, ListUsers, UpdateRole
│   │   └── response.go              # 공통 응답 헬퍼
│   ├── service/
│   │   ├── auth_service.go          # 인증 비즈니스 로직
│   │   └── user_service.go          # 사용자 관리 로직
│   ├── repository/
│   │   └── (sqlc 자동 생성)          # db.go, models.go, tenants.sql.go, users.sql.go
│   ├── middleware/
│   │   ├── auth.go                  # JWT 검증, context 주입
│   │   ├── role.go                  # 역할 기반 접근 제어
│   │   ├── cors.go                  # CORS 설정
│   │   ├── logger.go                # 요청 로깅
│   │   └── ratelimit.go             # Rate Limiting
│   ├── model/
│   │   ├── user.go                  # User, Tenant 도메인 모델
│   │   └── errors.go               # 커스텀 에러 정의
│   └── auth/
│       └── jwt.go                   # JWT 생성/검증 유틸
├── db/
│   ├── migrations/
│   │   ├── 000001_create_tenants.up.sql
│   │   ├── 000001_create_tenants.down.sql
│   │   ├── 000002_create_users.up.sql
│   │   └── 000002_create_users.down.sql
│   ├── queries/
│   │   ├── tenants.sql
│   │   └── users.sql
│   └── sqlc.yaml
├── go.mod
└── go.sum
```

### 5.2 JWT 설계

```go
// internal/auth/jwt.go

// Access Token Claims
type AccessClaims struct {
    UserID   uuid.UUID `json:"sub"`
    TenantID uuid.UUID `json:"tenant_id"`
    Role     string    `json:"role"`
    jwt.RegisteredClaims
}

// Refresh Token Claims (최소한의 정보)
type RefreshClaims struct {
    UserID   uuid.UUID `json:"sub"`
    TenantID uuid.UUID `json:"tenant_id"`
    jwt.RegisteredClaims
}

// 토큰 설정
const (
    AccessTokenDuration  = 1 * time.Hour   // 1시간
    RefreshTokenDuration = 7 * 24 * time.Hour // 7일
    SigningMethod         = jwt.SigningMethodHS256
)

// 인터페이스
type JWTManager interface {
    GenerateAccessToken(user *model.User) (string, error)
    GenerateRefreshToken(user *model.User) (string, error)
    ValidateAccessToken(tokenStr string) (*AccessClaims, error)
    ValidateRefreshToken(tokenStr string) (*RefreshClaims, error)
}
```

### 5.3 미들웨어 설계

```go
// internal/middleware/auth.go

// context key 타입
type contextKey string

const (
    ContextUserID   contextKey = "user_id"
    ContextTenantID contextKey = "tenant_id"
    ContextRole     contextKey = "role"
)

// AuthMiddleware: access_token 쿠키에서 JWT 추출 → 검증 → context 주입
func AuthMiddleware(jwtManager auth.JWTManager) gin.HandlerFunc {
    return func(c *gin.Context) {
        // 1. Cookie에서 access_token 추출
        // 2. JWT 검증
        // 3. claims에서 user_id, tenant_id, role 추출
        // 4. c.Set()으로 context에 주입
        // 5. c.Next()
        // 실패 시: 401 Unauthorized 반환
    }
}

// internal/middleware/role.go

// RequireRole: 특정 역할 필요
func RequireRole(roles ...model.Role) gin.HandlerFunc {
    return func(c *gin.Context) {
        // 1. context에서 role 추출
        // 2. 허용된 역할인지 확인
        // 3. 아니면 403 Forbidden 반환
    }
}
```

### 5.4 라우터 설정

```go
// cmd/server/main.go (라우터 부분)

r := gin.Default()
r.Use(middleware.CORS())
r.Use(middleware.Logger())

// Public routes (인증 불필요)
auth := r.Group("/api/auth")
{
    auth.POST("/register", authHandler.Register)
    auth.POST("/login", middleware.RateLimit(5, time.Minute), authHandler.Login)
    auth.POST("/refresh", authHandler.Refresh)
}

// Authenticated routes
api := r.Group("/api")
api.Use(middleware.AuthMiddleware(jwtManager))
{
    api.POST("/auth/logout", authHandler.Logout)

    // User routes
    api.GET("/users/me", userHandler.GetMe)
    api.PATCH("/users/me", userHandler.UpdateMe)
    api.PATCH("/users/me/password", userHandler.ChangePassword)

    // Admin-only routes
    admin := api.Group("")
    admin.Use(middleware.RequireRole(model.RoleAdmin))
    {
        admin.GET("/users", userHandler.ListUsers)
        admin.PATCH("/users/:id", userHandler.UpdateUserRole)
    }
}
```

### 5.5 환경 변수

```go
// internal/config/config.go
type Config struct {
    // Server
    Port string `env:"PORT" envDefault:"8080"`

    // Database
    DatabaseURL string `env:"DATABASE_URL,required"`

    // JWT
    JWTSecret          string `env:"JWT_SECRET,required"`
    AccessTokenExpiry  time.Duration `env:"ACCESS_TOKEN_EXPIRY" envDefault:"1h"`
    RefreshTokenExpiry time.Duration `env:"REFRESH_TOKEN_EXPIRY" envDefault:"168h"`

    // CORS
    AllowedOrigins string `env:"ALLOWED_ORIGINS" envDefault:"http://localhost:3000"`
}
```

### 5.6 Go 의존성

| 패키지 | 용도 | 버전 |
|--------|------|------|
| github.com/gin-gonic/gin | HTTP 프레임워크 | v1.9+ |
| github.com/golang-jwt/jwt/v5 | JWT 생성/검증 | v5 |
| golang.org/x/crypto/bcrypt | 비밀번호 해싱 | latest |
| github.com/jackc/pgx/v5 | PostgreSQL 드라이버 | v5 |
| github.com/google/uuid | UUID 생성 | v1 |
| github.com/caarlos0/env/v11 | 환경변수 파싱 | v11 |
| github.com/golang-migrate/migrate/v4 | DB 마이그레이션 | v4 |

---

## 6. 프론트엔드 상세 설계

### 6.1 디렉토리 구조

```
frontend/src/
├── app/
│   ├── (public)/                     # 비인증 라우트 그룹
│   │   ├── layout.tsx                # 퍼블릭 레이아웃 (심플 헤더)
│   │   ├── login/
│   │   │   └── page.tsx              # 로그인 페이지
│   │   └── register/
│   │       └── page.tsx              # 회원가입 페이지
│   ├── (app)/                        # 인증 필요 라우트 그룹
│   │   ├── layout.tsx                # 앱 레이아웃 (사이드바+헤더)
│   │   ├── page.tsx                  # 대시보드 (임시 빈 페이지)
│   │   ├── profile/
│   │   │   └── page.tsx              # 내 정보
│   │   └── admin/
│   │       └── users/
│   │           └── page.tsx          # 사용자 관리
│   ├── layout.tsx                    # 루트 레이아웃 (ThemeProvider, QueryProvider)
│   └── providers.tsx                 # MUI Theme + TanStack Query 프로바이더
│
├── components/
│   ├── auth/
│   │   ├── LoginForm.tsx             # 로그인 폼
│   │   ├── RegisterForm.tsx          # 회원가입 폼
│   │   └── AuthGuard.tsx             # 인증 라우트 보호
│   ├── users/
│   │   ├── UserList.tsx              # 사용자 목록 테이블
│   │   ├── UserRoleChip.tsx          # 역할 표시 칩
│   │   └── ChangePasswordForm.tsx    # 비밀번호 변경 폼
│   └── common/
│       ├── AppHeader.tsx             # 헤더 (유저 메뉴)
│       └── AppSidebar.tsx            # 사이드바 (빈 틀, 이후 확장)
│
├── hooks/
│   ├── useAuth.ts                    # 로그인/가입/로그아웃 mutation
│   └── useUsers.ts                   # 사용자 CRUD query/mutation
│
├── lib/
│   ├── api/
│   │   ├── client.ts                 # Axios 인스턴스 (인터셉터)
│   │   ├── auth.ts                   # 인증 API 함수
│   │   └── users.ts                  # 사용자 API 함수
│   └── validations/
│       └── auth.ts                   # Zod 스키마 (login, register, password)
│
└── types/
    ├── auth.ts                       # 인증 관련 타입
    └── api.ts                        # 공통 API 응답 타입
```

### 6.2 TypeScript 타입 정의

```typescript
// types/api.ts
export interface ApiResponse<T> {
  data: T;
}

export interface ApiListResponse<T> {
  data: T[];
  total: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

// types/auth.ts
export interface User {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  created_at: string;
  updated_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  tenant_name: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface UpdateUserRoleRequest {
  role: 'admin' | 'user';
}
```

### 6.3 Zod 검증 스키마

```typescript
// lib/validations/auth.ts
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z.string().min(1, '비밀번호를 입력하세요'),
});

export const registerSchema = z.object({
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z
    .string()
    .min(8, '비밀번호는 8자 이상이어야 합니다')
    .regex(/[a-zA-Z]/, '영문을 포함해야 합니다')
    .regex(/[0-9]/, '숫자를 포함해야 합니다'),
  name: z.string().min(1, '이름을 입력하세요').max(100),
  tenant_name: z.string().min(1, '회사명을 입력하세요').max(255),
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, '현재 비밀번호를 입력하세요'),
  new_password: z
    .string()
    .min(8, '비밀번호는 8자 이상이어야 합니다')
    .regex(/[a-zA-Z]/, '영문을 포함해야 합니다')
    .regex(/[0-9]/, '숫자를 포함해야 합니다'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
```

### 6.4 API 클라이언트

```typescript
// lib/api/client.ts
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,  // httpOnly 쿠키 자동 전송
});

// 응답 인터셉터: 401 시 토큰 갱신 시도
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await apiClient.post('/api/auth/refresh');
        return apiClient(originalRequest);  // 원래 요청 재시도
      } catch {
        window.location.href = '/login';    // 갱신 실패 → 로그인으로
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
```

### 6.5 TanStack Query 훅

```typescript
// hooks/useAuth.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useMe() {
  return useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => authApi.getMe(),
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
    },
  });
}

export function useRegister() {
  return useMutation({ mutationFn: authApi.register });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
```

### 6.6 AuthGuard 컴포넌트

```typescript
// components/auth/AuthGuard.tsx
// (app) 라우트 그룹의 layout.tsx에서 사용

// 로직:
// 1. useMe()로 현재 사용자 조회
// 2. 로딩 중: 스피너 표시
// 3. 에러 (401): /login으로 리다이렉트
// 4. 성공: children 렌더링
// 5. adminOnly 옵션: role !== 'admin'이면 / 로 리다이렉트
```

### 6.7 페이지 와이어프레임

```
[로그인 페이지 - /login]
┌──────────────────────────────────────┐
│              DocFlow                  │
├──────────────────────────────────────┤
│                                      │
│  ┌──────────────────────────────┐   │
│  │        로그인                 │   │
│  │                              │   │
│  │  이메일    [              ]   │   │
│  │  비밀번호  [              ]   │   │
│  │                              │   │
│  │  [      로그인 버튼      ]   │   │
│  │                              │   │
│  │  계정이 없으신가요? 회원가입  │   │
│  └──────────────────────────────┘   │
│                                      │
└──────────────────────────────────────┘

[회원가입 페이지 - /register]
┌──────────────────────────────────────┐
│              DocFlow                  │
├──────────────────────────────────────┤
│                                      │
│  ┌──────────────────────────────┐   │
│  │       회원가입                │   │
│  │                              │   │
│  │  회사명    [              ]   │   │
│  │  이름      [              ]   │   │
│  │  이메일    [              ]   │   │
│  │  비밀번호  [              ]   │   │
│  │                              │   │
│  │  [     회원가입 버튼     ]   │   │
│  │                              │   │
│  │  이미 계정이 있으신가요? 로그인│   │
│  └──────────────────────────────┘   │
│                                      │
└──────────────────────────────────────┘

[앱 레이아웃 - (app) 그룹]
┌──────────────────────────────────────────────┐
│  DocFlow          [검색]    🔔  홍길동 ▼      │
├──────┬───────────────────────────────────────┤
│      │                                       │
│ 사이드│  메인 콘텐츠 영역                      │
│ 바   │  (각 페이지별 내용)                     │
│      │                                       │
│ • 대시│                                       │
│ • 문서│                                       │
│ • 결재│                                       │
│      │                                       │
│ ─────│                                       │
│ • 설정│                                       │
│ • 관리│ (admin만)                              │
│      │                                       │
└──────┴───────────────────────────────────────┘
```

---

## 7. 에러 처리

### 7.1 백엔드 에러 코드

| HTTP | Code | 메시지 | 발생 상황 |
|------|------|--------|----------|
| 400 | VALIDATION_ERROR | 입력값 검증 실패 | 필수 필드 누락, 형식 오류 |
| 400 | INVALID_CURRENT_PASSWORD | 현재 비밀번호 불일치 | 비밀번호 변경 시 |
| 400 | SAME_PASSWORD | 현재와 동일한 비밀번호 | 비밀번호 변경 시 |
| 400 | CANNOT_CHANGE_OWN_ROLE | 자기 역할 변경 불가 | 관리자가 자기 역할 변경 시도 |
| 401 | INVALID_CREDENTIALS | 이메일 또는 비밀번호 오류 | 로그인 실패 |
| 401 | INVALID_TOKEN | 토큰 변조/무효 | JWT 검증 실패 |
| 401 | TOKEN_EXPIRED | 토큰 만료 | Access/Refresh Token 만료 |
| 403 | FORBIDDEN | 권한 없음 | user가 admin API 접근 |
| 404 | USER_NOT_FOUND | 사용자 없음 | 사용자 조회/수정 시 |
| 409 | EMAIL_ALREADY_EXISTS | 이메일 중복 | 회원가입 시 |
| 429 | TOO_MANY_REQUESTS | 요청 초과 | Rate Limit 도달 |

### 7.2 프론트엔드 에러 처리

| 에러 코드 | UI 처리 |
|----------|---------|
| VALIDATION_ERROR | 필드별 인라인 에러 메시지 표시 |
| INVALID_CREDENTIALS | "이메일 또는 비밀번호가 올바르지 않습니다" 토스트 |
| TOKEN_EXPIRED (refresh 실패) | /login 리다이렉트 |
| FORBIDDEN | "권한이 없습니다" 토스트 |
| EMAIL_ALREADY_EXISTS | "이미 사용 중인 이메일입니다" 인라인 에러 |
| TOO_MANY_REQUESTS | "잠시 후 다시 시도해주세요" 토스트 |

---

## 8. 보안 설계

| 항목 | 구현 방식 |
|------|----------|
| 비밀번호 저장 | bcrypt (cost=12) |
| 토큰 저장 | httpOnly + Secure + SameSite=Strict 쿠키 |
| CSRF 방지 | SameSite=Strict 쿠키 (cross-origin 요청 차단) |
| XSS 방지 | httpOnly 쿠키 (JS 접근 불가) + React 기본 이스케이프 |
| SQL Injection | sqlc 파라미터 바인딩 |
| Rate Limiting | 로그인 5회/분 (IP 기준) |
| 비밀번호 정책 | 최소 8자, 영문+숫자 필수 |
| 에러 메시지 | 로그인 실패 시 구체적 원인 미노출 ("이메일 또는 비밀번호 오류") |
| 로깅 | 비밀번호, 토큰 등 민감 정보 로깅 금지 |

---

## 9. 인프라 설계

### 9.1 Docker Compose

```yaml
# infra/docker/docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: docflow
      POSTGRES_USER: docflow
      POSTGRES_PASSWORD: docflow_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build:
      context: ../../backend
      dockerfile: ../infra/docker/Dockerfile.backend
    ports:
      - "8080:8080"
    environment:
      DATABASE_URL: postgres://docflow:docflow_dev@db:5432/docflow?sslmode=disable
      JWT_SECRET: dev-jwt-secret-change-in-production
      ALLOWED_ORIGINS: http://localhost:3000
    depends_on:
      - db

  frontend:
    build:
      context: ../../frontend
      dockerfile: ../infra/docker/Dockerfile.frontend
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8080

volumes:
  pgdata:
```

### 9.2 Dockerfile (Backend)

```dockerfile
# infra/docker/Dockerfile.backend
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o server ./cmd/server

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /app/server .
EXPOSE 8080
CMD ["./server"]
```

### 9.3 Dockerfile (Frontend)

```dockerfile
# infra/docker/Dockerfile.frontend
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
```

---

## 10. 테스트 계획

| 유형 | 대상 | 도구 |
|------|------|------|
| Go 단위 테스트 | AuthService (해싱, 토큰), JWTManager | Go testing + testify |
| Go 통합 테스트 | 인증 API 엔드포인트 전체 | httptest + testcontainers-go |
| FE 단위 테스트 | Zod 검증 스키마, API 함수 | Vitest |
| FE 컴포넌트 테스트 | LoginForm, RegisterForm | Vitest + React Testing Library |

### 핵심 테스트 케이스

- [ ] 회원가입 → 테넌트 생성 + admin 역할 부여 확인
- [ ] 로그인 성공 → access_token, refresh_token 쿠키 설정 확인
- [ ] 잘못된 비밀번호 로그인 → 401 반환
- [ ] 만료된 access_token → 401 반환
- [ ] refresh 성공 → 새 access_token 쿠키 설정
- [ ] 만료된 refresh_token → 401 반환 (재로그인 필요)
- [ ] user 역할로 GET /api/users → 403 반환
- [ ] admin 역할로 GET /api/users → 200 + 사용자 목록
- [ ] 비밀번호 변경 → 현재 비밀번호 틀리면 400
- [ ] 동일 tenant_id + email 중복 가입 → 409

---

## 11. 구현 순서

### Step 1: 인프라 초기화
1. [ ] Docker Compose 설정 (PostgreSQL + Go + Next.js)
2. [ ] Go 프로젝트 초기화 (go mod, 기본 패키지 구조)
3. [ ] Next.js 프로젝트 초기화 (MUI, TanStack Query, React Hook Form, Zod)

### Step 2: DB + Repository
4. [ ] golang-migrate 설정 + tenants 마이그레이션
5. [ ] users 마이그레이션
6. [ ] sqlc 설정 + 쿼리 작성 + 코드 생성

### Step 3: 인증 API
7. [ ] Config 로드 (환경변수)
8. [ ] JWT 유틸 (생성, 검증)
9. [ ] AuthService (Register, Login, Refresh)
10. [ ] AuthHandler + 라우터 등록
11. [ ] AuthMiddleware (JWT 검증 → context 주입)
12. [ ] RoleMiddleware (역할 체크)
13. [ ] CORS, Logger, RateLimit 미들웨어

### Step 4: 사용자 관리 API
14. [ ] UserService (GetMe, UpdateMe, ChangePassword, ListUsers, UpdateRole)
15. [ ] UserHandler + 라우터 등록

### Step 5: 프론트엔드 기반
16. [ ] 루트 레이아웃 + Providers (MUI Theme, QueryClient)
17. [ ] API 클라이언트 (Axios 인터셉터, 토큰 갱신)
18. [ ] 타입 정의 + Zod 스키마

### Step 6: 프론트엔드 페이지
19. [ ] 로그인 페이지 (LoginForm)
20. [ ] 회원가입 페이지 (RegisterForm)
21. [ ] AuthGuard 컴포넌트
22. [ ] 앱 레이아웃 (AppHeader + AppSidebar 빈 틀)
23. [ ] 내 정보 페이지 (프로필 수정, 비밀번호 변경)
24. [ ] 사용자 관리 페이지 (admin 전용)

---

## Version History

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|----------|--------|
| 0.1 | 2026-03-22 | 초안 작성 | seosangjun |
