# Design: 체크리스트 검토/반려 플로우

> Plan: `docs/01-plan/features/checklist-review-rejection.plan.md`

## 1. 데이터 모델

### 1.1 Prisma 스키마 변경

#### TrusteeChecklistStatus enum 수정
```prisma
enum TrusteeChecklistStatus {
  draft
  sent
  in_progress
  submitted
  reviewed
  rejected        // 추가
}
```

#### TrusteeChecklist 모델 수정
```prisma
model TrusteeChecklist {
  // ... 기존 필드 유지 ...

  // 검토 차수 (반려→재제출 사이클 카운트)
  reviewRound     Int @default(0) @map("review_round")

  // 관계 추가
  categories  TrusteeChecklistCategory[]
  reviews     ItemReview[]              // 추가
  snapshots   ChecklistSnapshot[]       // 추가
}
```

#### ItemReview 모델 (신규)
```prisma
model ItemReview {
  id          String   @id @default(cuid())
  checklistId String   @map("checklist_id")
  itemId      String   @map("item_id")
  status      String   // "approved" | "rejected"
  reason      String?  @db.Text
  reviewedAt  DateTime @default(now()) @map("reviewed_at")
  reviewRound Int      @map("review_round")

  checklist TrusteeChecklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)

  @@index([checklistId, reviewRound])
  @@index([itemId])
  @@map("item_reviews")
}
```

#### ChecklistSnapshot 모델 (신규)
```prisma
model ChecklistSnapshot {
  id          String   @id @default(cuid())
  checklistId String   @map("checklist_id")
  round       Int      // 제출 차수 (submissionCount 값)
  data        Json     // 전체 항목 데이터 JSON
  submittedAt DateTime @map("submitted_at")
  createdAt   DateTime @default(now()) @map("created_at")

  checklist TrusteeChecklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)

  @@unique([checklistId, round])
  @@map("checklist_snapshots")
}
```

### 1.2 TypeScript 타입 (`@trustee/types/src/checklist.ts`)

```typescript
// TrusteeChecklistStatus에 "rejected" 추가
export type TrusteeChecklistStatus =
  | "draft" | "sent" | "in_progress"
  | "submitted" | "reviewed" | "rejected";

// TrusteeChecklist에 reviewRound 추가
export interface TrusteeChecklist {
  // ... 기존 필드 ...
  reviewRound: number;
}

// 항목별 검토 결과
export interface ItemReview {
  id: string;
  checklistId: string;
  itemId: string;
  status: "approved" | "rejected";
  reason?: string;
  reviewedAt: Date;
  reviewRound: number;
}

// 제출 스냅샷
export interface ChecklistSnapshot {
  id: string;
  checklistId: string;
  round: number;
  data: SnapshotItemData[];
  submittedAt: Date;
}

// 스냅샷에 저장되는 항목별 데이터
export interface SnapshotItemData {
  itemId: string;
  no: string;
  question: string;
  applicable: boolean;
  answer: ChecklistAnswer | null;
  currentStatus: string | null;
  remarks: string | null;
  evidenceFileNames: string[];  // 파일명 목록만 저장
}

// 반려 요청 DTO
export interface RejectChecklistInput {
  items: {
    itemId: string;
    status: "approved" | "rejected";
    reason?: string;
  }[];
  newDeadline: string;  // ISO 날짜 문자열 (새 작성 기한)
}

// Diff 결과
export interface ChecklistDiffResult {
  previousRound: number;
  currentRound: number;
  changes: ChecklistDiffItem[];
}

export interface ChecklistDiffItem {
  itemId: string;
  no: string;
  question: string;
  fields: ChecklistDiffField[];
}

export interface ChecklistDiffField {
  field: "answer" | "currentStatus" | "remarks" | "evidenceFiles" | "applicable";
  previous: string | null;
  current: string | null;
  changed: boolean;
}
```

## 2. API 설계

### 2.1 위탁사 API (인증 필요)

#### POST `/api/trustee-checklists/:id/reject` - 반려 처리
```
Request Body: RejectChecklistInput
{
  "items": [
    { "itemId": "clxxx1", "status": "rejected", "reason": "증빙 자료 부족" },
    { "itemId": "clxxx2", "status": "approved" },
    { "itemId": "clxxx3", "status": "rejected", "reason": "이행 현황 미흡" }
  ],
  "newDeadline": "2026-03-01T23:59:59.000Z"
}

Response 200:
{ "data": TrusteeChecklist }
```

**비즈니스 규칙:**
- `submitted` 상태에서만 반려 가능
- `items` 배열에 반려(`rejected`) 항목이 최소 1개 이상 있어야 함
- `newDeadline`은 현재 시각 이후여야 함
- 처리 순서:
  1. `ItemReview` 레코드 생성 (각 항목별)
  2. `TrusteeChecklist.reviewRound` 증가
  3. `TrusteeChecklist.status` → `rejected`
  4. `TrusteeChecklist.accessTokenExpiresAt` → `newDeadline`

#### POST `/api/trustee-checklists/:id/review` - 검토 완료
```
Request Body: (없음 또는 빈 객체)

Response 200:
{ "data": TrusteeChecklist }
```

**비즈니스 규칙:**
- `submitted` 상태에서만 검토 완료 가능
- 기한 만료 여부 체크 제거 (위탁사가 수동으로 검토 완료 처리)
- `TrusteeChecklist.status` → `reviewed`

#### GET `/api/trustee-checklists/:id/diff` - 변경사항 비교
```
Query: ?round=2 (비교할 제출 차수, 생략 시 최근 2건 비교)

Response 200:
{
  "data": {
    "previousRound": 1,
    "currentRound": 2,
    "changes": [
      {
        "itemId": "clxxx1",
        "no": "1.1.1",
        "question": "개인정보 보호법 준수 여부",
        "fields": [
          {
            "field": "answer",
            "previous": "no",
            "current": "yes",
            "changed": true
          },
          {
            "field": "currentStatus",
            "previous": null,
            "current": "개선 완료",
            "changed": true
          },
          {
            "field": "remarks",
            "previous": null,
            "current": null,
            "changed": false
          },
          {
            "field": "evidenceFiles",
            "previous": "",
            "current": "보안점검보고서.pdf",
            "changed": true
          }
        ]
      }
    ]
  }
}
```

#### GET `/api/trustee-checklists/:id/reviews` - 검토 이력 조회
```
Query: ?round=1 (특정 차수, 생략 시 최신)

Response 200:
{
  "data": ItemReview[]
}
```

### 2.2 수탁사 API (토큰 기반)

#### GET `/api/checklist-response/:token/reviews` - 반려 사유 조회
```
Response 200:
{
  "data": ItemReview[]  // 최신 reviewRound의 반려 사유
}
```

## 3. Validation (Zod 스키마)

```typescript
// inspection/src/validation.ts에 추가

export const rejectChecklistSchema = z.object({
  items: z.array(z.object({
    itemId: z.string().min(1, "항목 ID는 필수입니다"),
    status: z.enum(["approved", "rejected"]),
    reason: z.string().optional(),
  })).min(1, "최소 1개의 항목이 필요합니다")
    .refine(
      (items) => items.some((item) => item.status === "rejected"),
      "반려 항목이 최소 1개 이상 있어야 합니다"
    ),
  newDeadline: z.string().min(1, "새 작성 기한은 필수입니다"),
});
```

## 4. Repository 메서드

### 4.1 TrusteeChecklistRepository 추가 메서드

```typescript
// 반려 처리 (트랜잭션)
async reject(params: {
  checklistId: string;
  items: { itemId: string; status: string; reason?: string }[];
  reviewRound: number;
  newDeadline: Date;
}): Promise<TrusteeChecklist>

// 스냅샷 저장
async createSnapshot(params: {
  checklistId: string;
  round: number;
  data: unknown;
  submittedAt: Date;
}): Promise<ChecklistSnapshot>

// 스냅샷 조회 (특정 차수)
async findSnapshot(checklistId: string, round: number): Promise<ChecklistSnapshot | null>

// 스냅샷 목록 (체크리스트별)
async findSnapshots(checklistId: string): Promise<ChecklistSnapshot[]>

// 항목별 검토 결과 조회
async findReviews(checklistId: string, reviewRound?: number): Promise<ItemReview[]>
```

### 4.2 reject 트랜잭션 상세

```typescript
async reject(params) {
  return prisma.$transaction(async (tx) => {
    // 1. ItemReview 레코드 일괄 생성
    await tx.itemReview.createMany({
      data: params.items.map((item) => ({
        checklistId: params.checklistId,
        itemId: item.itemId,
        status: item.status,
        reason: item.reason || null,
        reviewRound: params.reviewRound,
      })),
    });

    // 2. 체크리스트 상태 + 기한 + 차수 업데이트
    return tx.trusteeChecklist.update({
      where: { id: params.checklistId },
      data: {
        status: "rejected",
        reviewRound: params.reviewRound,
        accessTokenExpiresAt: params.newDeadline,
      },
      include: fullInclude,
    });
  });
}
```

## 5. Service 로직

### 5.1 TrusteeChecklistService 추가

```typescript
// 반려 처리
async reject(id: string, dto: RejectChecklistInput) {
  const checklist = await this.repository.findById(id);
  if (!checklist) throw new NotFoundError("TrusteeChecklist", id);
  if (checklist.status !== "submitted") {
    throw new ValidationError("제출된 체크리스트만 반려할 수 있습니다.");
  }

  const newDeadline = new Date(dto.newDeadline);
  if (newDeadline <= new Date()) {
    throw new ValidationError("새 작성 기한은 현재 시각 이후여야 합니다.");
  }

  const newRound = (checklist.reviewRound || 0) + 1;
  return this.repository.reject({
    checklistId: id,
    items: dto.items,
    reviewRound: newRound,
    newDeadline,
  });
}

// 검토 완료
async review(id: string) {
  const checklist = await this.repository.findById(id);
  if (!checklist) throw new NotFoundError("TrusteeChecklist", id);
  if (checklist.status !== "submitted") {
    throw new ValidationError("제출된 체크리스트만 검토할 수 있습니다.");
  }
  return this.repository.update(id, { status: "reviewed" });
}

// 변경사항 비교
async getDiff(id: string, round?: number) {
  const snapshots = await this.repository.findSnapshots(id);
  if (snapshots.length < 2) {
    throw new ValidationError("비교할 스냅샷이 부족합니다 (최소 2건 필요).");
  }
  // round 지정 시: round와 round-1 비교
  // round 미지정 시: 마지막 2건 비교
  const current = round
    ? snapshots.find((s) => s.round === round)
    : snapshots[snapshots.length - 1];
  const previous = round
    ? snapshots.find((s) => s.round === round - 1)
    : snapshots[snapshots.length - 2];

  if (!current || !previous) {
    throw new ValidationError("비교 대상 스냅샷을 찾을 수 없습니다.");
  }

  return buildDiff(previous, current);
}

// 검토 이력 조회
async getReviews(id: string, round?: number) {
  const checklist = await this.repository.findById(id);
  if (!checklist) throw new NotFoundError("TrusteeChecklist", id);
  const targetRound = round || checklist.reviewRound;
  return this.repository.findReviews(id, targetRound);
}
```

### 5.2 ChecklistResponseService 수정

```typescript
// submit 메서드에 스냅샷 자동 생성 추가
async submit(token: string, dto: SubmitTrusteeChecklistInput) {
  const checklist = await this.getByToken(token);
  this.validateEditable(checklist);

  const newSubmissionCount = (checklist.submissionCount || 0) + 1;

  // 제출 시 스냅샷 자동 저장
  const snapshotData = this.buildSnapshotData(checklist);
  await this.repository.createSnapshot({
    checklistId: checklist.id,
    round: newSubmissionCount,
    data: snapshotData,
    submittedAt: new Date(),
  });

  const updated = await this.repository.update(checklist.id, {
    status: "submitted",
    submittedAt: new Date(),
    submissionCount: newSubmissionCount,
    contactName: dto.contactName,
    contactEmail: dto.contactEmail || undefined,
    contactPhone: dto.contactPhone || undefined,
  });

  // ... 이벤트 발행 ...
  return updated;
}

// 스냅샷 데이터 구성 헬퍼
private buildSnapshotData(checklist: FullChecklist): SnapshotItemData[] {
  const items: SnapshotItemData[] = [];
  for (const cat of checklist.categories) {
    for (const sec of cat.sections) {
      for (const item of sec.items) {
        items.push({
          itemId: item.id,
          no: item.no,
          question: item.question,
          applicable: item.applicable,
          answer: item.answer,
          currentStatus: item.currentStatus,
          remarks: item.remarks,
          evidenceFileNames: item.evidenceFiles.map((f) => f.fileName),
        });
      }
    }
  }
  return items;
}

// validateEditable 수정: rejected 상태도 편집 가능
private validateEditable(checklist: { status: string; isExpired: boolean }) {
  if (checklist.status === "reviewed") {
    throw new ForbiddenError("검토가 완료된 체크리스트는 수정할 수 없습니다.");
  }
  if (checklist.isExpired) {
    throw new ForbiddenError("작성 기한이 종료되었습니다.");
  }
  // sent, in_progress, submitted, rejected → 기한 내 수정 가능
}

// 반려 사유 조회 (수탁사용)
async getReviews(token: string) {
  const checklist = await this.getByToken(token);
  return this.repository.findReviews(checklist.id, checklist.reviewRound);
}
```

### 5.3 Diff 빌드 로직 (`buildDiff`)

```typescript
function buildDiff(
  previous: ChecklistSnapshot,
  current: ChecklistSnapshot
): ChecklistDiffResult {
  const prevMap = new Map(
    (previous.data as SnapshotItemData[]).map((item) => [item.itemId, item])
  );

  const changes: ChecklistDiffItem[] = [];

  for (const curr of current.data as SnapshotItemData[]) {
    const prev = prevMap.get(curr.itemId);
    if (!prev) continue;

    const fields: ChecklistDiffField[] = [
      {
        field: "answer",
        previous: prev.answer,
        current: curr.answer,
        changed: prev.answer !== curr.answer,
      },
      {
        field: "currentStatus",
        previous: prev.currentStatus,
        current: curr.currentStatus,
        changed: prev.currentStatus !== curr.currentStatus,
      },
      {
        field: "remarks",
        previous: prev.remarks,
        current: curr.remarks,
        changed: prev.remarks !== curr.remarks,
      },
      {
        field: "evidenceFiles",
        previous: prev.evidenceFileNames.join(", "),
        current: curr.evidenceFileNames.join(", "),
        changed: prev.evidenceFileNames.join(",") !== curr.evidenceFileNames.join(","),
      },
      {
        field: "applicable",
        previous: String(prev.applicable),
        current: String(curr.applicable),
        changed: prev.applicable !== curr.applicable,
      },
    ];

    // 변경된 필드가 있는 항목만 포함
    if (fields.some((f) => f.changed)) {
      changes.push({
        itemId: curr.itemId,
        no: curr.no,
        question: curr.question,
        fields,
      });
    }
  }

  return {
    previousRound: previous.round,
    currentRound: current.round,
    changes,
  };
}
```

## 6. Controller & Routes

### 6.1 TrusteeChecklistController 추가

```typescript
// 반려
reject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await this.service.reject(req.params.id, req.body);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};

// 검토 완료
review = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await this.service.review(req.params.id);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};

// 변경사항 비교
getDiff = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const round = req.query.round ? Number(req.query.round) : undefined;
    const result = await this.service.getDiff(req.params.id, round);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};

// 검토 이력
getReviews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const round = req.query.round ? Number(req.query.round) : undefined;
    const result = await this.service.getReviews(req.params.id, round);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};
```

### 6.2 ChecklistResponseController 추가

```typescript
// 반려 사유 조회 (수탁사)
getReviews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await this.service.getReviews(req.params.token);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};
```

### 6.3 Routes 추가

```typescript
// trustee-checklist.routes.ts 추가분
router.post("/:id/reject", validate(rejectChecklistSchema), controller.reject);
router.post("/:id/review", controller.review);
router.get("/:id/diff", controller.getDiff);
router.get("/:id/reviews", controller.getReviews);

// checklist-response.routes.ts 추가분
router.get("/:token/reviews", controller.getReviews);
```

## 7. 프론트엔드 API & 훅

### 7.1 API 클라이언트

```typescript
// lib/api/trustee-checklists.ts 추가
reject(id: string, data: RejectChecklistInput): Promise<ChecklistResponse> {
  return apiClient.post(`/api/trustee-checklists/${id}/reject`, data);
},

review(id: string): Promise<ChecklistResponse> {
  return apiClient.post(`/api/trustee-checklists/${id}/review`);
},

getDiff(id: string, round?: number): Promise<{ data: ChecklistDiffResult }> {
  return apiClient.get(`/api/trustee-checklists/${id}/diff`, round ? { round } : undefined);
},

getReviews(id: string, round?: number): Promise<{ data: ItemReview[] }> {
  return apiClient.get(`/api/trustee-checklists/${id}/reviews`, round ? { round } : undefined);
},

// lib/api/checklist-response.ts 추가
getReviews(token: string): Promise<{ data: ItemReview[] }> {
  return apiClient.get(`/api/checklist-response/${token}/reviews`);
},
```

### 7.2 React Query 훅

```typescript
// hooks/useTrusteeChecklists.ts 추가

export function useRejectChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RejectChecklistInput }) =>
      trusteeChecklistsApi.reject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });
    },
  });
}

export function useReviewChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trusteeChecklistsApi.review(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });
    },
  });
}

export function useChecklistDiff(id: string, round?: number) {
  return useQuery({
    queryKey: [...CHECKLISTS_KEY, id, "diff", round],
    queryFn: () => trusteeChecklistsApi.getDiff(id, round),
    enabled: !!id,
  });
}

export function useChecklistReviews(id: string, round?: number) {
  return useQuery({
    queryKey: [...CHECKLISTS_KEY, id, "reviews", round],
    queryFn: () => trusteeChecklistsApi.getReviews(id, round),
    enabled: !!id,
  });
}

// hooks/useChecklistResponse.ts 추가

export function useChecklistResponseReviews(token: string) {
  return useQuery({
    queryKey: [...RESPONSE_KEY, token, "reviews"],
    queryFn: () => checklistResponseApi.getReviews(token),
    enabled: !!token,
  });
}
```

## 8. 프론트엔드 UI

### 8.1 위탁사: 체크리스트 상세 페이지 (`inspections/checklists/[id]/page.tsx`)

#### 상단 액션 버튼 영역
- `submitted` 상태일 때: "검토 완료" 버튼 + "반려" 버튼 표시
- `rejected` 상태일 때: "반려됨" 상태 Chip 표시 + "변경사항 보기" 버튼
- `reviewed` 상태일 때: "검토 완료" 상태 Chip 표시

#### RejectDialog 컴포넌트
```
┌─ 체크리스트 반려 ──────────────────────┐
│                                         │
│  새 작성 기한: [날짜 선택]              │
│                                         │
│  ┌─ 항목 목록 ──────────────────┐       │
│  │ □ 1.1.1 개인정보 보호법...   │       │
│  │   반려 사유: [               ]│       │
│  │                              │       │
│  │ □ 1.1.2 접근 권한 관리...    │       │
│  │   반려 사유: [               ]│       │
│  │                              │       │
│  │ (체크한 항목만 반려 사유 입력)│       │
│  └──────────────────────────────┘       │
│                                         │
│              [취소]  [반려 처리]         │
└─────────────────────────────────────────┘
```

- 각 항목에 체크박스 (반려 여부)
- 체크된 항목만 반려 사유 TextField 표시
- 체크하지 않은 항목은 자동으로 `approved`
- 새 작성 기한 DatePicker 필수 입력

#### DiffView 컴포넌트
- `submissionCount >= 2`일 때 "변경사항 보기" 버튼 표시
- 토글 버튼으로 diff 모드 on/off
- 변경된 항목에 노란색 배경 하이라이트
- 각 변경 필드에 `이전 값 → 현재 값` 표시
  ```
  답변: no → yes (변경)
  이행 현황: (미입력) → 개선 완료 (변경)
  ```

### 8.2 수탁사: 체크리스트 작성 페이지 (`checklist/[token]/page.tsx`)

#### rejected 상태 처리
- 페이지 상단에 Alert: "반려되었습니다. 반려 사유를 확인하고 보완 후 재제출해주세요."
- `rejected` 상태에서도 편집/재제출 가능 (기한 내)

#### 반려 항목 하이라이트
- 반려된 항목의 Paper 카드에 빨간 테두리 (`border: 2px solid error.main`)
- 항목 상단에 Alert (severity="error"):
  ```
  반려 사유: 증빙 자료가 부족합니다. 관련 문서를 추가로 첨부해주세요.
  ```
- 승인된 항목은 별도 표시 없음 (기존 스타일 유지)

### 8.3 상태 표시 매핑

| 상태 | 한글 라벨 | Chip 색상 | 설명 |
|------|----------|----------|------|
| `draft` | 초안 | default | 초기 상태 |
| `sent` | 발송 | info | 수탁사에 링크 발송 |
| `in_progress` | 작성중 | warning | 수탁사 작성 시작 |
| `submitted` | 제출완료 | success | 수탁사 제출 |
| `reviewed` | 검토완료 | success | 위탁사 검토 완료 |
| `rejected` | 반려 | error | 위탁사 반려 |

## 9. 구현 순서 (세부)

### Phase 1: 데이터 모델 & 타입
1. `inspection/prisma/schema.prisma` - enum에 `rejected` 추가, `reviewRound` 필드, `ItemReview`, `ChecklistSnapshot` 모델 추가
2. `prisma db push` 실행
3. `@trustee/types/src/checklist.ts` - 타입 추가 (`ItemReview`, `ChecklistSnapshot`, `RejectChecklistInput`, `ChecklistDiffResult` 등)
4. `inspection/src/validation.ts` - `rejectChecklistSchema` 추가

### Phase 2: Repository & Service
5. `trustee-checklist.repository.ts` - `reject()`, `createSnapshot()`, `findSnapshot()`, `findSnapshots()`, `findReviews()` 추가
6. `trustee-checklist.service.ts` - `reject()`, `review()`, `getDiff()`, `getReviews()`, `buildDiff()` 추가
7. `checklist-response.service.ts` - `submit()`에 스냅샷 자동 생성 추가, `validateEditable()` 수정, `getReviews()` 추가

### Phase 3: Controller & Routes
8. `trustee-checklist.controller.ts` - `reject`, `review`, `getDiff`, `getReviews` 메서드 추가
9. `trustee-checklist.routes.ts` - 4개 라우트 추가
10. `checklist-response.controller.ts` - `getReviews` 메서드 추가
11. `checklist-response.routes.ts` - reviews 라우트 추가

### Phase 4: 프론트엔드 API & 훅
12. `lib/api/trustee-checklists.ts` - `reject()`, `review()`, `getDiff()`, `getReviews()` 추가
13. `lib/api/checklist-response.ts` - `getReviews()` 추가
14. `hooks/useTrusteeChecklists.ts` - 4개 훅 추가
15. `hooks/useChecklistResponse.ts` - `useChecklistResponseReviews` 추가

### Phase 5: 위탁사 UI
16. `inspections/checklists/[id]/page.tsx` - 상단 액션 버튼 (검토 완료/반려), RejectDialog, DiffView 추가

### Phase 6: 수탁사 UI
17. `checklist/[token]/page.tsx` - 반려 상태 Alert, 항목별 반려 사유 표시, 빨간 테두리 하이라이트

## 10. 주의사항

- **토큰 재사용**: 반려 시 `accessToken`은 변경하지 않음 (기존 링크 유지)
- **기한 변경**: 반려 시에만 `accessTokenExpiresAt`을 새 기한으로 변경
- **스냅샷 타이밍**: 반드시 `submit()` 시점에 스냅샷 생성 (반려 후 재제출 시 새 스냅샷)
- **검토 완료 조건 완화**: 기존에는 기한 만료 후에만 검토 가능했으나, 수동 검토 완료도 허용
- **하위 호환**: `reviewRound` 기본값 0, 기존 데이터 영향 없음
