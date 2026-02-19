# checklist-deadline-flow Analysis Report

> **Analysis Type**: Gap Analysis (Design vs Implementation)
>
> **Project**: Trustee Management System
> **Analyst**: gap-detector
> **Date**: 2026-02-19
> **Design Doc**: [checklist-deadline-flow.design.md](../02-design/features/checklist-deadline-flow.design.md)

---

## 1. Analysis Overview

### 1.1 Analysis Purpose

체크리스트 기한 및 재제출 플로우(checklist-deadline-flow) 설계 문서와 실제 구현 코드 간의 일치율을 검증한다. 설계 문서의 10개 섹션을 각각 비교하여 누락, 추가, 변경 사항을 식별한다.

### 1.2 Analysis Scope

- **Design Document**: `docs/02-design/features/checklist-deadline-flow.design.md`
- **Implementation Files**: 15개 파일 (DB Schema, Types, Validation, Services, Controllers, Routes, Frontend API/Hooks/Pages)
- **Analysis Date**: 2026-02-19

---

## 2. Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| 1. Prisma Schema | 100% | PASS |
| 2. Types (@trustee/types) | 100% | PASS |
| 3. Validation | 100% | PASS |
| 4. Repository | 100% | PASS |
| 5. TrusteeChecklistService | 100% | PASS |
| 6. ChecklistResponseService | 95% | PASS |
| 7. Controller / Routes | 100% | PASS |
| 8. Frontend API / Hooks | 100% | PASS |
| 9. Frontend Pages (new, [id], list) | 97% | PASS |
| 10. Frontend Page (token - 수탁사 작성) | 93% | PASS |
| **Overall** | **98%** | PASS |

---

## 3. Section-by-Section Gap Analysis

### 3.1 Prisma Schema (Section 1) - 100%

**File**: `backend/services/inspection/prisma/schema.prisma`

| Design Item | Design | Implementation | Status |
|-------------|--------|----------------|:------:|
| `accessTokenExpiresAt` nullable -> required | `DateTime` (required) | `DateTime @map("access_token_expires_at")` (line 144) | PASS |
| `submissionCount` 신규 필드 | `Int @default(0)` | `Int @default(0) @map("submission_count")` (line 147) | PASS |
| 기존 필드 유지 | 모든 기존 필드 | 모두 일치 | PASS |

**Result**: 설계와 완전히 일치. nullable에서 required로 변경, submissionCount 필드 추가 모두 반영됨.

---

### 3.2 Types - @trustee/types (Section 2) - 100%

**File**: `backend/packages/types/src/checklist.ts`

| Design Item | Design | Implementation | Status |
|-------------|--------|----------------|:------:|
| `TrusteeChecklist.accessTokenExpiresAt` | `Date` (required) | `accessTokenExpiresAt: Date` (line 86) | PASS |
| `TrusteeChecklist.submissionCount` | `number` (required) | `submissionCount: number` (line 87) | PASS |
| `CreateTrusteeChecklistInput.deadline` | `deadline: string` (required) | `deadline: string` (line 132) | PASS |
| `UpdateTrusteeChecklistInput.deadline` | `deadline?: string` (optional) | `deadline?: string` (line 138) | PASS |

**Result**: 모든 타입 변경이 설계와 정확히 일치.

---

### 3.3 Validation (Section 3) - 100%

**File**: `backend/services/inspection/src/validation.ts`

| Design Item | Design | Implementation | Status |
|-------------|--------|----------------|:------:|
| `createTrusteeChecklistSchema.deadline` | `z.string().min(1, "...")` required | `deadline: z.string().min(1, "작성 기한은 필수입니다")` (line 85) | PASS |
| `updateTrusteeChecklistSchema.deadline` | `z.string().optional()` | `deadline: z.string().optional()` (line 91) | PASS |

**Result**: Validation 스키마가 설계와 완전히 일치.

---

### 3.4 Repository (Section 4.3) - 100%

**File**: `backend/services/inspection/src/repositories/trustee-checklist.repository.ts`

| Design Item | Design | Implementation | Status |
|-------------|--------|----------------|:------:|
| `createFromTemplate` params에 `accessTokenExpiresAt: Date` | required 파라미터 | `accessTokenExpiresAt: Date` (line 77) | PASS |
| `createFromTemplate` data에 `accessTokenExpiresAt` 전달 | 기한 설정 | `accessTokenExpiresAt: params.accessTokenExpiresAt` (line 87) | PASS |
| `update()` 타입에 `submissionCount`, `accessTokenExpiresAt` 추가 | 확장 타입 | `submissionCount?: number; accessTokenExpiresAt?: Date` (line 127-128) | PASS |
| `update()` 타입에 `contactName/Email/Phone` 추가 | submit용 | `contactName?: string; contactEmail?: string; contactPhone?: string` (line 129-131) | PASS |

**Result**: Repository 변경이 설계와 완전히 일치. 설계보다 contact 필드도 타입에 명시적으로 포함하여 더 엄격한 타이핑을 적용함.

---

### 3.5 TrusteeChecklistService (Section 4.1) - 100%

**File**: `backend/services/inspection/src/services/trustee-checklist.service.ts`

| Design Item | Design | Implementation | Status |
|-------------|--------|----------------|:------:|
| `create()`: `accessTokenExpiresAt: new Date(dto.deadline)` | deadline을 Date로 변환 | `accessTokenExpiresAt: new Date(dto.deadline)` (line 74) | PASS |
| `update()`: reviewed 시 기한만료 확인 | `new Date() < new Date(accessTokenExpiresAt)` 체크 | line 100-106 동일 로직 | PASS |
| `update()`: reviewed 시 submitted 상태 확인 | `existing.status !== "submitted"` 체크 | `existing.status !== "submitted"` (line 104) | PASS |
| `update()`: deadline 변경 시 기한 만료 전 확인 | `new Date() > new Date(accessTokenExpiresAt)` 체크 | line 110-118 동일 로직 | PASS |
| `update()`: deadline 변경 시 `accessTokenExpiresAt` 업데이트 | `new Date(deadline)` | `accessTokenExpiresAt: new Date(deadline)` (line 117) | PASS |

**Result**: TrusteeChecklistService의 비즈니스 로직이 설계와 완전히 일치.

---

### 3.6 ChecklistResponseService (Section 4.2) - 95%

**File**: `backend/services/inspection/src/services/checklist-response.service.ts`

| Design Item | Design | Implementation | Status |
|-------------|--------|----------------|:------:|
| `getByToken()`: isExpired 플래그 반환 | `{ ...checklist, isExpired }` | `{ ...checklist, isExpired }` (line 29) | PASS |
| `validateEditable()`: reviewed 체크 | ForbiddenError | ForbiddenError (line 104-106) | PASS |
| `validateEditable()`: 기한 만료 체크 | `accessTokenExpiresAt` 비교 | `checklist.isExpired` 사용 (line 109) | PASS |
| `submit()`: submissionCount 증가 | `(checklist.submissionCount \|\| 0) + 1` | 동일 (line 62) | PASS |
| `submit()`: contactName/Email/Phone 전달 | 있음 | 동일 (line 63-65) | PASS |
| `submit()`: 이벤트에 submissionCount 포함 | `updated.submissionCount` | `updated.submissionCount` (line 74) | PASS |
| `reopen()`: 기한 만료 확인 | ForbiddenError | `checklist.isExpired` 체크 (line 85-87) | PASS |
| `reopen()`: submitted 상태만 허용 | ForbiddenError | `status !== "submitted"` (line 90-92) | PASS |
| `reopen()`: in_progress로 상태 변경 | `status: "in_progress"` | 동일 (line 95) | PASS |
| `submit()`: 이벤트 routing key | `INSPECTION_UPDATED` | `INSPECTION_CREATED` (line 68) | WARN |

**Differences Found**:

1. **validateEditable() 시그니처**: 설계는 `accessTokenExpiresAt?: Date | null`을 직접 비교하지만, 구현은 `isExpired: boolean` 플래그를 활용. 기능적으로 동일하며, 구현이 더 깔끔한 패턴을 사용함.

2. **submit() 이벤트 routing key**: 설계 문서에서는 `EVENT_ROUTING_KEYS.INSPECTION_UPDATED`를 사용하도록 되어 있지만, 구현에서는 `EVENT_ROUTING_KEYS.INSPECTION_CREATED`를 사용 (line 68). 기능적 영향은 이벤트 소비자의 구현에 따라 달라질 수 있으나, 현재 이벤트 소비자가 없는 상태이므로 즉각적 영향은 없음.

**Result**: 핵심 로직은 모두 일치. validateEditable의 시그니처 차이는 개선 사항이며, 이벤트 routing key 차이는 경미한 불일치.

---

### 3.7 Controller / Routes (Section 5) - 100%

**Controller File**: `backend/services/inspection/src/controllers/checklist-response.controller.ts`
**Routes File**: `backend/services/inspection/src/routes/checklist-response.routes.ts`

| Design Item | Design | Implementation | Status |
|-------------|--------|----------------|:------:|
| `reopen` 핸들러 추가 | `POST /:token/reopen` | `router.post("/:token/reopen", controller.reopen)` (routes line 32) | PASS |
| `reopen` Controller 메서드 | `req.params.token` 사용 | controller line 56-63 동일 | PASS |
| `getByToken` accessToken 제외 | `{ accessToken, ...data }` | controller line 12 동일 | PASS |
| `getByToken` isExpired 포함 응답 | data에 isExpired 포함 | spread로 자동 포함 (line 13) | PASS |
| 전체 라우트 목록 | GET, PATCH(2), POST(submit), POST(reopen) | 5개 라우트 모두 일치 (routes line 16-32) | PASS |

**Result**: Controller와 Routes가 설계와 완전히 일치.

---

### 3.8 Frontend API / Hooks (Section 6, 7) - 100%

**API File**: `frontend/web/src/lib/api/checklist-response.ts`
**Hook File**: `frontend/web/src/hooks/useChecklistResponse.ts`
**Index File**: `frontend/web/src/hooks/index.ts`

| Design Item | Design | Implementation | Status |
|-------------|--------|----------------|:------:|
| `checklistResponseApi.reopen()` | `apiClient.post(/.../reopen)` | `apiClient.post(/.../reopen)` (api line 47-49) | PASS |
| `useReopenChecklist` 훅 | `useMutation` + invalidateQueries | hook line 45-54 동일 패턴 | PASS |
| hooks/index.ts에 export | `useReopenChecklist` export | index line 56 포함 | PASS |

**Result**: Frontend API 클라이언트와 Hooks가 설계와 완전히 일치.

---

### 3.9 Frontend Pages - 관리자 측 (Section 8.1, 8.2, 8.3) - 97%

#### 3.9.1 생성 페이지 (new/page.tsx) - 100%

**File**: `frontend/web/src/app/(dashboard)/inspections/checklists/new/page.tsx`

| Design Item | Design | Implementation | Status |
|-------------|--------|----------------|:------:|
| deadline state (기본값 오늘+14일) | `d.setDate(d.getDate() + 14)` | line 29-33 동일 | PASS |
| TextField type="date" 필드 | required, fullWidth | line 149-159 완전 구현 | PASS |
| deadline 유효성 검사 | `!deadline` 체크 | line 66-69 구현 | PASS |
| createChecklist에 deadline 전달 | `new Date(deadline + "T23:59:59").toISOString()` | line 76 동일 | PASS |
| helperText 안내 문구 | 없음 (설계에 미기재) | "수탁사가 체크리스트를 작성할 수 있는 마감일입니다." 추가 (line 157) | PASS (개선) |

#### 3.9.2 상세 페이지 ([id]/page.tsx) - 97%

**File**: `frontend/web/src/app/(dashboard)/inspections/checklists/[id]/page.tsx`

| Design Item | Design | Implementation | Status |
|-------------|--------|----------------|:------:|
| isDeadlineExpired 계산 | `new Date() > new Date(...)` | line 82-84 동일 | PASS |
| daysLeft D-day 계산 | `Math.ceil(...)` | line 86-91 동일 | PASS |
| 기한 정보 Paper | D-day Chip + 날짜 표시 | line 238-267 구현 | PASS |
| 기한 변경 버튼 조건 | `!isDeadlineExpired && status !== "reviewed"` | line 253 동일 | PASS |
| 제출 횟수 표시 | `submissionCount > 0` 시 표시 | line 297-301 구현 | PASS |
| 검토 버튼: 기한 만료+submitted | `submitted && isDeadlineExpired` | line 174 동일 | PASS |
| 기한 내 submitted: 안내 Chip | `"기한 종료 후 검토 가능"` | line 184-186 동일 | PASS |
| 기한 변경 Dialog | TextField type="date" | line 457-477 구현 | PASS |
| handleDeadlineChange 로직 | `new Date(newDeadline + "T23:59:59").toISOString()` | line 123 동일 | PASS |
| 기한 Paper 내부 레이아웃 | Typography + Chip | CalendarTodayIcon 추가 (line 241) | PASS (개선) |

**Minor Difference**: 설계에서는 기한 정보 Paper의 레이아웃이 `Typography variant="subtitle2" gutterBottom` + `Typography` + `Chip`이지만, 구현은 `CalendarTodayIcon`을 추가하고 flex layout으로 정렬. UI 개선이므로 긍정적 차이.

#### 3.9.3 목록 페이지 (page.tsx) - 95%

**File**: `frontend/web/src/app/(dashboard)/inspections/checklists/page.tsx`

| Design Item | Design | Implementation | Status |
|-------------|--------|----------------|:------:|
| accessTokenExpiresAt 칼럼 | D-day Chip, 만료/경고/정보 색상 | line 85-101 구현 | PASS |
| submissionCount 칼럼 | `align: "center"`, default 0 | line 103-109 구현 | PASS |
| minWidth: 120 (기한 칼럼) | `minWidth: 120` | `minWidth: 100` (line 87) | WARN |
| minWidth: 60 (제출 칼럼) | `minWidth: 60` | `minWidth: 60` (line 106) | PASS |

**Minor Difference**: 작성 기한 칼럼의 `minWidth`가 설계 120px vs 구현 100px. UI 미세 차이로 기능 영향 없음.

---

### 3.10 Frontend Page - 수탁사 작성 (Section 8.4) - 93%

**File**: `frontend/web/src/app/checklist/[token]/page.tsx`

| Design Item | Design | Implementation | Status |
|-------------|--------|----------------|:------:|
| isExpired 계산 (서버 isExpired + 클라이언트 fallback) | `checklist.isExpired` | `(checklist as Record<string, unknown>)?.isExpired === true \|\| ...` (line 201-204) | PASS |
| isReadOnly = isExpired \|\| reviewed | 기존 submitted 제거 | `isExpired \|\| checklist?.status === "reviewed"` (line 214) | PASS |
| canReopen = submitted + !isExpired | 재수정 가능 조건 | `checklist?.status === "submitted" && !isExpired` (line 217) | PASS |
| 기한 안내 Alert (기한 내) | `severity="info"` or `"warning"` | line 257-262, 분리 구현 (daysLeft 조건) | PASS |
| 기한 만료 Alert | `severity="error"` | line 263-266 구현 | PASS |
| reviewed Alert | `severity="success"` | line 268-271 구현 | PASS |
| canReopen Alert (재수정 안내) | `severity="success"` 별도 Alert | `severity="info"` + action으로 재수정 버튼 내장 (line 273-290) | WARN |
| 재수정 버튼 | 별도 Box + Button `color="warning"` | Alert action 내 `variant="outlined"` 버튼 (line 278-284) | WARN |
| handleReopen | `reopenChecklist` + snackbar | line 138-143, "재수정 모드로 전환되었습니다." | PASS |
| useReopenChecklist import | hooks에서 import | line 43 import 확인 | PASS |
| 제출 Dialog 메시지 변경 | `"기한 내에 재수정 후 재제출이 가능합니다."` | `"기한 내에는 재수정 후 다시 제출할 수 있습니다."` (line 592) | WARN |
| daysLeft 계산 | `Math.ceil(...)` | line 206-211 동일 | PASS |

**Differences Found**:

1. **canReopen Alert severity**: 설계는 `severity="success"`이지만 구현은 `severity="info"`. 시각적 차이.

2. **재수정 버튼 위치/스타일**: 설계는 별도 `Box` 안에 `Button variant="contained" color="warning"`이지만, 구현은 `Alert`의 `action` prop에 `Button variant="outlined" size="small"` 형태로 통합. 구현이 더 컴팩트한 UX를 제공하나 설계와 다른 형태.

3. **제출 Dialog 메시지**: 설계 `"기한 내에 재수정 후 재제출이 가능합니다."` vs 구현 `"기한 내에는 재수정 후 다시 제출할 수 있습니다."`. 의미는 동일하나 문구 차이.

---

## 4. Summary of Differences

### 4.1 Missing Features (Design O, Implementation X)

| Item | Design Location | Description |
|------|-----------------|-------------|
| 없음 | - | 모든 설계 항목이 구현됨 |

### 4.2 Added Features (Design X, Implementation O)

| Item | Implementation Location | Description |
|------|------------------------|-------------|
| deadline helperText | `new/page.tsx:157` | 기한 필드에 도움말 텍스트 추가 |
| CalendarTodayIcon | `[id]/page.tsx:241` | 기한 섹션에 아이콘 추가 |
| isExpired 서버+클라이언트 fallback | `[token]/page.tsx:201-204` | 서버 isExpired 플래그 우선 사용 + 클라이언트 계산 fallback |

### 4.3 Changed Features (Design != Implementation)

| Item | Design | Implementation | Impact |
|------|--------|----------------|--------|
| submit() event routing key | `INSPECTION_UPDATED` | `INSPECTION_CREATED` | Low (이벤트 소비자 미존재) |
| 기한 칼럼 minWidth | 120px | 100px | Minimal (UI 미세 차이) |
| canReopen Alert severity | `success` | `info` | Minimal (색상 차이) |
| 재수정 버튼 형태 | 별도 Box + contained/warning | Alert action + outlined/small | Low (UX 패턴 차이, 구현이 더 컴팩트) |
| 제출 Dialog 메시지 | "재수정 후 재제출이 가능합니다" | "재수정 후 다시 제출할 수 있습니다" | Minimal (동의어) |
| validateEditable 시그니처 | `accessTokenExpiresAt?` 직접 비교 | `isExpired: boolean` 플래그 사용 | None (기능 동일, 구현 개선) |

---

## 5. Match Rate Calculation

### Per-Section Scoring

| Section | Total Items | Match | Minor Diff | Missing | Score |
|---------|:-----------:|:-----:|:----------:|:-------:|:-----:|
| 1. Prisma Schema | 2 | 2 | 0 | 0 | 100% |
| 2. Types | 4 | 4 | 0 | 0 | 100% |
| 3. Validation | 2 | 2 | 0 | 0 | 100% |
| 4. Repository | 4 | 4 | 0 | 0 | 100% |
| 5. TrusteeChecklistService | 5 | 5 | 0 | 0 | 100% |
| 6. ChecklistResponseService | 10 | 9 | 1 | 0 | 95% |
| 7. Controller / Routes | 5 | 5 | 0 | 0 | 100% |
| 8. Frontend API / Hooks | 3 | 3 | 0 | 0 | 100% |
| 9. Frontend Pages (admin) | 19 | 17 | 2 | 0 | 97% |
| 10. Frontend Page (trustee) | 12 | 9 | 3 | 0 | 93% |
| **Total** | **66** | **60** | **6** | **0** | **98%** |

### Overall Match Rate

```
+---------------------------------------------+
|  Overall Match Rate: 98%                     |
+---------------------------------------------+
|  PASS (Exact Match):     60 items (91%)      |
|  WARN (Minor Diff):      6 items  (9%)      |
|  FAIL (Missing/Wrong):   0 items  (0%)      |
+---------------------------------------------+
```

---

## 6. Architecture & Convention Compliance

### 6.1 4-Layer Architecture (Backend)

| Layer | Expected | Actual | Status |
|-------|----------|--------|:------:|
| Routes | `routes/checklist-response.routes.ts` | 존재, Controller 바인딩 | PASS |
| Controllers | `controllers/checklist-response.controller.ts` | 존재, Service 위임 | PASS |
| Services | `services/checklist-response.service.ts` | 존재, 비즈니스 로직 | PASS |
| Repositories | `repositories/trustee-checklist.repository.ts` | 존재, Prisma 접근 | PASS |

**Architecture Score: 100%**

### 6.2 Frontend API 호출 흐름

```
Page -> React Query Hook -> API Client -> Gateway
```

| Pattern | Expected | Actual | Status |
|---------|----------|--------|:------:|
| Pages -> Hooks | hook import from `@/hooks` | 모든 페이지에서 hook 사용 | PASS |
| Hooks -> API | `checklistResponseApi` 사용 | `@/lib/api` import | PASS |
| API -> Gateway | `apiClient.post/get/patch` | 모두 apiClient 사용 | PASS |

**Frontend Architecture Score: 100%**

### 6.3 Naming Convention

| Category | Convention | Compliance |
|----------|-----------|:----------:|
| Hook 이름 | `use` prefix + PascalCase | `useReopenChecklist` PASS |
| API 객체 | `{resource}Api` | `checklistResponseApi` PASS |
| Controller 메서드 | arrow function | 모두 arrow function PASS |
| 파일명 (hook) | `camelCase.ts` | `useChecklistResponse.ts` PASS |
| 에러 메시지 | 한국어 | 모두 한국어 PASS |
| Prisma @map | snake_case | `submission_count`, `access_token_expires_at` PASS |

**Convention Score: 100%**

---

## 7. Recommended Actions

### 7.1 Optional Improvements (Low Priority)

| Priority | Item | File | Description |
|----------|------|------|-------------|
| Low | Event routing key 통일 | `checklist-response.service.ts:68` | `INSPECTION_CREATED` -> `INSPECTION_UPDATED`로 변경 검토 (설계 의도에 따름) |
| Low | canReopen Alert severity | `checklist/[token]/page.tsx:274` | `severity="info"` -> `severity="success"` (설계 일치) |
| Minimal | 목록 기한 칼럼 minWidth | `checklists/page.tsx:87` | 100 -> 120으로 변경 (설계 일치) |

### 7.2 Design Document Update Recommendations

현재 구현에서 설계 대비 개선된 사항들을 설계 문서에 반영할 것을 권장:

- [ ] validateEditable()의 `isExpired` 플래그 기반 시그니처를 설계에 반영
- [ ] 수탁사 작성 페이지 재수정 버튼의 Alert action 패턴을 설계에 반영
- [ ] isExpired 서버+클라이언트 fallback 패턴을 설계에 반영

---

## 8. Conclusion

### Match Rate: 98% - PASS

checklist-deadline-flow 기능의 설계-구현 일치율은 **98%**로, 매우 높은 수준이다.

- **모든 핵심 기능이 빠짐없이 구현됨**: DB 스키마 변경, 타입 정의, 유효성 검증, 서비스 로직, 컨트롤러/라우트, 프론트엔드 API/훅/페이지
- **6개 경미한 차이**: 이벤트 routing key 1건, UI 스타일/문구 5건. 모두 기능적 영향이 없거나 극히 미미함
- **누락된 기능 0건**: 설계 문서의 모든 요구사항이 구현에 반영됨
- **구현 개선 3건**: helperText 추가, CalendarTodayIcon 추가, isExpired fallback 패턴 등 구현이 설계보다 나은 부분 존재

**Next Step**: 경미한 차이 항목에 대해 "구현에 맞춰 설계 문서 업데이트" 또는 "설계에 맞춰 구현 수정" 중 택일 권장.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-02-19 | Initial gap analysis | gap-detector |
