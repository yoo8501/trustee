# 로그인 화면 구현 Design Document

> **Summary**: 이메일/비밀번호 및 소셜 로그인(Google, GitHub)을 포함한 인증 화면 UI/UX 및 프론트엔드 아키텍처 설계
>
> **Project**: 수탁사 관리 시스템 (Trustee Management System)
> **Version**: 0.0.0
> **Author**: AI
> **Date**: 2026-02-16
> **Status**: Draft
> **Planning Doc**: [login.plan.md](../01-plan/features/login.plan.md)

---

## 1. Overview

### 1.1 Design Goals

- MUI 디자인 시스템과 일관된 인증 화면 UI 구현
- React Hook Form + Zod 기반의 강력한 폼 유효성 검사
- JWT 토큰 기반 인증 상태 관리 (cookie 저장)
- Next.js middleware를 활용한 서버사이드 라우트 보호
- 백엔드 미완성 상태에서도 독립 동작 가능한 프론트엔드 구조

### 1.2 Design Principles

- **기존 패턴 준수**: 프로젝트의 `@trustee/ui` 컴포넌트, React Query 훅 패턴 재사용
- **점진적 연동**: 프론트엔드 UI 우선 구현 → 백엔드 API 연동은 별도 진행
- **보안 우선**: XSS 방지를 위한 httpOnly cookie 토큰 관리

---

## 2. Architecture

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│                                                              │
│  ┌──────────────┐   ┌──────────────────────────────────┐    │
│  │  (auth)/     │   │  (dashboard)/                     │    │
│  │  ├ login     │   │  ├ layout.tsx (Layout + Sidebar)  │    │
│  │  ├ signup    │   │  ├ page.tsx (대시보드)             │    │
│  │  ├ forgot-pw │   │  ├ trustees/                      │    │
│  │  └ reset-pw  │   │  ├ contracts/                     │    │
│  └──────────────┘   │  └ inspections/                   │    │
│         │           └──────────────────────────────────────┘ │
│         │                        │                           │
│  ┌──────┴────────────────────────┴──────┐                    │
│  │  AuthProvider (React Context)         │                    │
│  │  ├ user 상태                          │                    │
│  │  ├ login / logout / signup 함수       │                    │
│  │  └ isAuthenticated                    │                    │
│  └──────────────────────────────────────┘                    │
│                        │                                     │
│  ┌─────────────────────┴────────────────┐                    │
│  │  API Client (lib/api/client.ts)       │                    │
│  │  ├ Authorization 헤더 자동 첨부       │                    │
│  │  └ 401 → 로그인 리다이렉트           │                    │
│  └──────────────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐
│  Gateway (:3001)  │
│  authMiddleware   │
│  (JWT 검증)       │
└──────────────────┘
```

### 2.2 Data Flow

```
[로그인]
사용자 입력 → Zod 유효성 검사 → authApi.login() → Gateway /api/auth/login
→ JWT(accessToken + refreshToken) 반환 → cookie 저장 → AuthContext 업데이트 → 대시보드 리다이렉트

[회원가입]
사용자 입력 → Zod 유효성 검사 → authApi.signup() → Gateway /api/auth/signup
→ 성공 → 로그인 페이지 리다이렉트 (성공 메시지)

[비밀번호 찾기]
이메일 입력 → authApi.forgotPassword() → 이메일 발송 안내 화면

[토큰 갱신]
API 401 응답 → authApi.refresh() → 새 accessToken → cookie 갱신 → 원래 요청 재시도

[라우트 보호]
middleware.ts → cookie에서 토큰 확인 → 없으면 /login 리다이렉트
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `(auth)/*` 페이지 | `@trustee/ui` (Form, FormTextField, Button) | UI 컴포넌트 |
| `(auth)/*` 페이지 | `AuthProvider` | 인증 상태/함수 |
| `AuthProvider` | `lib/api/auth.ts` | 인증 API 호출 |
| `lib/api/auth.ts` | `lib/api/client.ts` (apiClient) | HTTP 클라이언트 |
| `middleware.ts` | `next/server` | 서버사이드 라우트 보호 |
| `(dashboard)/*` | `AuthProvider` → `useAuth()` | 로그아웃 기능 |

---

## 3. Data Model

### 3.1 인증 관련 타입 정의

```typescript
// backend/packages/types/src/auth.ts (신규)

// 사용자 역할
export type UserRole = "admin" | "user";

// 사용자 정보
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

// 로그인 입력
export interface LoginInput {
  email: string;
  password: string;
}

// 회원가입 입력
export interface SignupInput {
  email: string;
  password: string;
  name: string;
}

// 비밀번호 찾기 입력
export interface ForgotPasswordInput {
  email: string;
}

// 비밀번호 재설정 입력
export interface ResetPasswordInput {
  token: string;
  password: string;
  confirmPassword: string;
}

// 인증 응답
export interface AuthResponse {
  data: {
    user: User;
    accessToken: string;
    refreshToken: string;
  };
}

// 인증 상태 (프론트엔드)
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
```

### 3.2 Prisma User 모델 (향후 추가)

```prisma
// backend/packages/database/prisma/schema.prisma (추가 예정)

enum UserRole {
  admin
  user
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String   @map("password_hash")
  name         String
  role         UserRole @default(user)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("users")
}
```

---

## 4. API Specification

### 4.1 인증 Endpoint 목록

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/auth/login | 이메일/비밀번호 로그인 | No |
| POST | /api/auth/signup | 회원가입 | No |
| POST | /api/auth/logout | 로그아웃 | Required |
| POST | /api/auth/refresh | 토큰 갱신 | Refresh Token |
| POST | /api/auth/forgot-password | 비밀번호 찾기 요청 | No |
| POST | /api/auth/reset-password | 비밀번호 재설정 | Reset Token |
| GET | /api/auth/me | 현재 사용자 정보 | Required |
| POST | /api/auth/social/google | Google 소셜 로그인 | No |
| POST | /api/auth/social/github | GitHub 소셜 로그인 | No |

### 4.2 상세 스펙

#### `POST /api/auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200 OK):**
```json
{
  "data": {
    "user": {
      "id": "clxxx...",
      "email": "user@example.com",
      "name": "홍길동",
      "role": "user"
    },
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG..."
  }
}
```

**Error Responses:**
- `400`: 유효성 검사 실패 `{ "error": { "code": "VALIDATION_ERROR", "message": "이메일은 필수입니다" } }`
- `401`: 인증 실패 `{ "error": { "code": "INVALID_CREDENTIALS", "message": "이메일 또는 비밀번호가 올바르지 않습니다" } }`

#### `POST /api/auth/signup`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "홍길동"
}
```

**Response (201 Created):**
```json
{
  "data": {
    "user": {
      "id": "clxxx...",
      "email": "user@example.com",
      "name": "홍길동",
      "role": "user"
    }
  }
}
```

**Error Responses:**
- `400`: 유효성 검사 실패
- `409`: 이메일 중복 `{ "error": { "code": "CONFLICT", "message": "이미 등록된 이메일입니다" } }`

#### `POST /api/auth/forgot-password`

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200 OK):**
```json
{
  "data": {
    "message": "비밀번호 재설정 이메일이 발송되었습니다"
  }
}
```

#### `POST /api/auth/reset-password`

**Request:**
```json
{
  "token": "reset-token-xxx",
  "password": "newPassword123",
  "confirmPassword": "newPassword123"
}
```

**Response (200 OK):**
```json
{
  "data": {
    "message": "비밀번호가 성공적으로 변경되었습니다"
  }
}
```

---

## 5. UI/UX Design

### 5.1 로그인 페이지 레이아웃

```
┌──────────────────────────────────────────────────┐
│                                                    │
│           ┌─────────────────────────┐              │
│           │      🏢 로고/제목         │              │
│           │  수탁사 관리 시스템        │              │
│           │                         │              │
│           │  ┌───────────────────┐  │              │
│           │  │ 이메일             │  │              │
│           │  └───────────────────┘  │              │
│           │  ┌───────────────────┐  │              │
│           │  │ 비밀번호           │  │              │
│           │  └───────────────────┘  │              │
│           │                         │              │
│           │  □ 로그인 상태 유지      │              │
│           │                         │              │
│           │  ┌───────────────────┐  │              │
│           │  │     로그인         │  │              │
│           │  └───────────────────┘  │              │
│           │                         │              │
│           │  비밀번호를 잊으셨나요?   │              │
│           │                         │              │
│           │  ──── 또는 ────         │              │
│           │                         │              │
│           │  ┌───────────────────┐  │              │
│           │  │  🔵 Google 로그인  │  │              │
│           │  └───────────────────┘  │              │
│           │  ┌───────────────────┐  │              │
│           │  │  ⚫ GitHub 로그인  │  │              │
│           │  └───────────────────┘  │              │
│           │                         │              │
│           │  계정이 없으신가요? 가입  │              │
│           └─────────────────────────┘              │
│                                                    │
└──────────────────────────────────────────────────┘
```

### 5.2 회원가입 페이지 레이아웃

```
┌──────────────────────────────────────────────────┐
│           ┌─────────────────────────┐              │
│           │      🏢 로고/제목         │              │
│           │  회원가입                 │              │
│           │                         │              │
│           │  ┌───────────────────┐  │              │
│           │  │ 이름               │  │              │
│           │  └───────────────────┘  │              │
│           │  ┌───────────────────┐  │              │
│           │  │ 이메일             │  │              │
│           │  └───────────────────┘  │              │
│           │  ┌───────────────────┐  │              │
│           │  │ 비밀번호           │  │              │
│           │  └───────────────────┘  │              │
│           │  ┌───────────────────┐  │              │
│           │  │ 비밀번호 확인      │  │              │
│           │  └───────────────────┘  │              │
│           │                         │              │
│           │  ┌───────────────────┐  │              │
│           │  │     회원가입       │  │              │
│           │  └───────────────────┘  │              │
│           │                         │              │
│           │  이미 계정이 있으신가요?  │              │
│           │  로그인                  │              │
│           └─────────────────────────┘              │
└──────────────────────────────────────────────────┘
```

### 5.3 비밀번호 찾기 페이지 레이아웃

```
┌──────────────────────────────────────────────────┐
│           ┌─────────────────────────┐              │
│           │      🔒 비밀번호 찾기     │              │
│           │                         │              │
│           │  가입한 이메일을 입력하면  │              │
│           │  비밀번호 재설정 링크를   │              │
│           │  보내드립니다.           │              │
│           │                         │              │
│           │  ┌───────────────────┐  │              │
│           │  │ 이메일             │  │              │
│           │  └───────────────────┘  │              │
│           │                         │              │
│           │  ┌───────────────────┐  │              │
│           │  │   재설정 링크 발송  │  │              │
│           │  └───────────────────┘  │              │
│           │                         │              │
│           │  ← 로그인으로 돌아가기   │              │
│           └─────────────────────────┘              │
└──────────────────────────────────────────────────┘
```

### 5.4 User Flow

```
                    ┌─────────┐
                    │  진입    │
                    └────┬────┘
                         │
                    ┌────┴────┐
              ┌─────┤ 인증 여부 ├─────┐
              │     └─────────┘     │
           미인증                  인증됨
              │                     │
        ┌─────┴─────┐        ┌─────┴─────┐
        │  /login    │        │ /dashboard │
        └─────┬─────┘        └───────────┘
              │
    ┌─────────┼─────────┐
    │         │         │
┌───┴───┐ ┌──┴───┐ ┌───┴────────┐
│ 로그인  │ │ 가입  │ │ 비밀번호찾기 │
│ 성공   │ │ 링크  │ │ 링크       │
└───┬───┘ └──┬───┘ └───┬────────┘
    │        │         │
    ▼        ▼         ▼
/dashboard /signup  /forgot-password
```

### 5.5 Component List

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `AuthLayout` | `(auth)/layout.tsx` | 인증 페이지 공통 레이아웃 (중앙 정렬, 카드) |
| `LoginPage` | `(auth)/login/page.tsx` | 로그인 폼 + 소셜 로그인 버튼 |
| `SignupPage` | `(auth)/signup/page.tsx` | 회원가입 폼 |
| `ForgotPasswordPage` | `(auth)/forgot-password/page.tsx` | 비밀번호 찾기 폼 |
| `ResetPasswordPage` | `(auth)/reset-password/page.tsx` | 비밀번호 재설정 폼 |
| `SocialLoginButtons` | `components/auth/SocialLoginButtons.tsx` | Google/GitHub 소셜 로그인 버튼 |
| `AuthProvider` | `components/auth/AuthProvider.tsx` | 인증 Context Provider |
| `PasswordField` | `components/auth/PasswordField.tsx` | 비밀번호 입력 (표시/숨김 토글) |

---

## 6. Error Handling

### 6.1 에러 코드 정의

| Code | Message | Cause | Handling |
|------|---------|-------|----------|
| `VALIDATION_ERROR` | 유효성 검사 실패 | 잘못된 입력 | 폼 필드에 에러 메시지 표시 |
| `INVALID_CREDENTIALS` | 이메일 또는 비밀번호가 올바르지 않습니다 | 인증 실패 | Alert 메시지 표시 |
| `CONFLICT` | 이미 등록된 이메일입니다 | 이메일 중복 | 이메일 필드에 에러 표시 |
| `TOKEN_EXPIRED` | 토큰이 만료되었습니다 | JWT 만료 | 자동 갱신 시도 → 실패 시 로그인 리다이렉트 |
| `NETWORK_ERROR` | 네트워크 오류 | 서버 연결 불가 | Snackbar로 안내 메시지 |
| `RESET_TOKEN_INVALID` | 유효하지 않은 재설정 링크 | 만료/잘못된 토큰 | 비밀번호 찾기 다시 안내 |

### 6.2 폼 유효성 검사 (Zod 스키마)

```typescript
// frontend/web/src/lib/validations/auth.ts

import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "이메일을 입력해주세요")
    .email("유효한 이메일 형식이 아닙니다"),
  password: z
    .string()
    .min(1, "비밀번호를 입력해주세요"),
});

export const signupSchema = z.object({
  name: z
    .string()
    .min(1, "이름을 입력해주세요")
    .max(50, "이름은 50자 이하여야 합니다"),
  email: z
    .string()
    .min(1, "이메일을 입력해주세요")
    .email("유효한 이메일 형식이 아닙니다"),
  password: z
    .string()
    .min(8, "비밀번호는 8자 이상이어야 합니다")
    .regex(/[a-zA-Z]/, "영문자를 포함해야 합니다")
    .regex(/[0-9]/, "숫자를 포함해야 합니다"),
  confirmPassword: z
    .string()
    .min(1, "비밀번호 확인을 입력해주세요"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "비밀번호가 일치하지 않습니다",
  path: ["confirmPassword"],
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "이메일을 입력해주세요")
    .email("유효한 이메일 형식이 아닙니다"),
});

export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "비밀번호는 8자 이상이어야 합니다")
    .regex(/[a-zA-Z]/, "영문자를 포함해야 합니다")
    .regex(/[0-9]/, "숫자를 포함해야 합니다"),
  confirmPassword: z
    .string()
    .min(1, "비밀번호 확인을 입력해주세요"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "비밀번호가 일치하지 않습니다",
  path: ["confirmPassword"],
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type SignupFormData = z.infer<typeof signupSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
```

---

## 7. Security Considerations

- [x] **입력 유효성 검사**: Zod 스키마로 클라이언트 측 검증
- [x] **XSS 방지**: JWT를 httpOnly cookie에 저장 (JavaScript 접근 불가)
- [x] **CSRF 방지**: SameSite=Strict cookie 속성
- [x] **비밀번호 정책**: 최소 8자, 영문+숫자 조합 필수
- [ ] **Rate Limiting**: Gateway에 기존 rate limiter 적용 (1000req/15min)
- [ ] **HTTPS**: 프로덕션 환경에서 필수

### 7.1 토큰 관리 전략

```typescript
// 토큰 저장: httpOnly cookie (서버에서 Set-Cookie)
// Access Token: 1시간 만료
// Refresh Token: 7일 만료

// 프론트엔드에서의 토큰 전달:
// - API 요청 시 credentials: "include"로 cookie 자동 첨부
// - OR apiClient에서 cookie에서 읽어 Authorization 헤더 추가
```

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool |
|------|--------|------|
| Unit Test | Zod 유효성 검사 스키마 | Vitest |
| Unit Test | AuthContext 로직 | Vitest + Testing Library |
| Component Test | 로그인/회원가입 폼 렌더링 | Vitest + Testing Library |
| E2E Test | 로그인 → 대시보드 플로우 | Playwright |

### 8.2 Test Cases (Key)

- [ ] Happy path: 올바른 이메일/비밀번호 입력 → 로그인 성공 → 대시보드 리다이렉트
- [ ] Happy path: 회원가입 → 로그인 페이지 리다이렉트
- [ ] Error: 빈 이메일/비밀번호 → 유효성 검사 에러 메시지 표시
- [ ] Error: 잘못된 이메일 형식 → 에러 메시지 표시
- [ ] Error: 비밀번호 8자 미만 → 에러 메시지 표시
- [ ] Error: 비밀번호 불일치 (회원가입) → 에러 메시지 표시
- [ ] Edge: 미인증 사용자 대시보드 접근 → 로그인 페이지 리다이렉트
- [ ] Edge: 인증된 사용자 로그인 페이지 접근 → 대시보드 리다이렉트

---

## 9. Clean Architecture

### 9.1 Layer Structure

| Layer | Responsibility | Location |
|-------|---------------|----------|
| **Presentation** | 인증 페이지, 폼 컴포넌트, AuthProvider | `src/app/(auth)/`, `src/components/auth/` |
| **Application** | 인증 훅 (useAuth, useLogin, useSignup) | `src/hooks/useAuth.ts` |
| **Domain** | 인증 타입 (User, LoginInput, AuthState) | `@trustee/types` (`src/auth.ts`) |
| **Infrastructure** | 인증 API 클라이언트 | `src/lib/api/auth.ts` |

### 9.2 This Feature's Layer Assignment

| Component | Layer | Location |
|-----------|-------|----------|
| `LoginPage`, `SignupPage` 등 | Presentation | `src/app/(auth)/*/page.tsx` |
| `AuthProvider` | Presentation | `src/components/auth/AuthProvider.tsx` |
| `SocialLoginButtons` | Presentation | `src/components/auth/SocialLoginButtons.tsx` |
| `PasswordField` | Presentation | `src/components/auth/PasswordField.tsx` |
| `useAuth` | Application | `src/hooks/useAuth.ts` |
| `User`, `LoginInput` 등 | Domain | `@trustee/types` |
| `authApi` | Infrastructure | `src/lib/api/auth.ts` |
| Zod 스키마 | Domain | `src/lib/validations/auth.ts` |
| `middleware.ts` | Infrastructure | `src/middleware.ts` |

---

## 10. Coding Convention Reference

### 10.1 This Feature's Conventions

| Item | Convention Applied |
|------|-------------------|
| Component naming | PascalCase (`LoginPage`, `AuthProvider`) |
| File organization | `(auth)/` 라우트 그룹, `components/auth/` 공유 컴포넌트 |
| State management | React Context (`AuthProvider`) + React Query (API 캐시) |
| Error handling | Zod 유효성 검사 + ApiError 캐치 + Alert/Snackbar |
| Hook naming | `useAuth`, `useLogin`, `useSignup` |
| API object | `authApi` in `lib/api/auth.ts` |
| Query key | `AUTH_KEY = ["auth"]` |

---

## 11. Implementation Guide

### 11.1 File Structure

```
frontend/web/src/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx                    # 인증 공통 레이아웃
│   │   ├── login/
│   │   │   └── page.tsx                  # 로그인 페이지
│   │   ├── signup/
│   │   │   └── page.tsx                  # 회원가입 페이지
│   │   ├── forgot-password/
│   │   │   └── page.tsx                  # 비밀번호 찾기
│   │   └── reset-password/
│   │       └── page.tsx                  # 비밀번호 재설정
│   ├── (dashboard)/
│   │   └── layout.tsx                    # (기존) 대시보드 레이아웃
│   └── layout.tsx                        # (수정) AuthProvider 추가
├── components/
│   └── auth/
│       ├── AuthProvider.tsx              # 인증 Context Provider
│       ├── SocialLoginButtons.tsx        # 소셜 로그인 버튼
│       └── PasswordField.tsx             # 비밀번호 필드 (표시/숨김)
├── hooks/
│   ├── useAuth.ts                        # 인증 훅
│   └── index.ts                          # (수정) useAuth export 추가
├── lib/
│   ├── api/
│   │   ├── auth.ts                       # 인증 API 클라이언트
│   │   ├── client.ts                     # (수정) 인증 헤더 + 401 처리
│   │   └── index.ts                      # (수정) authApi export 추가
│   └── validations/
│       └── auth.ts                       # Zod 유효성 검사 스키마
└── middleware.ts                          # Next.js 라우트 보호
```

### 11.2 Implementation Order

1. [ ] **타입 정의**: `@trustee/types`에 인증 타입 추가 (`User`, `LoginInput`, `AuthResponse` 등)
2. [ ] **Zod 스키마**: `lib/validations/auth.ts` - 폼 유효성 검사 스키마
3. [ ] **API 클라이언트**: `lib/api/auth.ts` - 인증 API 호출 함수
4. [ ] **API 클라이언트 수정**: `lib/api/client.ts` - 인증 헤더 + 401 인터셉터
5. [ ] **AuthProvider**: `components/auth/AuthProvider.tsx` - 인증 Context
6. [ ] **useAuth 훅**: `hooks/useAuth.ts` - 인증 상태 접근 훅
7. [ ] **공통 컴포넌트**: `PasswordField`, `SocialLoginButtons`
8. [ ] **인증 레이아웃**: `(auth)/layout.tsx` - 중앙 정렬 카드 레이아웃
9. [ ] **로그인 페이지**: `(auth)/login/page.tsx`
10. [ ] **회원가입 페이지**: `(auth)/signup/page.tsx`
11. [ ] **비밀번호 찾기**: `(auth)/forgot-password/page.tsx`
12. [ ] **비밀번호 재설정**: `(auth)/reset-password/page.tsx`
13. [ ] **루트 레이아웃 수정**: `app/layout.tsx` - AuthProvider 래핑
14. [ ] **미들웨어**: `middleware.ts` - 라우트 보호
15. [ ] **대시보드 레이아웃 수정**: 로그아웃 버튼 추가

### 11.3 주요 구현 상세

#### AuthProvider 구조

```typescript
// components/auth/AuthProvider.tsx
"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { User, LoginInput, SignupInput } from "@trustee/types";
import { authApi } from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (data: LoginInput) => Promise<void>;
  signup: (data: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // user 상태 관리
  // 마운트 시 /api/auth/me 호출로 현재 사용자 확인
  // login: API 호출 → 토큰 cookie 저장 → user 상태 업데이트
  // logout: API 호출 → cookie 삭제 → /login 리다이렉트
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
```

#### middleware.ts 라우트 보호

```typescript
// frontend/web/src/middleware.ts
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("accessToken")?.value;

  // 공개 경로: 토큰 있으면 대시보드로
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    if (token) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // 보호 경로: 토큰 없으면 로그인으로
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

#### API 클라이언트 인증 헤더 추가

```typescript
// lib/api/client.ts 수정 사항
// request() 메서드에 credentials: "include" 추가
// 401 응답 시 /login 리다이렉트 또는 refresh 시도
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-02-16 | Initial draft | AI |
