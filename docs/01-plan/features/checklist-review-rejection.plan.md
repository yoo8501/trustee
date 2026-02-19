# Plan: 체크리스트 검토/반려 플로우

## 개요
위탁사가 수탁사의 체크리스트를 검토하여 완료 또는 반려 처리하고, 반려 시 항목별 사유를 전달하여 수탁사가 보완 후 재제출하며, 위탁사가 이전 제출과의 변경사항을 비교할 수 있는 기능

## 요구사항

### 1. 수탁사 (Trustee) - 작성/재제출
- 작성 기간(예: 20260211~20260221) 내에 얼마든지 재제출 가능
- 반려 시 기존 링크를 그대로 사용하여 재작성
- 반려된 항목의 사유를 확인 가능
- 반려 사유가 있는 항목은 시각적으로 구분

### 2. 위탁사 (Delegating Company) - 검토/반려
- 작성 기간이 끝나거나, 수동으로 제출을 마감 가능
- **검토 완료**: 전체 체크리스트를 검토 완료 처리
- **반려**: 항목별로 반려 사유를 작성하여 수탁사에게 전달
  - 어떤 항목이 반려인지 선택
  - 반려 사유(텍스트) 입력
- 반려 시 기존 링크는 유지하되, 새 작성 기한을 설정해야 함
- 재제출된 체크리스트에서 이전 제출과 비교하여 변경된 값을 쉽게 확인

### 3. 상태 흐름
```
sent → in_progress → submitted → reviewed (검토 완료)
                         ↓
                      rejected (반려)
                         ↓
                   in_progress (재작성)
                         ↓
                      submitted (재제출)
                         ↓
                   reviewed / rejected (반복 가능)
```

### 4. 변경사항 비교 (Diff)
- 위탁사가 재제출된 체크리스트를 볼 때 이전 제출과 비교 표시
- 변경된 필드: 답변, 이행 현황, 비고, 증빙 자료
- 시각적 표시: 변경된 항목 하이라이트, 이전 값 → 현재 값

## 영향 범위

### 백엔드
| 파일 | 변경 내용 |
|------|-----------|
| `inspection/prisma/schema.prisma` | `rejected` 상태 추가, `ItemReview` 모델 추가, `ChecklistSnapshot` 모델 추가 |
| `packages/types/src/checklist.ts` | `ItemReview`, `ChecklistSnapshot` 타입 추가, 상태에 `rejected` 추가 |
| `inspection/src/validation.ts` | 반려 API용 Zod 스키마 추가 |
| `inspection/src/repositories/trustee-checklist.repository.ts` | 반려 처리, 스냅샷 저장/조회 메서드 추가 |
| `inspection/src/services/checklist-response.service.ts` | 반려 로직, 스냅샷 생성/비교 로직 추가 |
| `inspection/src/controllers/checklist-response.controller.ts` | 반려 API, 스냅샷 비교 API 추가 |
| `inspection/src/routes/checklist-response.routes.ts` | 반려/비교 라우트 추가 |
| `inspection/src/controllers/trustee-checklist.controller.ts` | 위탁사 측 반려 API 추가 |
| `inspection/src/routes/trustee-checklist.routes.ts` | 위탁사 측 반려 라우트 추가 |

### 프론트엔드
| 파일 | 변경 내용 |
|------|-----------|
| `web/src/lib/api/trustee-checklists.ts` | 반려 API, 비교 API 클라이언트 추가 |
| `web/src/lib/api/checklist-response.ts` | 반려 사유 조회 API 추가 |
| `web/src/hooks/useTrusteeChecklists.ts` | `useRejectChecklist`, `useChecklistDiff` 훅 추가 |
| `web/src/hooks/useChecklistResponse.ts` | 반려 사유 조회 훅 추가 |
| `inspections/checklists/[id]/page.tsx` | 반려 다이얼로그(항목별 사유 입력), 변경사항 비교 뷰 추가 |
| `checklist/[token]/page.tsx` | 반려 사유 표시, 반려된 항목 하이라이트 |

### 데이터 모델 추가

#### ItemReview (항목별 검토 결과)
```
id          String   @id @default(cuid())
itemId      String   (TrusteeChecklistItem 참조)
checklistId String   (TrusteeChecklist 참조)
status      String   (approved / rejected)
reason      String?  (반려 사유)
reviewedAt  DateTime
reviewRound Int      (몇 차 검토인지)
```

#### ChecklistSnapshot (제출 시점 스냅샷)
```
id          String   @id @default(cuid())
checklistId String   (TrusteeChecklist 참조)
round       Int      (제출 차수)
data        JSON     (제출 시점의 전체 항목 데이터)
submittedAt DateTime
```

## 구현 순서

### Phase 1: 데이터 모델 & 타입 (백엔드)
1. Prisma 스키마에 `ItemReview`, `ChecklistSnapshot` 모델 추가
2. `@trustee/types`에 타입 정의 추가
3. Zod 검증 스키마 추가

### Phase 2: 스냅샷 & 반려 로직 (백엔드)
4. Repository에 스냅샷 저장/조회, 반려 처리 메서드 추가
5. Service에 반려 로직 구현 (항목별 사유 저장 + 기한 재설정 + 상태 변경)
6. Service에 제출 시 스냅샷 자동 생성 로직 추가
7. Service에 스냅샷 비교(diff) 로직 추가

### Phase 3: API 엔드포인트 (백엔드)
8. 위탁사용: POST `/api/trustee-checklists/:id/reject` (반려)
9. 위탁사용: GET `/api/trustee-checklists/:id/diff` (변경사항 비교)
10. 수탁사용: GET `/api/checklist-response/:token/reviews` (반려 사유 조회)
11. 게이트웨이 프록시 확인

### Phase 4: 프론트엔드 API & 훅
12. API 클라이언트 추가 (반려, diff, 반려사유 조회)
13. React Query 훅 추가

### Phase 5: 위탁사 UI (반려 & 비교)
14. 반려 다이얼로그: 항목별 반려/승인 선택 + 사유 입력
15. 변경사항 비교 뷰: 이전 제출과 현재 제출의 diff 표시
16. 체크리스트 상세 페이지에 `rejected` 상태 칩 + 반려 이력 표시

### Phase 6: 수탁사 UI (반려 사유 확인)
17. 반려된 항목에 반려 사유 표시 (빨간 테두리 + 사유 Alert)
18. 반려 상태에서 재작성 가능하도록 UI 처리

## 우선순위
- **P0**: 반려 처리 + 기한 재설정 (핵심 플로우)
- **P0**: 반려 사유 전달 + 수탁사 확인
- **P1**: 제출 스냅샷 저장 + 변경사항 비교
- **P2**: 검토 이력 (몇 차 검토인지 타임라인)
