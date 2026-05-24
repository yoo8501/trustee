# DocFlow - 문서관리시스템 (Document Management System)

## 프로젝트 개요
여러 회사가 사용할 수 있는 SaaS 문서관리시스템. 문서 업로드/다운로드, 폴더 분류, 버전 관리, 결재/승인 워크플로우를 지원한다.

## 기술 스택
- **Backend**: Go + Gin (REST API)
- **DB**: PostgreSQL + sqlc + golang-migrate
- **Frontend**: Next.js 15 (App Router) + TypeScript
- **UI**: MUI (Material-UI)
- **상태관리**: TanStack Query (React Query)
- **폼 관리**: React Hook Form + Zod
- **인증**: Go 서버 JWT 직접 구현
- **파일 저장**: 로컬 → AWS S3 전환 (스토리지 인터페이스 추상화)

## Definition of Done
- [ ] 모든 테스트 통과
- [ ] TypeScript 에러 없음
- [ ] ESLint 통과
- [ ] 콘솔 에러 없음
- [ ] 코드 리뷰 완료

## 참조 문서
@docs/01-plan/features/document-management-system.plan.md

## 주의
질문과 답변은 한글로 해라
