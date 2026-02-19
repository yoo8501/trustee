# Plan: 수탁사 관리 (Trustee Management)

## 개요
대시보드에서 수탁사(개인정보 처리 업무를 위탁받은 업체)를 CRUD 관리하는 프론트엔드 페이지를 구현한다.
백엔드 API(trustee-service)와 React Query 훅은 이미 완성되어 있으므로, 프론트엔드 UI 구현에 집중한다.

## 핵심 변경사항: 복수 담당자 지원
기존 수탁사 모델의 단일 담당자(contactName, contactPhone, contactEmail)를 **별도 TrusteeContact 모델(1:N)**로 분리하여 복수 담당자를 지원한다.

### 수탁사 필드
| 필드 | 타입 | 설명 | 필수 |
|------|------|------|------|
| companyName | string | 회사명 | **O** |
| businessNumber | string | 사업자번호 | X |
| representative | string | 대표자 | X |
| delegatedTasks | string | 위탁 업무 | **O** |
| status | enum | 상태 (active/inactive/pending) | X (기본 pending) |

### 담당자 필드
| 필드 | 타입 | 설명 | 필수 |
|------|------|------|------|
| name | string | 담당자명 | O |
| phone | string | 연락처 | X |
| email | string | 이메일 | X |
| department | string | 부서 | X |
| position | string | 직책 | X |
| isPrimary | boolean | 주담당자 여부 | O (기본 false) |

### 비즈니스 규칙
- 수탁사 등록 시 필수값: **회사명, 위탁 업무**만
- 사업자번호, 대표자 등은 선택 입력
- 수탁사당 최소 1명의 담당자 필수
- 주담당자(isPrimary)는 반드시 1명 존재
- 담당자 전체 삭제 불가 (최소 1명 유지)
- 주담당자 삭제 시 다른 담당자를 주담당자로 지정 필요

## 현재 상태 (이미 완성된 것)
- **백엔드**: `backend/services/trustee/` - 4계층 아키텍처 완성 (Routes → Controllers → Services → Repositories)
- **Gateway**: `backend/services/gateway/` - API 프록시 완성 (`/api/trustees` → trustee-service)
- **API 클라이언트**: `frontend/web/src/lib/api/trustees.ts` - CRUD API 호출 함수
- **React Query 훅**: `frontend/web/src/hooks/useTrustees.ts` - useTrustees, useTrustee, useCreateTrustee, useUpdateTrustee, useDeleteTrustee
- **공유 타입**: `@trustee/types` - Trustee, CreateTrusteeInput, UpdateTrusteeInput
- **공유 UI**: `@trustee/ui` - DataTable, Button, Dialog, Form, FormTextField, FormSelect, PageHeader, Layout
- **대시보드 네비게이션**: "수탁사 관리" 항목 존재 (href: `/trustees`)

## 변경 대상

### 1. DB 스키마 변경 (Prisma)
- **파일**: `backend/packages/database/prisma/schema.prisma`
- **변경**:
  - Trustee 모델에서 `contactName`, `contactPhone`, `contactEmail` 제거
  - 새 `TrusteeContact` 모델 추가 (1:N 관계)
  ```prisma
  model TrusteeContact {
    id         String  @id @default(cuid())
    trusteeId  String  @map("trustee_id")
    name       String
    phone      String
    email      String
    department String?
    position   String?
    isPrimary  Boolean @default(false) @map("is_primary")
    createdAt  DateTime @default(now()) @map("created_at")
    updatedAt  DateTime @updatedAt @map("updated_at")

    trustee Trustee @relation(fields: [trusteeId], references: [id], onDelete: Cascade)

    @@map("trustee_contacts")
  }
  ```
  - Trustee 모델에 `contacts TrusteeContact[]` 관계 추가

### 2. 공유 타입 변경
- **파일**: `backend/packages/types/src/index.ts`
- **변경**:
  - `TrusteeContact` 인터페이스 추가
  - `CreateTrusteeContactInput`, `UpdateTrusteeContactInput` 추가
  - `Trustee` 인터페이스에서 `contactName`, `contactPhone`, `contactEmail` 제거 → `contacts: TrusteeContact[]` 추가
  - `CreateTrusteeInput`에서 단일 담당자 필드 → `contacts: CreateTrusteeContactInput[]`로 변경

### 3. 백엔드 서비스 변경
- **파일들**:
  - `backend/services/trustee/src/validation.ts` - Zod 스키마에 contacts 배열 추가
  - `backend/services/trustee/src/repositories/trustee.repository.ts` - include contacts, 담당자 생성/수정 로직
  - `backend/services/trustee/src/services/trustee.service.ts` - 주담당자 검증 로직
  - `backend/services/trustee/src/controllers/trustee.controller.ts` - 변경 불필요 (위임만)
- **변경 내용**:
  - 수탁사 생성 시 contacts 배열 함께 생성 (nested create)
  - 수탁사 수정 시 contacts upsert/delete 처리
  - 수탁사 조회 시 contacts include
  - 주담당자 최소 1명 검증

### 4. 프론트엔드 페이지 변경

#### 4-1. 수탁사 목록 페이지
- **경로**: `frontend/web/src/app/(dashboard)/trustees/page.tsx`
- **URL**: `/trustees`
- **기능**:
  - 수탁사 목록을 DataTable로 표시
  - 컬럼: 회사명, 사업자번호, 대표자, **주담당자** (contacts에서 isPrimary인 담당자명), 상태
  - 페이지네이션 (기본 10건/페이지)
  - 검색 기능 (회사명, 사업자번호)
  - 상태 필터 (전체/활성/비활성/대기)
  - "수탁사 등록" 버튼 → `/trustees/new`로 이동
  - 행 클릭 → `/trustees/[id]`로 이동
  - 상태 표시: Chip 컴포넌트 (active=초록, inactive=빨강, pending=노랑)

#### 4-2. 수탁사 등록 페이지
- **경로**: `frontend/web/src/app/(dashboard)/trustees/new/page.tsx`
- **URL**: `/trustees/new`
- **기능**:
  - React Hook Form + Zod + useFieldArray 기반 폼
  - 기본 정보: 회사명, 사업자번호, 대표자, 위탁 업무, 상태
  - **담당자 섹션** (동적 추가/삭제):
    - "담당자 추가" 버튼으로 새 담당자 행 추가
    - 각 담당자: 이름, 연락처, 이메일, 부서, 직책, 주담당자 체크박스
    - 첫 번째 담당자는 기본으로 주담당자 선택
    - 주담당자는 라디오 버튼 방식 (1명만 선택 가능)
    - 최소 1명 유지 (마지막 담당자는 삭제 불가)
    - "삭제" 버튼으로 담당자 행 제거
  - "등록" 버튼 → useCreateTrustee mutation → 성공 시 목록으로 이동
  - "취소" 버튼 → 목록으로 이동

#### 4-3. 수탁사 상세/수정 페이지
- **경로**: `frontend/web/src/app/(dashboard)/trustees/[id]/page.tsx`
- **URL**: `/trustees/[id]`
- **기능**:
  - useTrustee(id)로 데이터 로드 (contacts 포함)
  - 기본 정보 수정 + **담당자 목록 수정** (동적 추가/삭제/수정)
  - "저장" 버튼 → useUpdateTrustee mutation
  - "삭제" 버튼 → 확인 Dialog → useDeleteTrustee mutation → 성공 시 목록으로 이동
  - "목록으로" 버튼 → `/trustees`로 이동

### 5. API 클라이언트 / React Query 훅 변경
- **파일들**:
  - `frontend/web/src/lib/api/trustees.ts` - 타입 변경 자동 반영
  - `frontend/web/src/hooks/useTrustees.ts` - 타입 변경 자동 반영
- **변경**: `@trustee/types`의 타입 변경에 따라 자동 호환 (구조 변경 없음)

## 구현 순서
1. DB 스키마 변경 (TrusteeContact 모델 추가, Trustee 단일 담당자 필드 제거)
2. 공유 타입 변경 (`@trustee/types`)
3. 백엔드 서비스 변경 (validation → repository → service)
4. 프론트엔드 수탁사 목록 페이지 (주담당자 표시)
5. 프론트엔드 수탁사 등록 페이지 (동적 담당자 폼)
6. 프론트엔드 수탁사 상세/수정 페이지 (담당자 수정)

## 사용 기술/패턴
- **UI 컴포넌트**: `@trustee/ui` - DataTable, Button, Dialog, Form, FormTextField, FormSelect, PageHeader
- **MUI 직접 사용**: Chip (상태 표시), IconButton (담당자 삭제), Radio (주담당자 선택)
- **폼 관리**: React Hook Form + Zod + **useFieldArray** (동적 담당자 배열)
- **상태 관리**: React Query (이미 구현된 훅 활용)
- **스타일링**: MUI sx prop + `@trustee/ui` 디자인 토큰

## Zod 스키마 (프론트엔드)
```typescript
const contactSchema = z.object({
  name: z.string().min(1, "담당자명은 필수입니다"),
  phone: z.string().optional(),
  email: z.string().email("유효한 이메일을 입력해주세요").optional().or(z.literal("")),
  department: z.string().optional(),
  position: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

const trusteeSchema = z.object({
  companyName: z.string().min(1, "회사명은 필수입니다"),
  businessNumber: z.string().optional(),
  representative: z.string().optional(),
  delegatedTasks: z.string().min(1, "위탁 업무는 필수입니다"),
  status: z.enum(["active", "inactive", "pending"]).default("pending"),
  contacts: z.array(contactSchema).min(1, "최소 1명의 담당자가 필요합니다"),
}).refine(
  (data) => data.contacts.some((c) => c.isPrimary),
  { message: "주담당자를 1명 지정해주세요", path: ["contacts"] }
);
```

## 완료 조건
- [ ] TrusteeContact 모델 추가 및 DB 마이그레이션
- [ ] 공유 타입에 TrusteeContact 인터페이스 추가
- [ ] 백엔드: 수탁사 CRUD에 contacts 포함 처리
- [ ] 백엔드: 주담당자 최소 1명 검증
- [ ] 수탁사 목록 페이지: 주담당자명 표시
- [ ] 수탁사 등록 페이지: 동적 담당자 폼 (추가/삭제/주담당자 지정)
- [ ] 수탁사 상세/수정 페이지: 담당자 수정 지원
- [ ] TypeScript 에러 없음
- [ ] 디자인 시스템 토큰 일관 적용 (`@trustee/ui` 우선 사용)
- [ ] 한국어 UI 텍스트
