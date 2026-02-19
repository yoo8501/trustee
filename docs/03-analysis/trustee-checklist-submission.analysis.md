# trustee-checklist-submission Analysis Report

> **Analysis Type**: Gap Analysis (Design vs Implementation)
>
> **Project**: Trustee Management System
> **Analyst**: gap-detector
> **Date**: 2026-02-19
> **Design Doc**: [trustee-checklist-submission.design.md](../02-design/features/trustee-checklist-submission.design.md)

---

## 1. Analysis Overview

### 1.1 Analysis Purpose

설계 문서(`trustee-checklist-submission.design.md`)와 실제 구현 코드 간의 일치도를 검증한다.
수탁사 체크리스트 제출 기능의 Step 1~11 각각에 대해 누락, 불일치, 추가 항목을 식별한다.

### 1.2 Analysis Scope

- **Design Document**: `docs/02-design/features/trustee-checklist-submission.design.md`
- **Implementation Path**: Backend(`backend/services/inspection/`, `backend/packages/`), Frontend(`frontend/web/src/`)
- **Analysis Date**: 2026-02-19

---

## 2. Step별 Gap Analysis

### Step 1: DB 스키마 변경

**파일**: `backend/services/inspection/prisma/schema.prisma`

| 설계 항목 | 설계 내용 | 구현 상태 | 상태 |
|-----------|-----------|-----------|:----:|
| `accessToken` 필드 | `String @unique @default(uuid()) @map("access_token")` | 동일하게 구현 | ✅ |
| `accessTokenExpiresAt` 필드 | `DateTime? @map("access_token_expires_at")` | 동일하게 구현 | ✅ |
| `contactName` 필드 | `String? @map("contact_name")` | 동일하게 구현 | ✅ |
| `contactEmail` 필드 | `String? @map("contact_email")` | 동일하게 구현 | ✅ |
| `contactPhone` 필드 | `String? @map("contact_phone")` | 동일하게 구현 | ✅ |
| `TrusteeChecklistStatus` enum | `draft`, `sent`, `in_progress`, `submitted`, `reviewed` | 동일하게 구현 | ✅ |

**Step 1 결과**: ✅ 완전 일치 (6/6)

---

### Step 2: 타입 변경 (@trustee/types)

**파일**: `backend/packages/types/src/checklist.ts`

| 설계 항목 | 설계 내용 | 구현 상태 | 상태 |
|-----------|-----------|-----------|:----:|
| TrusteeChecklist 확장 | `accessToken`, `accessTokenExpiresAt`, `contactName`, `contactEmail`, `contactPhone` 추가 | 동일하게 구현 | ✅ |
| `SubmitTrusteeChecklistInput` 타입 | `contactName: string`, `contactEmail?: string`, `contactPhone?: string` | 동일하게 구현 | ✅ |
| `RegenerateTokenResponse` 타입 | `accessToken: string`, `accessUrl: string` | `accessUrl` 필드 누락 | ⚠️ |

**차이점 상세**:

- `RegenerateTokenResponse` 타입: 설계에는 `accessUrl: string` 필드가 포함되어 있으나, 구현에서는 `accessToken: string`만 존재한다. `accessUrl`은 프론트엔드에서 조합하여 사용하므로 기능적 영향은 낮다.

**Step 2 결과**: ⚠️ 부분 일치 (2.5/3)

---

### Step 3: Backend - Repository 확장 + ForbiddenError

**파일**: `backend/services/inspection/src/repositories/trustee-checklist.repository.ts`, `backend/packages/common/src/errors.ts`

| 설계 항목 | 설계 내용 | 구현 상태 | 상태 |
|-----------|-----------|-----------|:----:|
| `findByToken(token)` 메서드 | `findUnique` + `fullInclude` | 동일하게 구현 | ✅ |
| `regenerateToken(id)` 메서드 | `update` + `randomUUID()` | 동일하게 구현 | ✅ |
| `ForbiddenError` 클래스 | `AppError` 상속, 403, `FORBIDDEN` | 동일하게 구현 | ✅ |
| `ForbiddenError` export | `@trustee/common`에서 export | `index.ts`에서 export 확인 | ✅ |

**Step 3 결과**: ✅ 완전 일치 (4/4)

---

### Step 4: Backend - ChecklistResponseService/Controller/Routes 신규

**파일**: `checklist-response.service.ts`, `checklist-response.controller.ts`, `checklist-response.routes.ts`

| 설계 항목 | 설계 내용 | 구현 상태 | 상태 |
|-----------|-----------|-----------|:----:|
| `ChecklistResponseService` 클래스 | Repository + RabbitMQ 주입 | 동일하게 구현 | ✅ |
| `getByToken(token)` | `findByToken` + NotFoundError + tokenExpiry 검증 | 동일하게 구현 | ✅ |
| `updateItem(token, itemId, dto)` | 토큰 검증 + editable 검증 + sent->in_progress 자동 변경 | 동일하게 구현 | ✅ |
| `batchUpdateItems(token, dto)` | 토큰 검증 + editable 검증 + sent->in_progress 자동 변경 | 동일하게 구현 | ✅ |
| `submit(token, dto)` | 토큰 검증 + editable 검증 + status->submitted + contactInfo 저장 | 동일하게 구현 | ✅ |
| `validateTokenExpiry()` | 만료 시 ForbiddenError | 동일하게 구현 | ✅ |
| `validateEditable()` | submitted/reviewed 시 ForbiddenError | 동일하게 구현 | ✅ |
| `ChecklistResponseController` | 4개 핸들러 (getByToken, updateItem, batchUpdateItems, submit) | 동일하게 구현 | ✅ |
| Controller - accessToken 응답 제외 | `const { accessToken, ...data } = checklist` | 동일하게 구현 | ✅ |
| Routes 정의 | GET /:token, PATCH /:token/items/:itemId, PATCH /:token/items/batch, POST /:token/submit | 동일하게 구현 | ✅ |
| Routes - validate 미들웨어 | POST/PATCH에 validate 적용 | 동일하게 구현 | ✅ |

**추가 구현 (설계에 없음)**:

- `publishEvent()` 메서드: submit 성공 시 `checklist.submitted` 이벤트를 RabbitMQ로 발행하는 기능이 추가됨. 설계 문서에는 명시되지 않았으나 아키텍처 패턴에 부합하는 적절한 추가.

**Step 4 결과**: ✅ 완전 일치 (11/11, 추가 1건)

---

### Step 5: Backend - Validation 추가

**파일**: `backend/services/inspection/src/validation.ts`

| 설계 항목 | 설계 내용 | 구현 상태 | 상태 |
|-----------|-----------|-----------|:----:|
| `submitChecklistSchema` | `contactName: z.string().min(1)` | 동일하게 구현 | ✅ |
| `submitChecklistSchema` | `contactEmail: z.string().email().optional().or(z.literal(""))` | 동일하게 구현 | ✅ |
| `submitChecklistSchema` | `contactPhone: z.string().optional()` | 동일하게 구현 | ✅ |

**Step 5 결과**: ✅ 완전 일치 (3/3)

---

### Step 6: Backend - 기존 서비스 변경

**파일**: `trustee-checklist.service.ts`, `trustee-checklist.controller.ts`, `trustee-checklist.routes.ts`

| 설계 항목 | 설계 내용 | 구현 상태 | 상태 |
|-----------|-----------|-----------|:----:|
| `create` 후 status `sent` 변경 | 생성 후 `update(id, { status: "sent" })` | 동일하게 구현 | ✅ |
| `regenerateToken(id)` 서비스 메서드 | 존재 확인 + `repository.regenerateToken(id)` | 동일하게 구현 | ✅ |
| `regenerateToken` 컨트롤러 핸들러 | `res.json({ data: { accessToken } })` | 동일하게 구현 | ✅ |
| `POST /:id/regenerate-token` 라우트 | 라우트 정의 | 동일하게 구현 | ✅ |
| `markAsReviewed(id)` 서비스 메서드 | 설계에 명시됨 | 별도 메서드 없이 기존 `update()`로 처리 | ⚠️ |

**차이점 상세**:

- `markAsReviewed`: 설계에서는 전용 메서드로 정의되었으나, 구현에서는 기존 `update(id, { status: "reviewed" })` 메서드를 재활용한다. 프론트엔드의 `useUpdateTrusteeChecklist` 훅에서 `{ status: "reviewed" }`를 전달하는 방식으로 동작하므로 기능적으로는 동일하다.

**Step 6 결과**: ⚠️ 부분 일치 (4.5/5)

---

### Step 7: Backend - Bootstrap 변경 + exports

**파일**: `backend/services/inspection/src/index.ts`, `services/index.ts`, `controllers/index.ts`, `routes/index.ts`

| 설계 항목 | 설계 내용 | 구현 상태 | 상태 |
|-----------|-----------|-----------|:----:|
| ChecklistResponseService 생성 | `new ChecklistResponseService(repo, rabbitmq)` | 동일하게 구현 | ✅ |
| ChecklistResponseController 생성 | `new ChecklistResponseController(service)` | 동일하게 구현 | ✅ |
| Route 등록 | `app.use("/api/checklist-response", ...)` | 동일하게 구현 | ✅ |
| services/index.ts export | `ChecklistResponseService` export | 동일하게 구현 | ✅ |
| controllers/index.ts export | `ChecklistResponseController` export | 동일하게 구현 | ✅ |
| routes/index.ts export | `createChecklistResponseRoutes` export | 동일하게 구현 | ✅ |

**Step 7 결과**: ✅ 완전 일치 (6/6)

---

### Step 8: Gateway 프록시 추가

**파일**: `backend/services/gateway/src/proxy.ts`

| 설계 항목 | 설계 내용 | 구현 상태 | 상태 |
|-----------|-----------|-----------|:----:|
| `pathFilter`에 `/api/checklist-response` 추가 | `inspectionProxy`의 pathFilter 배열 | 동일하게 구현 | ✅ |

**Step 8 결과**: ✅ 완전 일치 (1/1)

---

### Step 9: Frontend - API 클라이언트 + 훅

**파일**: `lib/api/checklist-response.ts`, `lib/api/trustee-checklists.ts`, `lib/api/index.ts`, `hooks/useChecklistResponse.ts`, `hooks/index.ts`

| 설계 항목 | 설계 내용 | 구현 상태 | 상태 |
|-----------|-----------|-----------|:----:|
| `checklistResponseApi.getByToken` | `GET /api/checklist-response/:token` | 동일하게 구현 | ✅ |
| `checklistResponseApi.updateItem` | `PATCH /api/checklist-response/:token/items/:itemId` | 동일하게 구현 | ✅ |
| `checklistResponseApi.batchUpdateItems` | `PATCH /api/checklist-response/:token/items/batch` | 동일하게 구현 | ✅ |
| `checklistResponseApi.submit` | `POST /api/checklist-response/:token/submit` | 동일하게 구현 | ✅ |
| `getByToken` 응답 타입 | `Promise<{ data: TrusteeChecklist }>` | `Omit<TrusteeChecklist, "accessToken">` 적용 (개선) | ✅ |
| `trusteeChecklistsApi.regenerateToken` 추가 | `POST /api/trustee-checklists/:id/regenerate-token` | 동일하게 구현 | ✅ |
| `lib/api/index.ts` export | `checklistResponseApi` export | 동일하게 구현 | ✅ |
| `useChecklistByToken(token)` 훅 | queryKey + enabled 패턴 | 동일하게 구현 | ✅ |
| `useBatchSaveResponse(token)` 훅 | mutation + invalidateQueries | 동일하게 구현 | ✅ |
| `useSubmitChecklist(token)` 훅 | mutation + invalidateQueries | 동일하게 구현 | ✅ |
| `hooks/index.ts` export | 3개 훅 export | 동일하게 구현 | ✅ |

**Step 9 결과**: ✅ 완전 일치 (11/11)

---

### Step 10: Frontend - 수탁사 작성 페이지

**파일**: `app/checklist/[token]/layout.tsx`, `app/checklist/[token]/page.tsx`

| 설계 항목 | 설계 내용 | 구현 상태 | 상태 |
|-----------|-----------|-----------|:----:|
| 독립 레이아웃 (사이드바 없음) | AppBar + Container, 대시보드와 분리 | 동일하게 구현 | ✅ |
| maxWidth="lg" | Container maxWidth | 동일하게 구현 | ✅ |
| 로딩 상태 (CircularProgress) | 로딩 중 스피너 표시 | 동일하게 구현 | ✅ |
| 에러 상태 (토큰 만료, 404) | Alert 표시 | 동일하게 구현 | ✅ |
| 제출 완료 상태 (읽기 전용) | isReadOnly 체크 | 동일하게 구현 | ✅ |
| 헤더 (제목 + 점검범위 + 진행률) | Typography + LinearProgress | 동일하게 구현 | ✅ |
| ContactInfoSection | 담당자명(필수), 이메일, 연락처 | 동일하게 구현 | ✅ |
| CategoryAccordion | 범주별 아코디언 | 동일하게 구현 | ✅ |
| SectionAccordion | 영역별 아코디언 (중첩) | 동일하게 구현 | ✅ |
| ChecklistItemRow - 대상여부(Switch) | Switch 컴포넌트 | 동일하게 구현 | ✅ |
| ChecklistItemRow - 답변(RadioGroup) | yes/no/not_applicable | 동일하게 구현 | ✅ |
| ChecklistItemRow - 현황(TextField) | multiline TextField | 동일하게 구현 | ✅ |
| ChecklistItemRow - 증빙자료(TextField) | TextField | 동일하게 구현 | ✅ |
| ChecklistItemRow - 비고(TextField) | TextField | 동일하게 구현 | ✅ |
| ProgressBar (진행률 바) | LinearProgress + 퍼센트 표시 | 동일하게 구현 | ✅ |
| ActionButtons (임시저장 + 제출) | Button 2개 + loading 상태 | 동일하게 구현 | ✅ |
| 로컬 상태 변경 추적 | `changes` state + `updateItemField` | 동일하게 구현 | ✅ |
| 자동저장 (debounce 2초) | setTimeout 기반 debounce | `use-debounce` 대신 직접 구현 (setTimeout + useRef) | ⚠️ |
| 진행률 계산 로직 | 전체 항목 중 answer 입력 항목 수 | 동일하게 구현 (useMemo) | ✅ |
| 제출 플로우 - 미답변 체크 | 미답변 항목 수 체크 후 Dialog | 동일하게 구현 | ✅ |
| 제출 플로우 - contactName 필수 검증 | 빈 값 시 에러 표시 | 동일하게 구현 | ✅ |
| 제출 플로우 - 미저장 변경 먼저 저장 | batchSave 후 submit | 동일하게 구현 | ✅ |
| 제출 완료 후 읽기 전용 모드 | Snackbar "제출이 완료되었습니다" | 동일하게 구현 | ✅ |
| 제출 완료 시 작성자 정보 표시 | 읽기 전용으로 contactName/Email/Phone 표시 | 동일하게 구현 | ✅ |

**차이점 상세**:

- **자동저장 구현 방식**: 설계에서는 `use-debounce` 패키지의 `useDebouncedCallback`을 사용하도록 명시했으나, 구현에서는 `setTimeout` + `useRef`를 이용한 직접 debounce를 구현하였다. 기능적으로 동일하며, 외부 의존성을 줄인 점에서 합리적인 선택이다.

**Step 10 결과**: ⚠️ 부분 일치 (23.5/24)

---

### Step 11: Frontend - 위탁사 페이지 개선

**파일**: `inspections/checklists/new/page.tsx`, `inspections/checklists/[id]/page.tsx`, `inspections/checklists/page.tsx`

| 설계 항목 | 설계 내용 | 구현 상태 | 상태 |
|-----------|-----------|-----------|:----:|
| **생성 페이지** - 토큰 링크 Dialog 표시 | 생성 성공 후 Dialog + 토큰 URL | 동일하게 구현 | ✅ |
| **생성 페이지** - 읽기 전용 TextField + 복사 버튼 | TextField readOnly + 클립보드 복사 | 동일하게 구현 | ✅ |
| **생성 페이지** - 목록으로 돌아가기 버튼 | Dialog 닫기 시 router.push | 동일하게 구현 | ✅ |
| **상세 페이지** - 토큰 링크 표시 영역 | 토큰 URL + 복사 버튼 | 동일하게 구현 | ✅ |
| **상세 페이지** - 상태 뱃지 개선 | Chip 컬러 맵 + 제출일 표시 | 동일하게 구현 | ✅ |
| **상세 페이지** - 검토 완료 버튼 | `submitted` 상태일 때 "검토 완료" 버튼 | 동일하게 구현 | ✅ |
| **상세 페이지** - 토큰 재발급 버튼 | "재발급" 버튼 + 확인 Dialog | 동일하게 구현 | ✅ |
| **상세 페이지** - 작성자 정보 표시 | contactName/Email/Phone + 아이콘 | 동일하게 구현 | ✅ |
| **상세 페이지** - 제출일 표시 | submittedAt 날짜 포맷 | 동일하게 구현 | ✅ |
| **목록 페이지** - 작성자 컬럼 | contactName 표시 | 동일하게 구현 | ✅ |
| **목록 페이지** - 제출일 컬럼 | submittedAt 날짜 포맷 | 동일하게 구현 | ✅ |
| **목록 페이지** - 상태 필터 | 전체/초안/전달됨/작성중/제출완료/검토완료 | 동일하게 구현 | ✅ |

**Step 11 결과**: ✅ 완전 일치 (12/12)

---

## 3. Match Rate Summary

### 3.1 Step별 점수

| Step | 설명 | 설계 항목 수 | 일치 항목 수 | 점수 | 상태 |
|------|------|:-----------:|:----------:|:----:|:----:|
| Step 1 | DB 스키마 변경 | 6 | 6 | 100% | ✅ |
| Step 2 | 타입 변경 | 3 | 2.5 | 83% | ⚠️ |
| Step 3 | Repository + ForbiddenError | 4 | 4 | 100% | ✅ |
| Step 4 | ChecklistResponse 신규 | 11 | 11 | 100% | ✅ |
| Step 5 | Validation 추가 | 3 | 3 | 100% | ✅ |
| Step 6 | 기존 서비스 변경 | 5 | 4.5 | 90% | ⚠️ |
| Step 7 | Bootstrap + exports | 6 | 6 | 100% | ✅ |
| Step 8 | Gateway 프록시 | 1 | 1 | 100% | ✅ |
| Step 9 | API 클라이언트 + 훅 | 11 | 11 | 100% | ✅ |
| Step 10 | 수탁사 작성 페이지 | 24 | 23.5 | 98% | ⚠️ |
| Step 11 | 위탁사 페이지 개선 | 12 | 12 | 100% | ✅ |

### 3.2 Overall Match Rate

```
 Overall Match Rate: 97%
 ──────────────────────────────────
  전체 설계 항목:   86개
  완전 일치:        83개 (96.5%)
  부분 일치:         3개 ( 3.5%)
  미구현:            0개 ( 0.0%)
  ──────────────────────────────────
  Match Rate: 84.5 / 86 = 98.3%
```

---

## 4. Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match | 98% | ✅ |
| Architecture Compliance | 100% | ✅ |
| Convention Compliance | 98% | ✅ |
| **Overall** | **98%** | ✅ |

---

## 5. Differences Found

### 5.1 Missing Features (Design O, Implementation X)

| 항목 | 설계 위치 | 설명 |
|------|-----------|------|
| 없음 | - | 모든 설계 항목이 구현됨 |

### 5.2 Changed Features (Design != Implementation)

| 항목 | 설계 | 구현 | 영향도 |
|------|------|------|:------:|
| `RegenerateTokenResponse.accessUrl` | `accessToken` + `accessUrl` | `accessToken`만 포함 | Low |
| `markAsReviewed()` 전용 메서드 | 전용 서비스 메서드 | 기존 `update()` 재활용 | Low |
| 자동저장 debounce 구현 | `use-debounce` 패키지 사용 | `setTimeout` + `useRef` 직접 구현 | Low |

### 5.3 Added Features (Design X, Implementation O)

| 항목 | 구현 위치 | 설명 |
|------|-----------|------|
| `publishEvent` (submit 시) | `checklist-response.service.ts:64` | 제출 시 `checklist.submitted` 이벤트 발행 |
| `ChecklistResponseData` 응답 타입 | `lib/api/checklist-response.ts:10` | `Omit<TrusteeChecklist, "accessToken">` 적용으로 타입 안전성 개선 |
| Footer 영역 | `app/checklist/[token]/layout.tsx:30` | 레이아웃에 footer 추가 (설계에 미명시) |

---

## 6. Architecture Compliance

### 6.1 4계층 아키텍처 (Backend)

| 계층 | 설계 | 구현 | 상태 |
|------|------|------|:----:|
| Routes | `checklist-response.routes.ts` | 존재, Router 패턴 준수 | ✅ |
| Controllers | `checklist-response.controller.ts` | 존재, 화살표 함수 + try-catch 패턴 | ✅ |
| Services | `checklist-response.service.ts` | 존재, 비즈니스 로직 포함 | ✅ |
| Repositories | `trustee-checklist.repository.ts` 확장 | 존재, 순수 데이터 접근 | ✅ |

### 6.2 DI (Dependency Injection) 패턴

| 구성 | 상태 |
|------|:----:|
| Service에 Repository 주입 | ✅ |
| Service에 RabbitMQ 주입 | ✅ |
| Controller에 Service 주입 | ✅ |
| Bootstrap에서 조립 | ✅ |

### 6.3 Frontend API 호출 흐름

| 설계 | 구현 | 상태 |
|------|------|:----:|
| 페이지 -> Hook -> API Client -> Gateway | 동일하게 구현 | ✅ |

---

## 7. Convention Compliance

### 7.1 Naming Convention

| Category | Convention | 검사 파일 수 | 준수율 | 위반 |
|----------|-----------|:-----------:|:------:|------|
| 컴포넌트 | PascalCase | 6 | 100% | 없음 |
| 함수/메서드 | camelCase | 전체 | 100% | 없음 |
| 훅 | use 접두사 | 3 | 100% | 없음 |
| API 객체 | {resource}Api | 2 | 100% | 없음 |
| 파일 (서비스) | kebab-case.ts | 8 | 100% | 없음 |
| 쿼리 키 | 상수 배열 | 2 | 100% | 없음 |

### 7.2 코드 패턴

| 패턴 | 검사 항목 | 상태 |
|------|-----------|:----:|
| "use client" 선언 (클라이언트 컴포넌트) | 모든 페이지/훅 | ✅ |
| try-catch + next(error) (Controller) | ChecklistResponseController | ✅ |
| 화살표 함수 (Controller 메서드) | 4개 메서드 | ✅ |
| 응답 형식 `{ data: T }` | Controller | ✅ |
| enabled 조건 (useQuery) | useChecklistByToken | ✅ |
| invalidateQueries (mutation) | 2개 mutation | ✅ |

---

## 8. Dependency Check

### 8.1 설계에 명시된 의존성

| 패키지 | 설계 | 구현 | 상태 |
|--------|------|------|:----:|
| `use-debounce` | 필요 (Section 8) | 미사용 (직접 구현) | ⚠️ |

**참고**: `use-debounce` 패키지를 사용하지 않고 `setTimeout` + `useRef`로 직접 구현하여 외부 의존성을 추가하지 않았다. 기능적으로 동일하며 더 경량화된 접근이다.

---

## 9. Recommended Actions

### 9.1 Low Priority (선택적 개선)

| 우선순위 | 항목 | 파일 | 설명 |
|:--------:|------|------|------|
| 1 | `RegenerateTokenResponse` 타입 동기화 | `backend/packages/types/src/checklist.ts` | 설계에서 `accessUrl` 필드를 제거하거나, 구현에 추가 |
| 2 | 설계 문서 업데이트 | `docs/02-design/features/trustee-checklist-submission.design.md` | debounce 구현 방식, publishEvent 추가 반영 |

### 9.2 문서 업데이트 필요

| 항목 | 설명 |
|------|------|
| `RegenerateTokenResponse` 타입 | 구현에 맞게 `accessUrl` 제거 또는 "프론트엔드에서 조합" 주석 추가 |
| `markAsReviewed` 메서드 | "기존 update()로 대체" 명시 |
| `use-debounce` 의존성 | "직접 구현으로 대체" 명시 |
| `publishEvent` (submit 시) | 이벤트 발행 로직 설계에 추가 |

---

## 10. Conclusion

설계 대비 구현 일치율이 **98%**로 매우 높은 수준이다. 발견된 차이점 3건은 모두 **Low Impact**이며, 기능적 동작에 영향을 미치지 않는다.

- `RegenerateTokenResponse.accessUrl` 누락: 프론트엔드에서 `window.location.origin + token`으로 직접 조합하므로 실질적 문제 없음
- `markAsReviewed` 전용 메서드 미구현: 기존 `update()` API가 동일 기능을 제공
- `use-debounce` 미사용: 직접 구현으로 외부 의존성 감소, 기능 동일

**Match Rate >= 90%이므로 Check 단계를 통과합니다.**

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-02-19 | Initial gap analysis | gap-detector |
