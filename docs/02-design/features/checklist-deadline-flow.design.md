# Design: 체크리스트 기한 및 재제출 플로우 (checklist-deadline-flow)

> Plan 참조: `docs/01-plan/features/checklist-deadline-flow.plan.md`

---

## 1. Prisma 스키마 변경

`backend/services/inspection/prisma/schema.prisma`

### 1.1 TrusteeChecklist 모델 변경

```prisma
model TrusteeChecklist {
  id              String                 @id @default(cuid())
  trusteeId       String                 @map("trustee_id")
  templateId      String?                @map("template_id")
  templateVersion String?                @map("template_version")
  title           String
  inspectionScope String?                @map("inspection_scope") @db.Text
  status          TrusteeChecklistStatus @default(draft)
  submittedAt     DateTime?              @map("submitted_at")
  createdAt       DateTime               @default(now()) @map("created_at")
  updatedAt       DateTime               @updatedAt @map("updated_at")

  // 토큰 기반 접근
  accessToken          String    @unique @default(uuid()) @map("access_token")
  accessTokenExpiresAt DateTime  @map("access_token_expires_at")  // ← nullable → required

  // 제출 횟수 (신규)
  submissionCount Int @default(0) @map("submission_count")

  // 작성자 정보
  contactName  String? @map("contact_name")
  contactEmail String? @map("contact_email")
  contactPhone String? @map("contact_phone")

  categories TrusteeChecklistCategory[]

  @@map("trustee_checklists")
}
```

**변경 사항:**

| 필드 | Before | After |
|------|--------|-------|
| `accessTokenExpiresAt` | `DateTime?` (optional) | `DateTime` (required) |
| `submissionCount` | 없음 | `Int @default(0)` (신규) |

**마이그레이션 전략 (기존 데이터 보호):**
1. 기존 행의 `access_token_expires_at`이 NULL인 경우 기본값 설정 필요
2. `UPDATE trustee_checklists SET access_token_expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE access_token_expires_at IS NULL`
3. 이후 `prisma db push`

---

## 2. 타입 변경 (@trustee/types)

`backend/packages/types/src/checklist.ts`

### 2.1 TrusteeChecklist 인터페이스

```typescript
export interface TrusteeChecklist {
  id: string;
  trusteeId: string;
  templateId?: string;
  templateVersion?: string;
  title: string;
  inspectionScope?: string;
  status: TrusteeChecklistStatus;
  submittedAt?: Date;
  accessToken: string;
  accessTokenExpiresAt: Date;     // ← optional → required
  submissionCount: number;         // ← 신규
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  categories: TrusteeChecklistCategory[];
  createdAt: Date;
  updatedAt: Date;
}
```

### 2.2 CreateTrusteeChecklistInput 변경

```typescript
export interface CreateTrusteeChecklistInput {
  trusteeId: string;
  templateId: string;
  inspectionScope?: string;
  deadline: string;  // ← 신규: ISO 날짜 문자열, 필수
}
```

### 2.3 UpdateTrusteeChecklistInput 변경

```typescript
export interface UpdateTrusteeChecklistInput {
  inspectionScope?: string;
  status?: TrusteeChecklistStatus;
  deadline?: string;  // ← 신규: 기한 변경용, optional
}
```

---

## 3. Validation 변경

`backend/services/inspection/src/validation.ts`

### 3.1 createTrusteeChecklistSchema 변경

```typescript
export const createTrusteeChecklistSchema = z.object({
  trusteeId: z.string().min(1, "수탁사 ID는 필수입니다"),
  templateId: z.string().min(1, "템플릿 ID는 필수입니다"),
  inspectionScope: z.string().optional(),
  deadline: z.string().min(1, "작성 기한은 필수입니다"),  // ← 신규
});
```

### 3.2 updateTrusteeChecklistSchema 변경

```typescript
export const updateTrusteeChecklistSchema = z.object({
  inspectionScope: z.string().optional(),
  status: z.enum(["draft", "sent", "in_progress", "submitted", "reviewed"]).optional(),
  deadline: z.string().optional(),  // ← 신규
});
```

---

## 4. Backend Service 변경

### 4.1 TrusteeChecklistService 변경

`backend/services/inspection/src/services/trustee-checklist.service.ts`

#### create() 변경

```typescript
async create(dto: CreateTrusteeChecklistInput) {
  // ... 기존 수탁사 검증, 템플릿 조회 로직 동일

  // 스냅샷 생성 시 deadline을 accessTokenExpiresAt에 설정
  const checklist = await this.repository.createFromTemplate({
    trusteeId: dto.trusteeId,
    template,
    inspectionScope: dto.inspectionScope,
    accessTokenExpiresAt: new Date(dto.deadline),  // ← 신규
  });

  const updated = await this.repository.update(checklist.id, { status: "sent" });
  // ... 이벤트 발행
  return updated;
}
```

#### update() 변경 - 검토 완료 시 기한 검증

```typescript
async update(id: string, dto: UpdateTrusteeChecklistInput) {
  const existing = await this.repository.findById(id);
  if (!existing) {
    throw new NotFoundError("TrusteeChecklist", id);
  }

  // reviewed 상태로 변경 시: 기한 만료 확인
  if (dto.status === "reviewed") {
    if (!existing.accessTokenExpiresAt || new Date() < new Date(existing.accessTokenExpiresAt)) {
      throw new ValidationError("작성 기한이 종료된 후에만 검토를 진행할 수 있습니다.");
    }
    if (existing.status !== "submitted") {
      throw new ValidationError("제출된 체크리스트만 검토할 수 있습니다.");
    }
  }

  // deadline 변경 시: 기한 전에만 가능
  if (dto.deadline) {
    if (existing.accessTokenExpiresAt && new Date() > new Date(existing.accessTokenExpiresAt)) {
      throw new ValidationError("이미 만료된 기한은 변경할 수 없습니다.");
    }
    return this.repository.update(id, {
      ...dto,
      accessTokenExpiresAt: new Date(dto.deadline),
    });
  }

  return this.repository.update(id, dto);
}
```

### 4.2 ChecklistResponseService 변경

`backend/services/inspection/src/services/checklist-response.service.ts`

#### validateEditable() 변경

```typescript
private validateEditable(checklist: {
  status: string;
  accessTokenExpiresAt?: Date | null;
}) {
  // reviewed 상태는 항상 수정 불가
  if (checklist.status === "reviewed") {
    throw new ForbiddenError("검토가 완료된 체크리스트는 수정할 수 없습니다.");
  }

  // 기한 만료 시 수정 불가
  if (
    checklist.accessTokenExpiresAt &&
    new Date() > new Date(checklist.accessTokenExpiresAt)
  ) {
    throw new ForbiddenError("작성 기한이 종료되었습니다.");
  }

  // 기한 내 + (sent | in_progress | submitted) → 수정 가능
  // (기존: submitted 상태에서 수정 불가 → 변경: 기한 내이면 수정 가능)
}
```

#### validateTokenExpiry() 변경

```typescript
private validateTokenExpiry(checklist: {
  accessTokenExpiresAt?: Date | null;
}) {
  // 기한 만료 여부만 반환, 조회 자체는 허용 (읽기 전용)
  // → getByToken에서 isExpired 플래그를 응답에 포함
}
```

**핵심 변경**: `getByToken()`이 기한 만료 시에도 에러를 던지지 않고, 대신 데이터와 함께 `isExpired` 플래그를 반환하도록 변경

```typescript
async getByToken(token: string) {
  const checklist = await this.repository.findByToken(token);
  if (!checklist) {
    throw new NotFoundError("Checklist", token);
  }

  const isExpired = checklist.accessTokenExpiresAt
    ? new Date() > new Date(checklist.accessTokenExpiresAt)
    : false;

  return { ...checklist, isExpired };
}
```

#### submit() 변경

```typescript
async submit(token: string, dto: SubmitTrusteeChecklistInput) {
  const checklist = await this.repository.findByToken(token);
  if (!checklist) {
    throw new NotFoundError("Checklist", token);
  }

  // 기한 만료 확인
  if (
    checklist.accessTokenExpiresAt &&
    new Date() > new Date(checklist.accessTokenExpiresAt)
  ) {
    throw new ForbiddenError("작성 기한이 종료되었습니다.");
  }

  // submitted/reviewed 상태가 아닌 경우 + 기한 내에만 제출 가능
  if (checklist.status === "reviewed") {
    throw new ForbiddenError("검토가 완료된 체크리스트는 수정할 수 없습니다.");
  }

  const updated = await this.repository.update(checklist.id, {
    status: "submitted",
    submittedAt: new Date(),
    submissionCount: (checklist.submissionCount || 0) + 1,  // ← 신규: 제출 횟수 증가
    contactName: dto.contactName,
    contactEmail: dto.contactEmail || undefined,
    contactPhone: dto.contactPhone || undefined,
  });

  await this.publishEvent(EVENT_ROUTING_KEYS.INSPECTION_UPDATED, {
    type: "checklist.submitted",
    data: {
      id: checklist.id,
      trusteeId: checklist.trusteeId,
      contactName: dto.contactName,
      submissionCount: updated.submissionCount,
    },
  });

  return updated;
}
```

#### reopen() 신규 메서드

```typescript
async reopen(token: string) {
  const checklist = await this.repository.findByToken(token);
  if (!checklist) {
    throw new NotFoundError("Checklist", token);
  }

  // 기한 만료 확인
  if (
    checklist.accessTokenExpiresAt &&
    new Date() > new Date(checklist.accessTokenExpiresAt)
  ) {
    throw new ForbiddenError("작성 기한이 종료되었습니다.");
  }

  // submitted 상태에서만 reopen 가능
  if (checklist.status !== "submitted") {
    throw new ForbiddenError("제출된 상태에서만 재수정이 가능합니다.");
  }

  return this.repository.update(checklist.id, {
    status: "in_progress",
  });
}
```

### 4.3 Repository 변경

`backend/services/inspection/src/repositories/trustee-checklist.repository.ts`

#### createFromTemplate() 변경

```typescript
async createFromTemplate(params: {
  trusteeId: string;
  template: FullChecklistTemplate;
  inspectionScope?: string;
  accessTokenExpiresAt: Date;  // ← 신규 필수 파라미터
}) {
  return prisma.$transaction(async (tx) => {
    const checklist = await tx.trusteeChecklist.create({
      data: {
        trusteeId: params.trusteeId,
        templateId: params.template.id,
        templateVersion: params.template.version,
        title: params.template.title,
        inspectionScope: params.inspectionScope,
        accessTokenExpiresAt: params.accessTokenExpiresAt,  // ← 기한 설정
        status: "draft",
        categories: { /* 기존과 동일 */ },
      },
      include: fullInclude,
    });
    return checklist;
  });
}
```

#### update() - submissionCount 지원

기존 `update()` 메서드의 `data` 파라미터 타입을 확장하여 `submissionCount`, `accessTokenExpiresAt`도 받을 수 있도록 변경:

```typescript
async update(id: string, data: UpdateTrusteeChecklistInput & {
  submittedAt?: Date;
  submissionCount?: number;
  accessTokenExpiresAt?: Date;
}) {
  return prisma.trusteeChecklist.update({
    where: { id },
    data,
    include: fullInclude,
  });
}
```

---

## 5. Controller / Routes 변경

### 5.1 ChecklistResponseController - reopen 핸들러 추가

`backend/services/inspection/src/controllers/checklist-response.controller.ts`

```typescript
reopen = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const checklist = await this.service.reopen(req.params.token as string);
    res.json({ data: checklist });
  } catch (error) {
    next(error);
  }
};
```

### 5.2 ChecklistResponseRoutes - reopen 라우트 추가

`backend/services/inspection/src/routes/checklist-response.routes.ts`

```typescript
router.post("/:token/reopen", controller.reopen);
```

**전체 라우트 목록:**
```
GET    /:token              → getByToken
PATCH  /:token/items/:itemId → updateItem
PATCH  /:token/items/batch   → batchUpdateItems
POST   /:token/submit        → submit
POST   /:token/reopen        → reopen  (신규)
```

### 5.3 ChecklistResponseController.getByToken 응답 변경

`isExpired` 플래그를 응답에 포함:

```typescript
getByToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await this.service.getByToken(req.params.token as string);
    const { accessToken, ...data } = result as Record<string, unknown>;
    res.json({ data });  // data에 isExpired 포함됨
  } catch (error) {
    next(error);
  }
};
```

---

## 6. Frontend API 클라이언트 변경

### 6.1 trustee-checklists.ts - create에 deadline 포함

`frontend/web/src/lib/api/trustee-checklists.ts`

```typescript
// create 호출 시 deadline 포함
create: (data: CreateTrusteeChecklistInput) =>
  apiClient.post<TrusteeChecklistResponse>("/api/trustee-checklists", data),
```

`CreateTrusteeChecklistInput`에 `deadline: string`이 추가되므로 별도 변경 불필요 (타입만 업데이트)

### 6.2 checklist-response.ts - reopen 추가

`frontend/web/src/lib/api/checklist-response.ts`

```typescript
reopen(token: string): Promise<ChecklistResponseData> {
  return apiClient.post(`/api/checklist-response/${token}/reopen`);
},
```

---

## 7. Frontend Hooks 변경

### 7.1 useChecklistResponse.ts - reopen 훅 추가

`frontend/web/src/hooks/useChecklistResponse.ts`

```typescript
export function useReopenChecklist(token: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => checklistResponseApi.reopen(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...RESPONSE_KEY, token] });
    },
  });
}
```

### 7.2 hooks/index.ts에 export 추가

```typescript
export { useReopenChecklist } from "./useChecklistResponse";
```

---

## 8. Frontend 페이지 변경

### 8.1 체크리스트 생성 페이지 변경

`frontend/web/src/app/(dashboard)/inspections/checklists/new/page.tsx`

**추가 사항:**
- `deadline` state 추가 (기본값: 오늘 + 14일)
- `<TextField type="date">` 필드 추가 (필수)
- `createChecklist()` 호출 시 `deadline` 포함

```tsx
// state 추가
const [deadline, setDeadline] = useState(() => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().split("T")[0];  // YYYY-MM-DD
});

// 폼에 추가
<TextField
  fullWidth
  label="작성 기한"
  type="date"
  value={deadline}
  onChange={(e) => setDeadline(e.target.value)}
  required
  slotProps={{ inputLabel: { shrink: true } }}
  sx={{ mb: 2 }}
/>

// 제출 시
createChecklist({
  trusteeId,
  templateId,
  inspectionScope: inspectionScope || undefined,
  deadline: new Date(deadline + "T23:59:59").toISOString(),  // 해당 날 23:59:59로 설정
}, { /* ... */ });
```

### 8.2 체크리스트 상세 페이지 변경

`frontend/web/src/app/(dashboard)/inspections/checklists/[id]/page.tsx`

**추가 사항:**

#### a) 기한 D-day 표시 + 기한 변경 기능

토큰 링크 섹션 아래에 기한 정보 Paper 추가:

```tsx
// 기한 관련 헬퍼
const isDeadlineExpired = checklist.accessTokenExpiresAt
  ? new Date() > new Date(checklist.accessTokenExpiresAt)
  : false;

const daysLeft = checklist.accessTokenExpiresAt
  ? Math.ceil(
      (new Date(checklist.accessTokenExpiresAt).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24)
    )
  : null;

// 기한 정보 Paper
<Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <Box>
      <Typography variant="subtitle2" gutterBottom>작성 기한</Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography>
          {new Date(checklist.accessTokenExpiresAt).toLocaleDateString("ko-KR")}
        </Typography>
        <Chip
          label={isDeadlineExpired ? "만료됨" : `D-${daysLeft}`}
          color={isDeadlineExpired ? "error" : daysLeft <= 3 ? "warning" : "info"}
          size="small"
        />
      </Box>
    </Box>
    {/* 기한 변경 버튼 (만료 전에만 표시) */}
    {!isDeadlineExpired && checklist.status !== "reviewed" && (
      <Button variant="outlined" size="small" onClick={() => setDeadlineEditOpen(true)}>
        기한 변경
      </Button>
    )}
  </Box>
</Paper>
```

#### b) 제출 정보 (제출 횟수, 마지막 제출일)

작성자 정보 Paper에 추가:

```tsx
{checklist.submissionCount > 0 && (
  <Typography variant="body2" color="text.secondary">
    제출 횟수: {checklist.submissionCount}회
  </Typography>
)}
```

#### c) 검토 완료 버튼 조건 변경

```tsx
{/* 기한 만료 + submitted 상태일 때만 검토 가능 */}
{checklist.status === "submitted" && isDeadlineExpired && (
  <Button
    variant="contained"
    color="success"
    loading={isReviewing}
    onClick={() => setConfirmReviewOpen(true)}
  >
    검토 완료
  </Button>
)}
{checklist.status === "submitted" && !isDeadlineExpired && (
  <Chip label="기한 종료 후 검토 가능" color="info" variant="outlined" size="small" />
)}
```

#### d) 기한 변경 다이얼로그

```tsx
<Dialog
  open={deadlineEditOpen}
  onClose={() => setDeadlineEditOpen(false)}
  title="작성 기한 변경"
  maxWidth="xs"
  actions={
    <>
      <Button onClick={() => setDeadlineEditOpen(false)}>취소</Button>
      <Button variant="contained" onClick={handleDeadlineChange}>변경</Button>
    </>
  }
>
  <TextField
    type="date"
    fullWidth
    value={newDeadline}
    onChange={(e) => setNewDeadline(e.target.value)}
    slotProps={{ inputLabel: { shrink: true } }}
  />
</Dialog>
```

### 8.3 체크리스트 목록 페이지 변경

`frontend/web/src/app/(dashboard)/inspections/checklists/page.tsx`

**columns 배열에 추가:**

```tsx
{
  id: "accessTokenExpiresAt",
  label: "작성 기한",
  minWidth: 120,
  render: (row) => {
    if (!row.accessTokenExpiresAt) return "-";
    const expired = new Date() > new Date(row.accessTokenExpiresAt);
    const daysLeft = Math.ceil(
      (new Date(row.accessTokenExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return (
      <Chip
        label={expired ? "만료됨" : `D-${daysLeft}`}
        color={expired ? "error" : daysLeft <= 3 ? "warning" : "info"}
        size="small"
      />
    );
  },
},
{
  id: "submissionCount",
  label: "제출",
  minWidth: 60,
  align: "center",
  render: (row) => row.submissionCount || 0,
},
```

### 8.4 수탁사 작성 페이지 변경

`frontend/web/src/app/checklist/[token]/page.tsx`

**핵심 변경:**

#### a) 기한 D-day 계산 및 읽기 전용 조건 변경

```typescript
// isReadOnly 로직 변경
const isExpired = checklist.accessTokenExpiresAt
  ? new Date() > new Date(checklist.accessTokenExpiresAt)
  : false;

// 기존: submitted || reviewed → 읽기 전용
// 변경: (기한 만료) || reviewed → 읽기 전용
//        submitted + 기한 내 → 수정 가능 (reopen 필요)
const isReadOnly = isExpired || checklist.status === "reviewed";

// submitted 상태 + 기한 내 = 수정 가능 (reopen 후)
const canReopen = checklist.status === "submitted" && !isExpired;
```

#### b) 기한 안내 Alert 추가 (헤더 영역)

```tsx
{/* 기한 안내 */}
{checklist.accessTokenExpiresAt && (
  <Alert
    severity={isExpired ? "error" : daysLeft <= 3 ? "warning" : "info"}
    sx={{ mt: 2 }}
  >
    {isExpired
      ? "작성 기한이 종료되었습니다. 더 이상 수정할 수 없습니다."
      : `작성 기한: ${new Date(checklist.accessTokenExpiresAt).toLocaleDateString("ko-KR")}까지 (D-${daysLeft})`}
  </Alert>
)}

{/* submitted + 기한 내: 재수정 가능 안내 */}
{canReopen && (
  <Alert severity="success" sx={{ mt: 2 }}>
    제출이 완료되었습니다. 기한 내에 수정 후 재제출이 가능합니다.
  </Alert>
)}

{/* reviewed */}
{checklist.status === "reviewed" && (
  <Alert severity="success" sx={{ mt: 2 }}>
    위탁사 검토가 완료되었습니다.
  </Alert>
)}
```

#### c) 재수정 버튼 (submitted + 기한 내)

```tsx
{canReopen && (
  <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
    <Button
      variant="contained"
      color="warning"
      loading={isReopening}
      onClick={handleReopen}
    >
      수정하기
    </Button>
  </Box>
)}
```

```typescript
const { mutate: reopenChecklist, isPending: isReopening } = useReopenChecklist(token);

const handleReopen = () => {
  reopenChecklist(undefined, {
    onSuccess: () => setSnackbar("수정 모드로 전환되었습니다."),
    onError: () => setSnackbar("수정 모드 전환에 실패했습니다."),
  });
};
```

#### d) 제출 확인 Dialog 메시지 변경

```tsx
<DialogContentText>
  {unansweredCount > 0
    ? `${unansweredCount}개의 미답변 항목이 있습니다. 그래도 제출하시겠습니까?`
    : "체크리스트를 제출하시겠습니까?"}
  {"\n"}기한 내에 재수정 후 재제출이 가능합니다.
</DialogContentText>
```

---

## 9. 비즈니스 룰 요약

### 수탁사(토큰 사용자) 권한 매트릭스

| 상태 | 기한 내 | 기한 만료 |
|------|---------|-----------|
| `sent` | 조회/작성 가능 | 읽기 전용 |
| `in_progress` | 작성/저장/제출 가능 | 읽기 전용 |
| `submitted` | **재수정(reopen)/재제출 가능** | 읽기 전용 |
| `reviewed` | 읽기 전용 | 읽기 전용 |

### 위탁사(관리자) 권한 매트릭스

| 동작 | 조건 |
|------|------|
| 체크리스트 생성 | deadline 필수 |
| 기한 변경 | 기한 만료 전에만 |
| 검토 완료 | **기한 만료 + submitted 상태**에서만 |
| 토큰 재발급 | 항상 가능 |
| 삭제 | 항상 가능 |

---

## 10. 구현 순서

| Step | 작업 | 파일 |
|------|------|------|
| 1 | DB 스키마 변경 + migration | `inspection/prisma/schema.prisma` |
| 2 | 타입 변경 | `types/src/checklist.ts` |
| 3 | Validation 변경 | `inspection/src/validation.ts` |
| 4 | Repository 변경 | `inspection/src/repositories/trustee-checklist.repository.ts` |
| 5 | TrusteeChecklistService 변경 | `inspection/src/services/trustee-checklist.service.ts` |
| 6 | ChecklistResponseService 변경 | `inspection/src/services/checklist-response.service.ts` |
| 7 | Controller + Routes 변경 | `inspection/src/controllers/`, `inspection/src/routes/` |
| 8 | Frontend API + Hooks | `lib/api/`, `hooks/` |
| 9 | 체크리스트 생성 페이지 | `checklists/new/page.tsx` |
| 10 | 체크리스트 상세 페이지 | `checklists/[id]/page.tsx` |
| 11 | 체크리스트 목록 페이지 | `checklists/page.tsx` |
| 12 | 수탁사 작성 페이지 | `checklist/[token]/page.tsx` |

---

## 11. 에러 코드 및 메시지

| 상황 | HTTP 코드 | 에러 메시지 |
|------|-----------|-------------|
| 기한 만료 후 수정 시도 | 403 | "작성 기한이 종료되었습니다." |
| 기한 만료 전 검토 시도 | 400 | "작성 기한이 종료된 후에만 검토를 진행할 수 있습니다." |
| 만료된 기한 변경 시도 | 400 | "이미 만료된 기한은 변경할 수 없습니다." |
| submitted가 아닌 상태에서 reopen | 403 | "제출된 상태에서만 재수정이 가능합니다." |
| reviewed 상태에서 수정 시도 | 403 | "검토가 완료된 체크리스트는 수정할 수 없습니다." |
| 생성 시 deadline 누락 | 400 | "작성 기한은 필수입니다" |
