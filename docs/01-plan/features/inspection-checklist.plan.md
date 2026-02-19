# Plan: 보안점검 체크리스트 기능 (inspection-checklist)

## 1. 개요

위탁사가 수탁사에게 전달하는 **보안점검 체크리스트** 기능을 구현한다.
PDF 원본(`-수탁사명- 수탁업체 보안 점검 체크리스트.pdf`)을 분석하여 구조화된 템플릿 시스템을 구축한다.

## 2. 핵심 요구사항

### 2.1 Root 템플릿 관리
- `inspection-checklist-template.json` 구조를 DB 모델로 변환
- Root 템플릿 CRUD (생성/조회/수정/삭제)
- 3단계 계층 구조: **범주(Category)** → **영역(Section)** → **통제항목(Item)**
- Root 템플릿은 관리자만 관리 가능

### 2.2 수탁사별 체크리스트 생성 (스냅샷 패턴)
- Root 템플릿을 기반으로 수탁사별 체크리스트 **복사본(Snapshot)** 생성
- 생성 시점의 Root 템플릿 전체 데이터를 Deep Copy
- **Root 템플릿이 수정되어도 이미 생성된 수탁사 체크리스트는 영향 없음**
- 수탁사 체크리스트에는 답변/현황/증빙자료/비고사항 작성 가능

### 2.3 체크리스트 PDF 컬럼 매핑
| PDF 컬럼 | DB 필드 | 설명 |
|----------|---------|------|
| No (범주) | `ChecklistCategory.no` | 범주 번호 (1, 2, 3) |
| 범주 | `ChecklistCategory.name` | 관리적보호조치, 개인정보생명주기, 기술적보호조치 |
| No (영역) | `ChecklistSection.no` | 영역 번호 (1.1, 1.2, ...) |
| 영역 | `ChecklistSection.name` | 개인정보보호정책, 개인정보보호조직, ... |
| No (항목) | `ChecklistItem.no` | 항목 번호 (1.1.1, 1.1.2, ...) |
| 통제 항목 | `ChecklistItem.question` | 점검 질문 |
| 대상여부 | `TrusteeChecklistItem.applicable` | Y/N |
| 답변 | `TrusteeChecklistItem.answer` | 예/아니오/해당없음/미응답 |
| 현황 | `TrusteeChecklistItem.status` | 이행 현황 기술 |
| 증빙 자료 | `TrusteeChecklistItem.evidence` | 증빙 자료명 |
| 비고 사항 | `TrusteeChecklistItem.remarks` | 비고 |

## 3. 데이터 모델

### 3.1 Root 템플릿 (inspection-service DB)

```
ChecklistTemplate        (Root 템플릿)
├── id, title, version, description, createdAt, updatedAt
│
├── ChecklistCategory    (범주: 관리적보호조치, 개인정보생명주기, 기술적보호조치)
│   ├── id, templateId, no, name, sortOrder
│   │
│   └── ChecklistSection (영역: 개인정보보호정책, 접근권한관리, ...)
│       ├── id, categoryId, no, name, sortOrder
│       │
│       └── ChecklistItem (통제항목: 72개 질문)
│           ├── id, sectionId, no, question, hint, sortOrder
```

### 3.2 수탁사별 체크리스트 (스냅샷)

```
TrusteeChecklist          (수탁사에 전달된 체크리스트)
├── id, trusteeId, templateId(참조용), templateVersion
├── title, inspectionScope, createdAt, updatedAt
├── submittedAt, status (draft/sent/in_progress/submitted/reviewed)
│
├── TrusteeChecklistCategory  (스냅샷 범주)
│   ├── id, checklistId, no, name, sortOrder
│   │
│   └── TrusteeChecklistSection (스냅샷 영역)
│       ├── id, categoryId, no, name, sortOrder
│       │
│       └── TrusteeChecklistItem  (스냅샷 항목 + 수탁사 답변)
│           ├── id, sectionId, no, question, hint, sortOrder
│           ├── applicable (Y/N)          ← 대상여부
│           ├── answer (예/아니오/해당없음/null)  ← 답변
│           ├── currentStatus (Text)       ← 현황
│           ├── evidence (Text)            ← 증빙 자료
│           └── remarks (Text)             ← 비고 사항
```

## 4. API 설계

### 4.1 Root 템플릿 API

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/api/checklist-templates` | 템플릿 목록 조회 |
| `GET` | `/api/checklist-templates/:id` | 템플릿 상세 (카테고리/영역/항목 전체 포함) |
| `POST` | `/api/checklist-templates` | 템플릿 생성 |
| `PATCH` | `/api/checklist-templates/:id` | 템플릿 수정 (항목 추가/수정/삭제) |
| `DELETE` | `/api/checklist-templates/:id` | 템플릿 삭제 |
| `POST` | `/api/checklist-templates/:id/import` | JSON 파일에서 템플릿 Import |

### 4.2 수탁사 체크리스트 API

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/api/trustee-checklists` | 수탁사 체크리스트 목록 |
| `GET` | `/api/trustee-checklists/:id` | 수탁사 체크리스트 상세 |
| `POST` | `/api/trustee-checklists` | 체크리스트 생성 (Root 스냅샷) |
| `PATCH` | `/api/trustee-checklists/:id` | 체크리스트 메타 수정 (scope, status) |
| `PATCH` | `/api/trustee-checklists/:id/items/:itemId` | 항목별 답변 저장 |
| `PATCH` | `/api/trustee-checklists/:id/items/batch` | 항목 일괄 답변 저장 |
| `DELETE` | `/api/trustee-checklists/:id` | 체크리스트 삭제 |

## 5. 프론트엔드 페이지

### 5.1 관리자 (위탁사) 페이지

| 경로 | 설명 |
|------|------|
| `/inspections/templates` | Root 템플릿 목록 |
| `/inspections/templates/new` | Root 템플릿 생성 (JSON Import 포함) |
| `/inspections/templates/:id` | Root 템플릿 상세/수정 |
| `/inspections/checklists` | 수탁사 체크리스트 목록 (전체) |
| `/inspections/checklists/new` | 수탁사 체크리스트 생성 (템플릿 선택 + 수탁사 선택) |
| `/inspections/checklists/:id` | 수탁사 체크리스트 상세/결과 확인 |

### 5.2 수탁사 응답 페이지 (추후)

| 경로 | 설명 |
|------|------|
| `/checklist/:id` | 수탁사가 체크리스트 답변 작성 |

## 6. 구현 순서

### Phase 1: DB 스키마 (inspection-service)
1. `ChecklistTemplate`, `ChecklistCategory`, `ChecklistSection`, `ChecklistItem` 모델 추가
2. `TrusteeChecklist`, `TrusteeChecklistCategory`, `TrusteeChecklistSection`, `TrusteeChecklistItem` 모델 추가
3. `pnpm db:push`로 스키마 반영

### Phase 2: Backend - Root 템플릿 API
1. Repository: `checklist-template.repository.ts`
2. Service: `checklist-template.service.ts`
3. Controller: `checklist-template.controller.ts`
4. Routes: `checklist-template.routes.ts`
5. Validation: 스키마 추가
6. JSON Import 기능 (`inspection-checklist-template.json` 파일 구조 파싱)

### Phase 3: Backend - 수탁사 체크리스트 API
1. Repository: `trustee-checklist.repository.ts`
2. Service: `trustee-checklist.service.ts` (**스냅샷 복사 로직 핵심**)
3. Controller: `trustee-checklist.controller.ts`
4. Routes: `trustee-checklist.routes.ts`
5. Validation: 스키마 추가

### Phase 4: 공유 타입 (@trustee/types)
1. `ChecklistTemplate`, `ChecklistCategory`, `ChecklistSection`, `ChecklistItem` 타입
2. `TrusteeChecklist`, `TrusteeChecklistItem` 타입
3. Create/Update Input 타입

### Phase 5: Frontend - 템플릿 관리 페이지
1. API 클라이언트: `lib/api/checklist-templates.ts`
2. React Query 훅: `hooks/useChecklistTemplates.ts`
3. 템플릿 목록 페이지: `/inspections/templates/page.tsx`
4. 템플릿 생성 페이지: `/inspections/templates/new/page.tsx`
5. 템플릿 상세 페이지: `/inspections/templates/[id]/page.tsx`

### Phase 6: Frontend - 수탁사 체크리스트 페이지
1. API 클라이언트: `lib/api/trustee-checklists.ts`
2. React Query 훅: `hooks/useTrusteeChecklists.ts`
3. 체크리스트 목록: `/inspections/checklists/page.tsx`
4. 체크리스트 생성: `/inspections/checklists/new/page.tsx`
5. 체크리스트 상세(결과확인): `/inspections/checklists/[id]/page.tsx`

### Phase 7: Gateway 프록시 추가
1. `/api/checklist-templates/**` → inspection-service
2. `/api/trustee-checklists/**` → inspection-service

## 7. 핵심 로직: 스냅샷 복사

```
POST /api/trustee-checklists
Body: { trusteeId, templateId }

1. Root 템플릿 조회 (Categories → Sections → Items 전체 포함)
2. TrusteeChecklist 레코드 생성 (templateVersion 기록)
3. 각 Category → TrusteeChecklistCategory 복사
4. 각 Section → TrusteeChecklistSection 복사
5. 각 Item → TrusteeChecklistItem 복사 (answer/status/evidence/remarks는 빈값)
→ 트랜잭션으로 원자적 처리
```

## 8. 제약사항 및 고려사항

- Root 템플릿 수정 시 기존 수탁사 체크리스트에 **절대 영향 없음** (스냅샷 패턴)
- 수탁사 체크리스트의 `templateId`는 참조용으로만 사용 (FK 아님)
- `templateVersion`으로 어떤 버전의 템플릿으로 생성되었는지 추적
- 72개 항목이 한 번에 복사되므로 트랜잭션 필수
- 기존 Inspection/InspectionItem 모델과는 별개 도메인으로 분리

## 9. 영향 범위

| 패키지 | 변경 내용 |
|--------|----------|
| `backend/services/inspection` | Prisma 스키마 추가, 새 API 4계층 추가 |
| `backend/packages/types` | 체크리스트 관련 타입 추가 |
| `backend/services/gateway` | 프록시 라우트 추가 |
| `frontend/web` | 6개 페이지 + API Client + Hooks |
| `frontend/packages/ui` | 필요 시 체크리스트 전용 컴포넌트 |
