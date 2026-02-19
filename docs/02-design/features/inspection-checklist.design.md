# Design: 보안점검 체크리스트 (inspection-checklist)

> Plan 참조: `docs/01-plan/features/inspection-checklist.plan.md`

---

## 1. Prisma 스키마 (inspection-service)

`backend/services/inspection/prisma/schema.prisma`에 추가:

```prisma
// ──────────────────────────────────────
// Root 템플릿
// ──────────────────────────────────────

model ChecklistTemplate {
  id          String   @id @default(cuid())
  title       String
  version     String   @default("1.0")
  description String?  @db.Text
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  categories ChecklistCategory[]

  @@map("checklist_templates")
}

model ChecklistCategory {
  id         String @id @default(cuid())
  templateId String @map("template_id")
  no         Int
  name       String
  sortOrder  Int    @default(0) @map("sort_order")

  template ChecklistTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  sections ChecklistSection[]

  @@map("checklist_categories")
}

model ChecklistSection {
  id         String @id @default(cuid())
  categoryId String @map("category_id")
  no         String
  name       String
  sortOrder  Int    @default(0) @map("sort_order")

  category ChecklistCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  items    ChecklistItem[]

  @@map("checklist_sections")
}

model ChecklistItem {
  id        String  @id @default(cuid())
  sectionId String  @map("section_id")
  no        String
  question  String  @db.Text
  hint      String? @db.Text
  sortOrder Int     @default(0) @map("sort_order")

  section ChecklistSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)

  @@map("checklist_items")
}

// ──────────────────────────────────────
// 수탁사별 체크리스트 (스냅샷)
// ──────────────────────────────────────

enum TrusteeChecklistStatus {
  draft
  sent
  in_progress
  submitted
  reviewed
}

enum ChecklistAnswer {
  yes
  no
  not_applicable
}

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

  categories TrusteeChecklistCategory[]

  @@map("trustee_checklists")
}

model TrusteeChecklistCategory {
  id          String @id @default(cuid())
  checklistId String @map("checklist_id")
  no          Int
  name        String
  sortOrder   Int    @default(0) @map("sort_order")

  checklist TrusteeChecklist          @relation(fields: [checklistId], references: [id], onDelete: Cascade)
  sections  TrusteeChecklistSection[]

  @@map("trustee_checklist_categories")
}

model TrusteeChecklistSection {
  id         String @id @default(cuid())
  categoryId String @map("category_id")
  no         String
  name       String
  sortOrder  Int    @default(0) @map("sort_order")

  category TrusteeChecklistCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  items    TrusteeChecklistItem[]

  @@map("trustee_checklist_sections")
}

model TrusteeChecklistItem {
  id            String           @id @default(cuid())
  sectionId     String           @map("section_id")
  no            String
  question      String           @db.Text
  hint          String?          @db.Text
  sortOrder     Int              @default(0) @map("sort_order")
  applicable    Boolean          @default(true)
  answer        ChecklistAnswer?
  currentStatus String?          @map("current_status") @db.Text
  evidence      String?          @db.Text
  remarks       String?          @db.Text

  section TrusteeChecklistSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)

  @@map("trustee_checklist_items")
}
```

## 2. 공유 타입 (@trustee/types)

`backend/packages/types/src/checklist.ts` 신규 파일:

```typescript
// ── Root 템플릿 ──

export interface ChecklistTemplate {
  id: string;
  title: string;
  version: string;
  description?: string;
  categories: ChecklistCategory[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChecklistCategory {
  id: string;
  templateId: string;
  no: number;
  name: string;
  sortOrder: number;
  sections: ChecklistSection[];
}

export interface ChecklistSection {
  id: string;
  categoryId: string;
  no: string;
  name: string;
  sortOrder: number;
  items: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  sectionId: string;
  no: string;
  question: string;
  hint?: string;
  sortOrder: number;
}

export interface CreateChecklistTemplateInput {
  title: string;
  version?: string;
  description?: string;
  categories: {
    no: number;
    name: string;
    sections: {
      no: string;
      name: string;
      items: {
        no: string;
        question: string;
        hint?: string;
      }[];
    }[];
  }[];
}

export interface UpdateChecklistTemplateInput {
  title?: string;
  version?: string;
  description?: string;
}

// ── 수탁사 체크리스트 ──

export type TrusteeChecklistStatus =
  | "draft"
  | "sent"
  | "in_progress"
  | "submitted"
  | "reviewed";

export type ChecklistAnswer = "yes" | "no" | "not_applicable";

export interface TrusteeChecklist {
  id: string;
  trusteeId: string;
  templateId?: string;
  templateVersion?: string;
  title: string;
  inspectionScope?: string;
  status: TrusteeChecklistStatus;
  submittedAt?: Date;
  categories: TrusteeChecklistCategory[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TrusteeChecklistCategory {
  id: string;
  checklistId: string;
  no: number;
  name: string;
  sortOrder: number;
  sections: TrusteeChecklistSection[];
}

export interface TrusteeChecklistSection {
  id: string;
  categoryId: string;
  no: string;
  name: string;
  sortOrder: number;
  items: TrusteeChecklistItem[];
}

export interface TrusteeChecklistItem {
  id: string;
  sectionId: string;
  no: string;
  question: string;
  hint?: string;
  sortOrder: number;
  applicable: boolean;
  answer?: ChecklistAnswer;
  currentStatus?: string;
  evidence?: string;
  remarks?: string;
}

export interface CreateTrusteeChecklistInput {
  trusteeId: string;
  templateId: string;
  inspectionScope?: string;
}

export interface UpdateTrusteeChecklistInput {
  inspectionScope?: string;
  status?: TrusteeChecklistStatus;
}

export interface UpdateTrusteeChecklistItemInput {
  applicable?: boolean;
  answer?: ChecklistAnswer | null;
  currentStatus?: string;
  evidence?: string;
  remarks?: string;
}

export interface BatchUpdateChecklistItemsInput {
  items: {
    id: string;
    applicable?: boolean;
    answer?: ChecklistAnswer | null;
    currentStatus?: string;
    evidence?: string;
    remarks?: string;
  }[];
}
```

`backend/packages/types/src/index.ts`에 추가:
```typescript
export * from "./checklist";
```

## 3. Backend 4계층 구조

### 3.1 파일 구조

```
backend/services/inspection/src/
├── repositories/
│   ├── checklist-template.repository.ts   ← 신규
│   ├── trustee-checklist.repository.ts    ← 신규
│   └── index.ts                           ← 수정 (export 추가)
├── services/
│   ├── checklist-template.service.ts      ← 신규
│   ├── trustee-checklist.service.ts       ← 신규
│   └── index.ts                           ← 수정
├── controllers/
│   ├── checklist-template.controller.ts   ← 신규
│   ├── trustee-checklist.controller.ts    ← 신규
│   └── index.ts                           ← 수정
├── routes/
│   ├── checklist-template.routes.ts       ← 신규
│   ├── trustee-checklist.routes.ts        ← 신규
│   └── index.ts                           ← 수정
├── validation.ts                          ← 수정 (스키마 추가)
└── index.ts                               ← 수정 (부트스트랩)
```

### 3.2 Repository

#### checklist-template.repository.ts

```typescript
export class ChecklistTemplateRepository {
  // 목록 (카테고리 수만 포함)
  async findAll(params: { skip?: number; take?: number }) {
    const [data, total] = await Promise.all([
      prisma.checklistTemplate.findMany({
        skip, take,
        orderBy: { createdAt: "desc" },
        include: { categories: { select: { id: true } } },
      }),
      prisma.checklistTemplate.count(),
    ]);
    return { data, total };
  }

  // 상세 (전체 트리 include)
  async findById(id: string) {
    return prisma.checklistTemplate.findUnique({
      where: { id },
      include: {
        categories: {
          orderBy: { sortOrder: "asc" },
          include: {
            sections: {
              orderBy: { sortOrder: "asc" },
              include: {
                items: { orderBy: { sortOrder: "asc" } },
              },
            },
          },
        },
      },
    });
  }

  // 생성 (nested create로 전체 트리 한번에)
  async create(data: CreateChecklistTemplateInput) {
    return prisma.checklistTemplate.create({
      data: {
        title: data.title,
        version: data.version || "1.0",
        description: data.description,
        categories: {
          create: data.categories.map((cat, ci) => ({
            no: cat.no,
            name: cat.name,
            sortOrder: ci,
            sections: {
              create: cat.sections.map((sec, si) => ({
                no: sec.no,
                name: sec.name,
                sortOrder: si,
                items: {
                  create: sec.items.map((item, ii) => ({
                    no: item.no,
                    question: item.question,
                    hint: item.hint,
                    sortOrder: ii,
                  })),
                },
              })),
            },
          })),
        },
      },
      include: { /* 전체 트리 */ },
    });
  }

  // 수정 (메타 정보만)
  async update(id: string, data: UpdateChecklistTemplateInput) { ... }

  // 삭제 (Cascade로 하위 전체 삭제)
  async delete(id: string) { ... }
}
```

#### trustee-checklist.repository.ts

```typescript
export class TrusteeChecklistRepository {
  // 목록 (필터: trusteeId, status)
  async findAll(params: {
    skip?: number; take?: number;
    where?: { trusteeId?: string; status?: string };
  }) { ... }

  // 상세 (전체 트리)
  async findById(id: string) {
    return prisma.trusteeChecklist.findUnique({
      where: { id },
      include: {
        categories: {
          orderBy: { sortOrder: "asc" },
          include: {
            sections: {
              orderBy: { sortOrder: "asc" },
              include: {
                items: { orderBy: { sortOrder: "asc" } },
              },
            },
          },
        },
      },
    });
  }

  // 스냅샷 생성 (트랜잭션)
  async createFromTemplate(params: {
    trusteeId: string;
    template: FullChecklistTemplate;
    inspectionScope?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const checklist = await tx.trusteeChecklist.create({
        data: {
          trusteeId: params.trusteeId,
          templateId: params.template.id,
          templateVersion: params.template.version,
          title: params.template.title,
          inspectionScope: params.inspectionScope,
          status: "draft",
          categories: {
            create: params.template.categories.map((cat) => ({
              no: cat.no,
              name: cat.name,
              sortOrder: cat.sortOrder,
              sections: {
                create: cat.sections.map((sec) => ({
                  no: sec.no,
                  name: sec.name,
                  sortOrder: sec.sortOrder,
                  items: {
                    create: sec.items.map((item) => ({
                      no: item.no,
                      question: item.question,
                      hint: item.hint,
                      sortOrder: item.sortOrder,
                      applicable: true,
                      answer: null,
                      currentStatus: null,
                      evidence: null,
                      remarks: null,
                    })),
                  },
                })),
              },
            })),
          },
        },
        include: { /* 전체 트리 */ },
      });
      return checklist;
    });
  }

  // 항목 답변 수정
  async updateItem(itemId: string, data: UpdateTrusteeChecklistItemInput) {
    return prisma.trusteeChecklistItem.update({
      where: { id: itemId },
      data,
    });
  }

  // 항목 일괄 답변 수정
  async batchUpdateItems(items: BatchUpdateChecklistItemsInput["items"]) {
    return prisma.$transaction(
      items.map((item) =>
        prisma.trusteeChecklistItem.update({
          where: { id: item.id },
          data: {
            applicable: item.applicable,
            answer: item.answer,
            currentStatus: item.currentStatus,
            evidence: item.evidence,
            remarks: item.remarks,
          },
        })
      )
    );
  }

  // 메타 수정
  async update(id: string, data: UpdateTrusteeChecklistInput) { ... }

  // 삭제
  async delete(id: string) { ... }
}
```

### 3.3 Service

#### checklist-template.service.ts

```typescript
export class ChecklistTemplateService {
  constructor(private repository: ChecklistTemplateRepository) {}

  async list(params) { ... }

  async getById(id: string) {
    const template = await this.repository.findById(id);
    if (!template) throw new NotFoundError("ChecklistTemplate", id);
    return template;
  }

  async create(dto: CreateChecklistTemplateInput) {
    return this.repository.create(dto);
  }

  // JSON 파일에서 Import (inspection-checklist-template.json 구조 파싱)
  async importFromJson(jsonData: JsonTemplateData): Promise<ChecklistTemplate> {
    const input: CreateChecklistTemplateInput = {
      title: jsonData.title,
      version: jsonData.version || "1.0",
      description: jsonData.description,
      categories: jsonData.categories.map((cat) => ({
        no: cat.no,
        name: cat["범주"] || cat.name,
        sections: cat.sections.map((sec) => ({
          no: sec.no,
          name: sec["영역"] || sec.name,
          items: sec.items.map((item) => ({
            no: item.no,
            question: item["통제항목"] || item.question,
            hint: item["비고사항"] || item.hint,
          })),
        })),
      })),
    };
    return this.repository.create(input);
  }

  async update(id, dto) { ... }
  async delete(id) { ... }
}
```

#### trustee-checklist.service.ts (핵심)

```typescript
export class TrusteeChecklistService {
  constructor(
    private repository: TrusteeChecklistRepository,
    private templateRepository: ChecklistTemplateRepository,
    private rabbitmq: RabbitMQClient | null
  ) {}

  // 스냅샷 생성 (핵심 로직)
  async create(dto: CreateTrusteeChecklistInput) {
    // 1. gRPC로 수탁사 존재 확인
    try {
      const result = await validateTrusteeExists(dto.trusteeId);
      if (!result.exists) throw new NotFoundError("Trustee", dto.trusteeId);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      logger.warn(error, "수탁사 검증 실패");
    }

    // 2. Root 템플릿 전체 조회
    const template = await this.templateRepository.findById(dto.templateId);
    if (!template) throw new NotFoundError("ChecklistTemplate", dto.templateId);

    // 3. 스냅샷 Deep Copy (트랜잭션)
    const checklist = await this.repository.createFromTemplate({
      trusteeId: dto.trusteeId,
      template,
      inspectionScope: dto.inspectionScope,
    });

    return checklist;
  }

  // 항목 답변 저장
  async updateItem(checklistId: string, itemId: string, dto) {
    const checklist = await this.repository.findById(checklistId);
    if (!checklist) throw new NotFoundError("TrusteeChecklist", checklistId);
    return this.repository.updateItem(itemId, dto);
  }

  // 항목 일괄 답변 저장
  async batchUpdateItems(checklistId: string, dto: BatchUpdateChecklistItemsInput) {
    const checklist = await this.repository.findById(checklistId);
    if (!checklist) throw new NotFoundError("TrusteeChecklist", checklistId);
    return this.repository.batchUpdateItems(dto.items);
  }

  // 상태 변경
  async updateStatus(id: string, dto: UpdateTrusteeChecklistInput) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundError("TrusteeChecklist", id);
    return this.repository.update(id, dto);
  }
}
```

### 3.4 Controller / Routes

기존 패턴과 동일 (화살표 함수, try-catch + next(error)):

#### checklist-template.routes.ts
```
GET    /                    → list
GET    /:id                 → getById
POST   /                    → create (validate)
POST   /:id/import          → importFromJson
PATCH  /:id                 → update (validate)
DELETE /:id                 → delete
```

#### trustee-checklist.routes.ts
```
GET    /                    → list (?trusteeId, ?status)
GET    /:id                 → getById
POST   /                    → create (validate)
PATCH  /:id                 → update (validate)
PATCH  /:id/items/:itemId   → updateItem (validate)
PATCH  /:id/items/batch     → batchUpdateItems (validate)
DELETE /:id                 → delete
```

### 3.5 Validation (추가 스키마)

```typescript
// checklist-template
export const createChecklistTemplateSchema = z.object({
  title: z.string().min(1, "제목은 필수입니다"),
  version: z.string().optional(),
  description: z.string().optional(),
  categories: z.array(z.object({
    no: z.number(),
    name: z.string().min(1),
    sections: z.array(z.object({
      no: z.string().min(1),
      name: z.string().min(1),
      items: z.array(z.object({
        no: z.string().min(1),
        question: z.string().min(1),
        hint: z.string().optional(),
      })).min(1),
    })).min(1),
  })).min(1),
});

export const importChecklistTemplateSchema = z.object({
  jsonData: z.object({
    title: z.string(),
    categories: z.array(z.any()),
  }),
});

// trustee-checklist
export const createTrusteeChecklistSchema = z.object({
  trusteeId: z.string().min(1, "수탁사 ID는 필수입니다"),
  templateId: z.string().min(1, "템플릿 ID는 필수입니다"),
  inspectionScope: z.string().optional(),
});

export const updateTrusteeChecklistSchema = z.object({
  inspectionScope: z.string().optional(),
  status: z.enum(["draft", "sent", "in_progress", "submitted", "reviewed"]).optional(),
});

export const updateTrusteeChecklistItemSchema = z.object({
  applicable: z.boolean().optional(),
  answer: z.enum(["yes", "no", "not_applicable"]).nullable().optional(),
  currentStatus: z.string().optional(),
  evidence: z.string().optional(),
  remarks: z.string().optional(),
});

export const batchUpdateChecklistItemsSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    applicable: z.boolean().optional(),
    answer: z.enum(["yes", "no", "not_applicable"]).nullable().optional(),
    currentStatus: z.string().optional(),
    evidence: z.string().optional(),
    remarks: z.string().optional(),
  })).min(1),
});
```

### 3.6 index.ts 부트스트랩 추가

```typescript
// 기존 코드에 추가
import { ChecklistTemplateRepository, TrusteeChecklistRepository } from "./repositories";
import { ChecklistTemplateService, TrusteeChecklistService } from "./services";
import { ChecklistTemplateController, TrusteeChecklistController } from "./controllers";
import { createChecklistTemplateRoutes, createTrusteeChecklistRoutes } from "./routes";

// Repositories
const checklistTemplateRepository = new ChecklistTemplateRepository();
const trusteeChecklistRepository = new TrusteeChecklistRepository();

// Services
const checklistTemplateService = new ChecklistTemplateService(checklistTemplateRepository);
const trusteeChecklistService = new TrusteeChecklistService(
  trusteeChecklistRepository,
  checklistTemplateRepository,
  rabbitmq
);

// Controllers
const checklistTemplateController = new ChecklistTemplateController(checklistTemplateService);
const trusteeChecklistController = new TrusteeChecklistController(trusteeChecklistService);

// Routes
app.use("/api/checklist-templates", createChecklistTemplateRoutes(checklistTemplateController));
app.use("/api/trustee-checklists", createTrusteeChecklistRoutes(trusteeChecklistController));
```

### 3.7 Gateway 프록시 추가

`backend/services/gateway/src/proxy.ts`:

```typescript
export const inspectionProxy = createProxyMiddleware({
  target: config.inspectionServiceUrl,
  changeOrigin: true,
  pathFilter: [
    "/api/inspections",
    "/api/inspection-items",
    "/api/checklist-templates",    // ← 추가
    "/api/trustee-checklists",     // ← 추가
  ],
  on: { proxyReq: fixRequestBody },
});
```

## 4. Frontend 설계

### 4.1 API Client

`frontend/web/src/lib/api/checklist-templates.ts`:

```typescript
import { apiClient } from "./client";
import type {
  ChecklistTemplate,
  CreateChecklistTemplateInput,
} from "@trustee/types";

interface TemplateListResponse { data: ChecklistTemplate[]; total: number; }
interface TemplateResponse { data: ChecklistTemplate; }

export const checklistTemplatesApi = {
  list: (params?: { page?: number; limit?: number }) =>
    apiClient.get<TemplateListResponse>("/api/checklist-templates", params),
  getById: (id: string) =>
    apiClient.get<TemplateResponse>(`/api/checklist-templates/${id}`),
  create: (data: CreateChecklistTemplateInput) =>
    apiClient.post<TemplateResponse>("/api/checklist-templates", data),
  importJson: (id: string, jsonData: unknown) =>
    apiClient.post<TemplateResponse>(`/api/checklist-templates/${id}/import`, { jsonData }),
  delete: (id: string) =>
    apiClient.delete(`/api/checklist-templates/${id}`),
};
```

`frontend/web/src/lib/api/trustee-checklists.ts`:

```typescript
import { apiClient } from "./client";
import type {
  TrusteeChecklist,
  CreateTrusteeChecklistInput,
  UpdateTrusteeChecklistInput,
  UpdateTrusteeChecklistItemInput,
  BatchUpdateChecklistItemsInput,
} from "@trustee/types";

interface ChecklistListResponse { data: TrusteeChecklist[]; total: number; }
interface ChecklistResponse { data: TrusteeChecklist; }

export const trusteeChecklistsApi = {
  list: (params?: { page?: number; limit?: number; trusteeId?: string; status?: string }) =>
    apiClient.get<ChecklistListResponse>("/api/trustee-checklists", params),
  getById: (id: string) =>
    apiClient.get<ChecklistResponse>(`/api/trustee-checklists/${id}`),
  create: (data: CreateTrusteeChecklistInput) =>
    apiClient.post<ChecklistResponse>("/api/trustee-checklists", data),
  update: (id: string, data: UpdateTrusteeChecklistInput) =>
    apiClient.patch<ChecklistResponse>(`/api/trustee-checklists/${id}`, data),
  updateItem: (checklistId: string, itemId: string, data: UpdateTrusteeChecklistItemInput) =>
    apiClient.patch(`/api/trustee-checklists/${checklistId}/items/${itemId}`, data),
  batchUpdateItems: (checklistId: string, data: BatchUpdateChecklistItemsInput) =>
    apiClient.patch(`/api/trustee-checklists/${checklistId}/items/batch`, data),
  delete: (id: string) =>
    apiClient.delete(`/api/trustee-checklists/${id}`),
};
```

### 4.2 React Query Hooks

`frontend/web/src/hooks/useChecklistTemplates.ts`:

```typescript
const TEMPLATES_KEY = ["checklist-templates"];

export function useChecklistTemplates(params?) { ... }
export function useChecklistTemplate(id: string) { ... }
export function useCreateChecklistTemplate() { ... }
export function useImportChecklistTemplate() { ... }
export function useDeleteChecklistTemplate() { ... }
```

`frontend/web/src/hooks/useTrusteeChecklists.ts`:

```typescript
const CHECKLISTS_KEY = ["trustee-checklists"];

export function useTrusteeChecklists(params?) { ... }
export function useTrusteeChecklist(id: string) { ... }
export function useCreateTrusteeChecklist() { ... }
export function useUpdateTrusteeChecklist() { ... }
export function useUpdateChecklistItem() { ... }
export function useBatchUpdateChecklistItems() { ... }
export function useDeleteTrusteeChecklist() { ... }
```

### 4.3 페이지 구조

```
frontend/web/src/app/(dashboard)/inspections/
├── templates/
│   ├── page.tsx             ← 템플릿 목록
│   ├── new/
│   │   └── page.tsx         ← 템플릿 생성 (JSON Import)
│   └── [id]/
│       └── page.tsx         ← 템플릿 상세/미리보기
├── checklists/
│   ├── page.tsx             ← 수탁사 체크리스트 목록
│   ├── new/
│   │   └── page.tsx         ← 체크리스트 생성 (템플릿+수탁사 선택)
│   └── [id]/
│       └── page.tsx         ← 체크리스트 상세 (답변 확인/수정)
└── page.tsx                 ← 점검 관리 메인 (탭: 체크리스트/템플릿)
```

### 4.4 주요 UI 컴포넌트

#### 체크리스트 상세 화면 (아코디언 구조)

```
┌─────────────────────────────────────────────────────────────┐
│ [수탁사명] 보안 점검 체크리스트                               │
│ 점검범위: ____________     상태: [draft ▼]                   │
├─────────────────────────────────────────────────────────────┤
│ ▼ 1. 관리적 보호조치 (19개 항목)                             │
│   ▼ 1.1 개인정보보호 정책 (5개)                              │
│   ┌──────┬───────┬──────┬────┬────┬──────┬──────┬─────┐    │
│   │ No   │통제항목│대상  │ 예 │아니│현황  │증빙  │비고 │    │
│   │      │       │여부  │    │오  │      │자료  │사항 │    │
│   ├──────┼───────┼──────┼────┼────┼──────┼──────┼─────┤    │
│   │1.1.1 │회사내 │ [v]  │(●) │( ) │[    ]│[    ]│[   ]│    │
│   │      │개인...│      │    │    │      │      │     │    │
│   ├──────┼───────┼──────┼────┼────┼──────┼──────┼─────┤    │
│   │1.1.2 │회사내 │ [v]  │( ) │(●) │[    ]│[    ]│[   ]│    │
│   │      │개인...│      │    │    │      │      │     │    │
│   └──────┴───────┴──────┴────┴────┴──────┴──────┴─────┘    │
│                                                             │
│   ▶ 1.2 개인정보보호 조직 (3개)                              │
│   ▶ 1.3 개인정보취급자 관리·감독 (7개)                       │
│   ▶ 1.4 물리적 보안 (4개)                                   │
│                                                             │
│ ▶ 2. 개인정보 생명주기 (20개 항목)                           │
│ ▶ 3. 기술적 보호조치 (33개 항목)                             │
├─────────────────────────────────────────────────────────────┤
│                              [임시저장]  [제출하기]           │
└─────────────────────────────────────────────────────────────┘
```

- 범주(Category)별 MUI Accordion 컴포넌트 사용
- 영역(Section)별 하위 Accordion
- 각 항목(Item)은 테이블 행으로 표시
- 답변은 Radio 버튼 (예/아니오/해당없음)
- 현황/증빙자료/비고사항은 TextField

## 5. 구현 순서 (Implementation Order)

| 순서 | 작업 | 파일 |
|------|------|------|
| 1 | Prisma 스키마 추가 | `backend/services/inspection/prisma/schema.prisma` |
| 2 | DB 반영 | `pnpm --filter @trustee/inspection-service db:push` |
| 3 | 공유 타입 추가 | `backend/packages/types/src/checklist.ts`, `index.ts` |
| 4 | Validation 스키마 추가 | `backend/services/inspection/src/validation.ts` |
| 5 | 템플릿 Repository | `repositories/checklist-template.repository.ts` |
| 6 | 템플릿 Service | `services/checklist-template.service.ts` |
| 7 | 템플릿 Controller | `controllers/checklist-template.controller.ts` |
| 8 | 템플릿 Routes | `routes/checklist-template.routes.ts` |
| 9 | 체크리스트 Repository | `repositories/trustee-checklist.repository.ts` |
| 10 | 체크리스트 Service | `services/trustee-checklist.service.ts` |
| 11 | 체크리스트 Controller | `controllers/trustee-checklist.controller.ts` |
| 12 | 체크리스트 Routes | `routes/trustee-checklist.routes.ts` |
| 13 | index.ts 부트스트랩 | `backend/services/inspection/src/index.ts` |
| 14 | Gateway 프록시 수정 | `backend/services/gateway/src/proxy.ts` |
| 15 | Frontend API Client | `lib/api/checklist-templates.ts`, `trustee-checklists.ts` |
| 16 | Frontend Hooks | `hooks/useChecklistTemplates.ts`, `useTrusteeChecklists.ts` |
| 17 | 템플릿 목록 페이지 | `inspections/templates/page.tsx` |
| 18 | 템플릿 생성 페이지 | `inspections/templates/new/page.tsx` |
| 19 | 템플릿 상세 페이지 | `inspections/templates/[id]/page.tsx` |
| 20 | 체크리스트 목록 페이지 | `inspections/checklists/page.tsx` |
| 21 | 체크리스트 생성 페이지 | `inspections/checklists/new/page.tsx` |
| 22 | 체크리스트 상세 페이지 | `inspections/checklists/[id]/page.tsx` |
| 23 | 네비게이션 메뉴 추가 | `(dashboard)/layout.tsx` |
