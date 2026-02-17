# 수탁사 관리 시스템 - 3주 개발 계획

## 현재 완료된 것

- [x] 모노레포 구조 (`pnpm workspaces`)
- [x] Prisma 스키마 (Trustee, Contract, Inspection, InspectionItem)
- [x] 공유 타입 (`@trustee/types`)
- [x] UI 컴포넌트 라이브러리 (`@trustee/ui` - Button, DataTable, Dialog, Form, Layout)
- [x] 설정 패키지 (`@trustee/config`)
- [x] Next.js 15 + React 19 앱 스캐폴딩

---

## 1주차: 핵심 CRUD + 대시보드

### Day 1-2: DB 연동 & API 라우트 (수탁사)

- [ ] MySQL 로컬 DB 세팅 & `pnpm db:push`로 스키마 반영
- [ ] `app/api/trustees/route.ts` - GET (목록, 검색/필터/페이지네이션), POST (생성)
- [ ] `app/api/trustees/[id]/route.ts` - GET (상세), PATCH (수정), DELETE (삭제)
- [ ] Zod 스키마로 요청 유효성 검증 (`lib/validations/trustee.ts`)
- [ ] API 에러 핸들링 유틸리티 (`lib/api-helpers.ts`)

### Day 3: React Query 훅 & 수탁사 목록 페이지

- [ ] `hooks/useTrustees.ts` - useQuery/useMutation 훅
- [ ] `app/(dashboard)/layout.tsx` - Layout 컴포넌트 연동 (사이드바 네비게이션)
- [ ] `app/(dashboard)/trustees/page.tsx` - 수탁사 목록 (DataTable, 검색, 필터, 페이지네이션)
- [ ] `app/(dashboard)/trustees/loading.tsx` - 로딩 UI

### Day 4: 수탁사 생성/수정/상세

- [ ] `app/(dashboard)/trustees/new/page.tsx` - 수탁사 등록 폼 (React Hook Form + Zod)
- [ ] `app/(dashboard)/trustees/[id]/page.tsx` - 수탁사 상세 페이지
- [ ] `app/(dashboard)/trustees/[id]/edit/page.tsx` - 수탁사 수정 폼
- [ ] 삭제 확인 다이얼로그 (Dialog 컴포넌트 활용)

### Day 5: 대시보드 메인 페이지

- [ ] `app/api/dashboard/route.ts` - 통계 API (수탁사 수, 계약 만료 예정, 점검 현황 등)
- [ ] `app/(dashboard)/page.tsx` - 대시보드 (요약 카드, 최근 활동)
- [ ] `components/dashboard/StatCard.tsx` - 통계 카드 컴포넌트
- [ ] `components/dashboard/RecentActivity.tsx` - 최근 활동 목록

---

## 2주차: 계약 관리 + 점검 관리

### Day 6-7: 계약 관리 CRUD

- [ ] `app/api/contracts/route.ts` - GET, POST
- [ ] `app/api/contracts/[id]/route.ts` - GET, PATCH, DELETE
- [ ] `lib/validations/contract.ts` - Zod 스키마
- [ ] `hooks/useContracts.ts` - React Query 훅
- [ ] `app/(dashboard)/contracts/page.tsx` - 계약 목록 (만료일 기준 정렬, 상태 필터)
- [ ] `app/(dashboard)/contracts/new/page.tsx` - 계약 등록 (수탁사 선택, 날짜, 파일 URL)
- [ ] `app/(dashboard)/contracts/[id]/page.tsx` - 계약 상세
- [ ] `app/(dashboard)/contracts/[id]/edit/page.tsx` - 계약 수정
- [ ] 계약 만료 임박 알림 배지 (30일 이내)

### Day 8-9: 점검 관리 CRUD

- [ ] `app/api/inspections/route.ts` - GET, POST
- [ ] `app/api/inspections/[id]/route.ts` - GET, PATCH, DELETE
- [ ] `app/api/inspections/[id]/items/route.ts` - 점검 항목 CRUD
- [ ] `lib/validations/inspection.ts` - Zod 스키마
- [ ] `hooks/useInspections.ts` - React Query 훅
- [ ] `app/(dashboard)/inspections/page.tsx` - 점검 목록 (상태별 필터, 날짜 정렬)
- [ ] `app/(dashboard)/inspections/new/page.tsx` - 점검 등록 (수탁사 선택, 항목 동적 추가)
- [ ] `app/(dashboard)/inspections/[id]/page.tsx` - 점검 상세 (항목별 결과 표시)
- [ ] `app/(dashboard)/inspections/[id]/edit/page.tsx` - 점검 수정

### Day 10: 수탁사 상세 페이지 확장

- [ ] 수탁사 상세에서 관련 계약 목록 탭 표시
- [ ] 수탁사 상세에서 관련 점검 목록 탭 표시
- [ ] 수탁사별 점검 점수 추이 차트
- [ ] 관계 데이터 프리패칭 (React Query)

---

## 3주차: 인증 + 고도화 + 배포 준비

### Day 11-12: 인증 시스템

- [ ] NextAuth.js (또는 자체 JWT) 도입
- [ ] `app/api/auth/[...nextauth]/route.ts` - 인증 API
- [ ] `app/login/page.tsx` - 로그인 페이지
- [ ] `middleware.ts` - 인증 미들웨어 (보호된 라우트)
- [ ] Prisma에 User 모델 추가 (email, password, role)
- [ ] 로그인/로그아웃 UI (Layout 헤더)

### Day 13: UX 고도화

- [ ] `app/not-found.tsx` - 404 페이지
- [ ] `app/error.tsx` - 글로벌 에러 바운더리
- [ ] 토스트 알림 (생성/수정/삭제 성공/실패)
- [ ] 테이블 빈 상태 & 에러 상태 UI
- [ ] 반응형 레이아웃 점검 (모바일/태블릿)
- [ ] 검색 디바운싱, 낙관적 업데이트

### Day 14: 테스트 & 품질

- [ ] ESLint 전체 통과 확인 (`pnpm -r lint`)
- [ ] TypeScript 에러 제로 (`pnpm -r type-check`)
- [ ] 주요 API 라우트 유닛 테스트 (Vitest)
- [ ] 주요 컴포넌트 테스트 (React Testing Library)
- [ ] Prisma seed 스크립트 (초기 데이터)

### Day 15: 배포 준비

- [ ] 환경변수 정리 (`.env.example`)
- [ ] 프로덕션 빌드 테스트 (`pnpm build`)
- [ ] Docker Compose (Next.js + MySQL) 또는 Vercel 배포 설정
- [ ] 최종 코드 리뷰 & 정리

---

## 컨텍스트 엔지니어링 활용 전략

| 접근법 | 적용 방식 |
|--------|-----------|
| **CLAUDE.md** | 프로젝트 규칙, 기술 스택, DoD를 명시하여 일관된 코드 생성 |
| **rules/** | 디렉토리별 규칙 파일로 API, React 패턴 자동 적용 |
| **skills/** | `/code-review` 스킬로 매 기능 완료 시 자동 품질 검증 |
| **@docs 참조** | ARCHITECTURE.md, CONVENTIONS.md로 구조/컨벤션 준수 |
| **타입 공유** | `@trustee/types`로 프론트/백엔드 타입 일관성 보장 |
| **Zod 스키마** | API 유효성 검증과 폼 검증에 동일 스키마 재사용 |

## 주차별 산출물 요약

| 주차 | 핵심 산출물 | 완성도 |
|------|-----------|--------|
| **1주차** | 수탁사 CRUD + 대시보드 | MVP 동작 |
| **2주차** | 계약/점검 CRUD + 관계 데이터 | 주요 기능 완성 |
| **3주차** | 인증 + 테스트 + 배포 | 프로덕션 준비 |
