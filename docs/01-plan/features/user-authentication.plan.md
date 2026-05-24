# Plan: user-authentication (사용자 인증 및 권한 관리)

> **Summary**: DocFlow 문서관리시스템의 회원가입, 로그인, JWT 인증, 역할 기반 권한 관리 기능
>
> **Project**: DocFlow
> **Author**: seosangjun
> **Date**: 2026-03-22
> **Status**: Draft
> **Level**: Dynamic
> **Parent**: [document-management-system.plan.md](./document-management-system.plan.md)

---

## 1. 개요

### 1.1 목적

DocFlow 시스템의 모든 기능이 의존하는 인증/인가 기반을 구축한다.
회원가입, 로그인, JWT 기반 세션 관리, 역할(admin/user) 기반 권한 제어를 구현한다.

### 1.2 배경

- 문서 관리, 결재 등 모든 핵심 기능이 인증된 사용자를 전제로 동작
- SaaS 멀티테넌시 구조에서 테넌트별 데이터 격리가 인증 레이어에서 시작됨
- 인증/권한 기능이 완성되어야 이후 문서 관리 기능 개발 가능

### 1.3 관련 문서

- 상위 Plan: [document-management-system.plan.md](./document-management-system.plan.md) (섹션 2, 8.1, 8.6)
- Design: [document-management-system.design.md](../../02-design/features/document-management-system.design.md) (섹션 4.2, 5.3)

---

## 2. 범위

### 2.1 포함 (In Scope)

- [x] 테넌트(회사) 생성 (첫 가입 시 자동 생성)
- [x] 회원가입 (이메일/비밀번호)
- [x] 로그인 / 로그아웃
- [x] JWT 토큰 발급 (Access + Refresh)
- [x] 인증 미들웨어 (토큰 검증, tenant_id 추출)
- [x] 역할 기반 권한 (admin/user)
- [x] 내 정보 조회/수정
- [x] 비밀번호 변경
- [x] 사용자 관리 (관리자 전용: 목록 조회, 역할 변경)
- [x] 프론트엔드 로그인/회원가입 페이지
- [x] 프론트엔드 인증 상태 관리 (토큰 저장, 자동 갱신)
- [x] 인증 필요 라우트 보호 (미인증 시 로그인 리다이렉트)

### 2.2 제외 (Out of Scope)

- 소셜 로그인 (Google, GitHub 등)
- 이메일 인증 / 비밀번호 찾기 (이메일 발송)
- 2단계 인증 (2FA/MFA)
- 테넌트 초대 시스템 (초대 링크로 팀원 추가)
- SSO (SAML, OIDC 연동)

---

## 3. 요구사항

### 3.1 기능 요구사항

| ID | 요구사항 | 우선순위 | 상태 |
|----|----------|----------|------|
| FR-01 | 이메일+비밀번호로 회원가입 (테넌트 자동 생성) | High | Pending |
| FR-02 | 이메일+비밀번호로 로그인 시 JWT 발급 | High | Pending |
| FR-03 | Access Token (1시간) + Refresh Token (7일) 이중 토큰 | High | Pending |
| FR-04 | 모든 API 요청에서 JWT 검증 미들웨어 적용 | High | Pending |
| FR-05 | JWT에서 tenant_id 추출하여 RLS 적용 | High | Pending |
| FR-06 | 역할(admin/user) 기반 API 접근 제어 | High | Pending |
| FR-07 | 내 정보 조회 (GET /api/users/me) | Medium | Pending |
| FR-08 | 내 정보 수정 (이름 변경) | Medium | Pending |
| FR-09 | 비밀번호 변경 (현재 비밀번호 확인 후) | Medium | Pending |
| FR-10 | 사용자 목록 조회 (관리자 전용) | Medium | Pending |
| FR-11 | 사용자 역할 변경 (관리자 전용) | Medium | Pending |
| FR-12 | 로그아웃 (클라이언트 토큰 삭제) | High | Pending |
| FR-13 | 프론트엔드 로그인/회원가입 폼 (React Hook Form + Zod) | High | Pending |
| FR-14 | 미인증 사용자 라우트 보호 (로그인 리다이렉트) | High | Pending |
| FR-15 | Access Token 만료 시 Refresh Token으로 자동 갱신 | High | Pending |

### 3.2 비기능 요구사항

| 항목 | 기준 | 검증 방법 |
|------|------|----------|
| 보안 | 비밀번호 bcrypt 해싱 (cost=12) | 코드 리뷰 |
| 보안 | JWT httpOnly 쿠키 저장 (XSS 방지) | 브라우저 DevTools 확인 |
| 보안 | CSRF: SameSite=Strict + Origin 검증 | E2E 테스트 |
| 보안 | 로그인 Rate Limiting (5회/분) | 부하 테스트 |
| 성능 | 로그인 응답 500ms 이내 | API 테스트 |
| 성능 | 토큰 검증 10ms 이내 | 미들웨어 벤치마크 |
| 검증 | 비밀번호 최소 8자, 영문+숫자 포함 | 단위 테스트 |
| 검증 | 이메일 형식 검증 | 단위 테스트 |

---

## 4. 사용자 및 권한

### 4.1 역할 정의

| 역할 | 설명 | 자동 부여 조건 |
|------|------|---------------|
| admin | 테넌트 관리자 | 첫 가입자 (테넌트 생성자) |
| user | 일반 사용자 | 이후 가입자 기본값 |

### 4.2 API 권한 매트릭스

| API | 미인증 | user | admin |
|-----|--------|------|-------|
| POST /api/auth/register | ✅ | - | - |
| POST /api/auth/login | ✅ | - | - |
| POST /api/auth/refresh | ✅ | - | - |
| POST /api/auth/logout | - | ✅ | ✅ |
| GET /api/users/me | - | ✅ | ✅ |
| PATCH /api/users/me | - | ✅ | ✅ |
| PATCH /api/users/me/password | - | ✅ | ✅ |
| GET /api/users | - | ❌ | ✅ |
| PATCH /api/users/:id | - | ❌ | ✅ |

---

## 5. 페이지 구성

| 페이지 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| 로그인 | `/login` | 불필요 | 이메일/비밀번호 로그인 폼 |
| 회원가입 | `/register` | 불필요 | 이름, 이메일, 비밀번호, 회사명 |
| 내 정보 | `/profile` | 필요 | 프로필 수정, 비밀번호 변경 |
| 사용자 관리 | `/admin/users` | admin만 | 사용자 목록, 역할 변경 |

---

## 6. 완료 기준

### 6.1 Definition of Done

- [ ] 모든 기능 요구사항(FR-01~FR-15) 구현 완료
- [ ] Go 백엔드 테스트 통과 (Service 레이어)
- [ ] TypeScript 에러 없음
- [ ] ESLint 통과
- [ ] 콘솔 에러 없음

### 6.2 품질 기준

- [ ] 비밀번호가 평문으로 저장/전송/로깅되지 않음
- [ ] JWT 시크릿이 코드에 하드코딩되지 않음
- [ ] 토큰 만료 후 자동 갱신 정상 동작
- [ ] 관리자 전용 API에 일반 사용자 접근 시 403 반환

---

## 7. 리스크 및 대응

| 리스크 | 영향 | 가능성 | 대응 방안 |
|--------|------|--------|----------|
| JWT 시크릿 유출 | High | Low | 환경변수 관리, 시크릿 로테이션 고려 |
| Refresh Token 탈취 | High | Low | httpOnly + Secure + SameSite 쿠키 |
| 무차별 대입 공격 | Medium | Medium | Rate Limiting (5회/분) |
| 테넌트 간 데이터 노출 | High | Low | RLS 정책 + 미들웨어 이중 검증 |

---

## 8. 기술 결정

| 결정 | 선택지 | 선택 | 이유 |
|------|--------|------|------|
| 인증 방식 | JWT / Session | JWT | SaaS 멀티테넌시, 상태 비저장 |
| 토큰 저장 | httpOnly 쿠키 / localStorage | httpOnly 쿠키 | XSS 방지 |
| 해싱 | bcrypt / argon2 | bcrypt | Go 표준 라이브러리 지원, 충분한 보안 |
| 폼 검증 | Zod / Yup | Zod | TypeScript 네이티브, 작은 번들 |
| 상태 관리 | TanStack Query / Context | TanStack Query | 서버 상태 캐싱, 자동 갱신 |

---

## 9. 구현 순서

1. [ ] 인프라 초기화 (Docker Compose: Go + PostgreSQL + Next.js)
2. [ ] DB 마이그레이션 (tenants, users 테이블)
3. [ ] sqlc 쿼리 작성 (users CRUD)
4. [ ] 인증 API 구현 (register, login, refresh, logout)
5. [ ] JWT 미들웨어 구현 (토큰 검증, tenant_id 추출)
6. [ ] 권한 미들웨어 구현 (역할 체크)
7. [ ] 사용자 관리 API (me, users 목록, 역할 변경)
8. [ ] 프론트엔드 초기화 (Next.js + MUI + TanStack Query)
9. [ ] 로그인/회원가입 페이지
10. [ ] API 클라이언트 (Axios 인터셉터, 토큰 자동 갱신)
11. [ ] 라우트 보호 (AuthGuard)
12. [ ] 내 정보/사용자 관리 페이지

---

## Version History

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|----------|--------|
| 0.1 | 2026-03-22 | 초안 작성 | seosangjun |
