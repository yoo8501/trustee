# 로그인 화면 구현 Planning Document

> **Summary**: 이메일/비밀번호 인증 및 소셜 로그인을 포함한 인증 화면 전체 구현
>
> **Project**: 수탁사 관리 시스템 (Trustee Management System)
> **Version**: 0.0.0
> **Author**: AI
> **Date**: 2026-02-16
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

수탁사 관리 시스템에 접근하는 사용자를 인증하기 위한 로그인, 회원가입, 비밀번호 찾기 화면을 구현한다. 현재 시스템은 인증 없이 모든 요청을 허용하고 있어(`authMiddleware` placeholder 상태), 이를 실제 인증 흐름으로 교체한다.

### 1.2 Background

- CLAUDE.md에 "인증: 추후 추가 예정"으로 명시되어 있음
- Gateway의 `authMiddleware`가 현재 모든 요청을 통과시키는 placeholder 상태
- API 클라이언트(`lib/api/client.ts`)에 인증 토큰 처리 로직 없음
- 프론트엔드는 아직 기본 Next.js 템플릿 상태

### 1.3 Related Documents

- `docs/architecture/ARCHITECTURE.md` - 전체 아키텍처
- `docs/guides/CONVENTIONS.md` - 코딩 컨벤션
- `backend/services/gateway/src/middleware/auth.ts` - 현재 인증 미들웨어 (placeholder)

---

## 2. Scope

### 2.1 In Scope

- [ ] 로그인 페이지 UI (이메일/비밀번호)
- [ ] 소셜 로그인 UI (Google, GitHub 버튼)
- [ ] 회원가입 페이지 UI
- [ ] 비밀번호 찾기 페이지 UI
- [ ] 폼 유효성 검사 (React Hook Form + Zod)
- [ ] 인증 상태 관리 (JWT 토큰 저장/갱신)
- [ ] API 클라이언트에 인증 헤더 추가
- [ ] 인증되지 않은 사용자 리다이렉트
- [ ] Gateway authMiddleware JWT 검증 구현

### 2.2 Out of Scope

- 백엔드 사용자 서비스 (user-service) 신규 구축 (별도 PDCA에서 진행)
- 이메일 발송 서비스 (비밀번호 재설정 이메일)
- 2단계 인증 (2FA)
- 역할 기반 접근 제어 (RBAC)
- 소셜 로그인 백엔드 OAuth 콜백 처리

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 이메일/비밀번호 로그인 폼 | High | Pending |
| FR-02 | Google 소셜 로그인 버튼 | Medium | Pending |
| FR-03 | GitHub 소셜 로그인 버튼 | Medium | Pending |
| FR-04 | 회원가입 폼 (이메일, 비밀번호, 이름) | High | Pending |
| FR-05 | 비밀번호 찾기 폼 (이메일 입력) | Medium | Pending |
| FR-06 | 비밀번호 재설정 폼 (새 비밀번호 입력) | Medium | Pending |
| FR-07 | 로그인 성공 시 대시보드로 리다이렉트 | High | Pending |
| FR-08 | 미인증 사용자 로그인 페이지로 리다이렉트 | High | Pending |
| FR-09 | JWT Access Token을 API 요청에 자동 첨부 | High | Pending |
| FR-10 | 로그아웃 기능 | High | Pending |
| FR-11 | "비밀번호 기억하기" 체크박스 | Low | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 로그인 페이지 초기 로딩 < 2초 | Lighthouse |
| Security | 비밀번호 최소 8자, 영문+숫자 조합 | Zod validation |
| Security | JWT 토큰 localStorage 미사용 (httpOnly cookie 또는 메모리) | 코드 리뷰 |
| Accessibility | 키보드 네비게이션 지원 | 수동 테스트 |
| UX | 폼 에러 메시지 실시간 표시 | 수동 테스트 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 로그인/회원가입/비밀번호 찾기 3개 화면 구현 완료
- [ ] React Hook Form + Zod 유효성 검사 동작
- [ ] 소셜 로그인 버튼 UI 렌더링
- [ ] 인증 상태에 따른 라우트 보호 동작
- [ ] TypeScript 에러 없음
- [ ] ESLint 통과

### 4.2 Quality Criteria

- [ ] MUI 컴포넌트 + 프로젝트 디자인 시스템 일관성
- [ ] 반응형 레이아웃 (모바일/데스크톱)
- [ ] 에러 상태 처리 (네트워크 오류, 잘못된 인증 정보)
- [ ] 빌드 성공

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 백엔드 인증 서비스 미구축 | High | High | 프론트엔드 UI 먼저 구현, API는 mock/placeholder 사용 |
| 소셜 로그인 OAuth 설정 복잡도 | Medium | Medium | 버튼 UI만 우선 구현, 실제 OAuth 플로우는 백엔드 준비 후 연동 |
| JWT 토큰 보안 관리 | High | Medium | httpOnly cookie 또는 메모리 기반 토큰 관리로 XSS 방지 |
| Next.js 15 미들웨어 호환성 | Medium | Low | Next.js middleware를 활용한 서버 사이드 라우트 보호 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure | Static sites | |
| **Dynamic** | Feature-based modules, BaaS integration | Web apps with backend | **V** |
| **Enterprise** | Strict layer separation, DI, microservices | High-traffic systems | |

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Framework | Next.js 15 | Next.js 15 | 프로젝트 기존 스택 |
| UI Library | MUI + Tailwind | MUI + Tailwind | 프로젝트 기존 스택 |
| Form | React Hook Form + Zod | React Hook Form + Zod | 프로젝트 기존 스택 |
| 인증 상태 관리 | Context / Zustand / React Query | React Context | 인증 상태는 전역이며 단순 구조로 충분 |
| 토큰 저장 | localStorage / cookie / memory | cookie (httpOnly) | XSS 방어, Next.js middleware 호환 |
| 라우트 보호 | Client-side / Next.js middleware | Next.js middleware | SSR 단계에서 미인증 차단 |

### 6.3 페이지 구조

```
frontend/web/src/app/
├── (auth)/                    # 인증 레이아웃 그룹 (사이드바 없음)
│   ├── layout.tsx             # 인증 페이지 전용 레이아웃
│   ├── login/
│   │   └── page.tsx           # 로그인 페이지
│   ├── signup/
│   │   └── page.tsx           # 회원가입 페이지
│   ├── forgot-password/
│   │   └── page.tsx           # 비밀번호 찾기 페이지
│   └── reset-password/
│       └── page.tsx           # 비밀번호 재설정 페이지
├── (dashboard)/               # 기존 대시보드 (인증 필요)
│   ├── layout.tsx
│   └── ...
└── middleware.ts               # 인증 라우트 보호
```

### 6.4 인증 흐름

```
[로그인 페이지] → POST /api/auth/login → JWT 발급 → cookie 저장 → 대시보드 리다이렉트
                                                           ↓
[API 요청] → apiClient → Authorization 헤더 자동 첨부 → Gateway → authMiddleware → 서비스
                                                           ↓
[토큰 만료] → 401 응답 → Refresh Token으로 갱신 → 재시도 (또는 로그인 리다이렉트)
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md` has coding conventions section
- [x] `docs/guides/CONVENTIONS.md` exists
- [x] ESLint configuration (`.eslintrc.*`)
- [x] TypeScript configuration (`tsconfig.json`)
- [x] Tailwind configuration (`tailwind.config.ts`)

### 7.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| **Auth 패턴** | Missing | AuthContext, useAuth 훅, ProtectedRoute 패턴 | High |
| **API 인증 헤더** | Missing | apiClient에 토큰 자동 첨부 로직 | High |
| **에러 처리** | Exists (ApiError) | 401 자동 리다이렉트 인터셉터 | Medium |
| **폼 유효성** | Exists (Zod) | 인증 관련 Zod 스키마 정의 | Medium |

### 7.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `NEXT_PUBLIC_API_URL` | API Gateway URL | Client | 기존 |
| `AUTH_SECRET` | JWT 서명 키 | Server | V |
| `GOOGLE_CLIENT_ID` | Google OAuth | Server | V |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | Server | V |
| `GITHUB_CLIENT_ID` | GitHub OAuth | Server | V |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth | Server | V |

---

## 8. Next Steps

1. [ ] Design 문서 작성 (`/pdca design login`)
2. [ ] 컴포넌트 상세 설계 (로그인/회원가입/비밀번호 찾기 폼)
3. [ ] API 인터페이스 정의 (auth endpoints)
4. [ ] 구현 시작

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-02-16 | Initial draft | AI |
