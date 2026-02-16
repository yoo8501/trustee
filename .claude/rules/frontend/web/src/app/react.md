# React Rules

## 컴포넌트 구조
- 클라이언트 컴포넌트는 "use client" 선언
- Props는 interface로 정의
- 컴포넌트 파일명은 PascalCase

## 상태 관리
- 서버 상태: React Query (TanStack Query) 사용
- 폼 상태: React Hook Form + Zod 사용
- 로컬 상태: useState, useReducer

## 스타일링
- MUI 컴포넌트 우선 사용
- 커스텀 스타일은 Tailwind CSS 사용
- sx prop과 className 혼용 가능

## 패턴
- 커스텀 훅은 use 접두사 (useTrustees, useAuth)
- 이벤트 핸들러는 handle 접두사 (handleSubmit, handleClick)
- 조건부 렌더링은 early return 패턴 선호
