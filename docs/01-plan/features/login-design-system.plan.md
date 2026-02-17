# Plan: 로그인 페이지 디자인 시스템 적용

## 개요
현재 구축된 Linear Dark Theme 디자인 시스템을 기반으로 모든 인증(Auth) 관련 페이지를 리팩토링한다.
기존 로그인/회원가입/비밀번호 찾기/비밀번호 재설정 페이지가 라이트 테마 가정 하에 작성되어 있어, 디자인 시스템의 다크 테마 토큰과 공유 컴포넌트를 일관되게 적용한다.

## 목표
1. 모든 Auth 페이지에 디자인 시스템 토큰(colors, typography, radius) 일관 적용
2. `@trustee/ui` 공유 컴포넌트 최대 활용 (직접 MUI import 최소화)
3. SocialLoginButtons의 하드코딩된 라이트 테마 색상을 다크 테마에 맞게 수정
4. Auth Layout을 디자인 시스템에 맞게 개선

## 변경 대상 파일

### 1. Auth Layout
- **파일**: `frontend/web/src/app/(auth)/layout.tsx`
- **현재 문제**: 기본 MUI Paper 사용, 디자인 토큰 미적용
- **변경 내용**:
  - `colors.bg.primary` 배경색 명시 적용
  - Paper → 디자인 시스템 토큰 기반 스타일링 (bg.level1, border.primary, radius)
  - 시스템 로고/브랜딩 영역 추가 고려

### 2. 로그인 페이지
- **파일**: `frontend/web/src/app/(auth)/login/page.tsx`
- **현재 문제**:
  - MUI `Checkbox`, `FormControlLabel` 직접 사용 → `FormCheckbox` 미사용
  - `Typography`, `Box`, `Stack` 등 MUI 직접 import → `@trustee/ui` re-export 활용 가능
  - `sx` prop으로 인라인 스타일 과다 사용
- **변경 내용**:
  - MUI 직접 import → `@trustee/ui` re-export 사용으로 전환
  - "로그인 상태 유지" Checkbox → `FormCheckbox` 컴포넌트 사용
  - 링크 스타일에 `colors.link.primary/hover` 토큰 적용
  - Button의 `sx` 스타일 간소화 (테마에서 이미 처리)

### 3. 회원가입 페이지
- **파일**: `frontend/web/src/app/(auth)/signup/page.tsx`
- **현재 문제**: MUI 직접 import, 인라인 스타일
- **변경 내용**:
  - MUI 직접 import → `@trustee/ui` re-export 사용
  - 링크 스타일 토큰 적용
  - Button sx 스타일 간소화

### 4. 비밀번호 찾기 페이지
- **파일**: `frontend/web/src/app/(auth)/forgot-password/page.tsx`
- **현재 문제**: MUI 직접 import, 인라인 스타일
- **변경 내용**:
  - MUI 직접 import → `@trustee/ui` re-export 사용
  - 성공 상태 UI 디자인 시스템 적용
  - 링크 스타일 토큰 적용

### 5. 비밀번호 재설정 페이지
- **파일**: `frontend/web/src/app/(auth)/reset-password/page.tsx`
- **현재 문제**: MUI 직접 import, 인라인 스타일
- **변경 내용**:
  - MUI 직접 import → `@trustee/ui` re-export 사용
  - 에러 상태(유효하지 않은 링크) UI 디자인 시스템 적용
  - 링크 스타일 토큰 적용

### 6. SocialLoginButtons 컴포넌트
- **파일**: `frontend/web/src/components/auth/SocialLoginButtons.tsx`
- **현재 문제**:
  - 하드코딩된 라이트 테마 색상 사용 (`#dadce0`, `#3c4043`, `#f8f9fa` 등)
  - MUI Button 직접 import → `@trustee/ui` Button 미사용
  - Divider/Typography 직접 import
- **변경 내용**:
  - 모든 하드코딩 색상 → 디자인 시스템 토큰 사용 (colors.border, colors.fg 등)
  - `@trustee/ui`의 Button 사용
  - 다크 테마에 적합한 소셜 로그인 버튼 스타일

### 7. PasswordField 컴포넌트
- **파일**: `frontend/web/src/components/auth/PasswordField.tsx`
- **현재 문제**: MUI IconButton 직접 import
- **변경 내용**:
  - MUI IconButton → `@trustee/ui` IconButton 사용 검토
  - 테마 토큰 기반 스타일 확인

## 구현 순서
1. Auth Layout 수정 (기반 레이아웃)
2. SocialLoginButtons 다크 테마 적용 (공유 컴포넌트)
3. PasswordField 정리 (공유 컴포넌트)
4. 로그인 페이지 수정
5. 회원가입 페이지 수정
6. 비밀번호 찾기 페이지 수정
7. 비밀번호 재설정 페이지 수정

## 변경하지 않는 것
- 비즈니스 로직 (useAuth, authApi, validation schema)
- 라우팅 구조 ((auth) 그룹)
- AuthProvider 컴포넌트
- 기능 동작 (폼 제출, 에러 처리, 리다이렉트)

## 완료 조건
- [ ] 모든 Auth 페이지가 디자인 시스템 다크 테마로 통일
- [ ] 하드코딩된 색상값 0개 (디자인 토큰만 사용)
- [ ] MUI 직접 import 최소화 (@trustee/ui re-export 우선)
- [ ] TypeScript 에러 없음
- [ ] 기존 기능 동작 유지 (로그인, 회원가입, 비밀번호 찾기/재설정)
