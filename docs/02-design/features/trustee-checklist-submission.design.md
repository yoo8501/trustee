# Design: 수탁사 체크리스트 제출 (trustee-checklist-submission)

> Plan 참조: `docs/01-plan/features/trustee-checklist-submission.plan.md`

## 1. 아키텍처 개요

```
┌──────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js)                                              │
│  ┌────────────────────────┐  ┌─────────────────────────────────┐ │
│  │ (dashboard) Layout     │  │ (checklist) Layout              │ │
│  │ ┌────────────────────┐ │  │ ┌─────────────────────────────┐ │ │
│  │ │ /inspections/      │ │  │ │ /checklist/[token]          │ │ │
│  │ │   checklists/*     │ │  │ │ (수탁사 전용, 사이드바 없음) │ │ │
│  │ │ (위탁사 관리자)    │ │  │ └─────────────────────────────┘ │ │
│  │ └────────────────────┘ │  └─────────────────────────────────┘ │
│  └──────────┬─────────────┘                    │                 │
│             │ apiClient                        │ apiClient       │
│             ▼                                  ▼                 │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │ Gateway (3001)                                               ││
│  │ /api/trustee-checklists/**  →  inspection-service (4002)    ││
│  │ /api/checklist-response/**  →  inspection-service (4002)    ││
│  └──────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  inspection-service (4002)                                       │
│  ┌─────────────────────────┐  ┌────────────────────────────────┐│
│  │ trustee-checklist.*     │  │ checklist-response.*           ││
│  │ (위탁사 관리 API)       │  │ (수탁사 토큰 API) ★신규       ││
│  │ Routes→Ctrl→Svc→Repo   │  │ Routes→Ctrl→Svc→Repo          ││
│  └─────────────────────────┘  └────────────────────────────────┘│
│                                                                  │
│  DB: TrusteeChecklist (accessToken 추가)                        │
└──────────────────────────────────────────────────────────────────┘
```

## 2. DB 스키마 변경

### 2.1 Prisma 스키마 수정

**파일**: `backend/services/inspection/prisma/schema.prisma`

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

  // ── 토큰 기반 접근 (신규) ──
  accessToken          String    @unique @default(uuid()) @map("access_token")
  accessTokenExpiresAt DateTime? @map("access_token_expires_at")

  // ── 작성자 정보 (수탁사 담당자가 입력) ──
  contactName  String? @map("contact_name")
  contactEmail String? @map("contact_email")
  contactPhone String? @map("contact_phone")

  categories TrusteeChecklistCategory[]

  @@map("trustee_checklists")
}
```

**변경 필드 요약**:
| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `accessToken` | `String @unique` | `@default(uuid())` | Prisma가 생성 시 자동 UUID 할당 |
| `accessTokenExpiresAt` | `DateTime?` | null | null이면 무제한, 값 있으면 해당일까지 유효 |
| `contactName` | `String?` | null | 수탁사 담당자가 제출 시 입력 |
| `contactEmail` | `String?` | null | 수탁사 담당자 이메일 |
| `contactPhone` | `String?` | null | 수탁사 담당자 연락처 |

## 3. 타입 변경 (@trustee/types)

### 3.1 기존 인터페이스 확장

**파일**: `backend/packages/types/src/checklist.ts`

```typescript
// TrusteeChecklist에 필드 추가
export interface TrusteeChecklist {
  // ... 기존 필드 유지
  accessToken: string;
  accessTokenExpiresAt?: Date;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}
```

### 3.2 신규 타입 추가

```typescript
// 수탁사 측 체크리스트 제출 요청
export interface SubmitTrusteeChecklistInput {
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
}

// 토큰 재발급 응답
export interface RegenerateTokenResponse {
  accessToken: string;
  accessUrl: string;
}
```

## 4. Backend 설계

### 4.1 기존 코드 변경

#### 4.1.1 Repository 변경 (`trustee-checklist.repository.ts`)

**추가 메서드**:

```typescript
// 토큰으로 체크리스트 조회
async findByToken(token: string) {
  return prisma.trusteeChecklist.findUnique({
    where: { accessToken: token },
    include: fullInclude,
  });
}

// 토큰 재발급
async regenerateToken(id: string) {
  return prisma.trusteeChecklist.update({
    where: { id },
    data: { accessToken: randomUUID() },
  });
}
```

#### 4.1.2 Service 변경 (`trustee-checklist.service.ts`)

**`create` 메서드 변경**:
- 생성 후 상태를 `sent`로 변경 (기존: `draft`)
- `accessToken`은 Prisma `@default(uuid())`가 자동 생성

**추가 메서드**:

```typescript
// 토큰 재발급
async regenerateToken(id: string): Promise<RegenerateTokenResponse>

// 상태를 reviewed로 변경 (위탁사 검토 완료)
async markAsReviewed(id: string)
```

#### 4.1.3 Controller 변경 (`trustee-checklist.controller.ts`)

**추가 핸들러**:

```typescript
// POST /api/trustee-checklists/:id/regenerate-token
regenerateToken = async (req, res, next) => { ... }
```

#### 4.1.4 Routes 변경 (`trustee-checklist.routes.ts`)

```typescript
router.post("/:id/regenerate-token", controller.regenerateToken);
```

### 4.2 신규 코드: 수탁사 응답 API

#### 4.2.1 ChecklistResponseController (신규)

**파일**: `backend/services/inspection/src/controllers/checklist-response.controller.ts`

```typescript
export class ChecklistResponseController {
  constructor(private service: ChecklistResponseService) {}

  // GET /api/checklist-response/:token
  getByToken = async (req, res, next) => {
    const checklist = await this.service.getByToken(req.params.token);
    // accessToken은 응답에서 제외
    const { accessToken, ...data } = checklist;
    res.json({ data });
  };

  // PATCH /api/checklist-response/:token/items/:itemId
  updateItem = async (req, res, next) => {
    const item = await this.service.updateItem(
      req.params.token, req.params.itemId, req.body
    );
    res.json({ data: item });
  };

  // PATCH /api/checklist-response/:token/items/batch
  batchUpdateItems = async (req, res, next) => {
    const items = await this.service.batchUpdateItems(
      req.params.token, req.body
    );
    res.json({ data: items });
  };

  // POST /api/checklist-response/:token/submit
  submit = async (req, res, next) => {
    const checklist = await this.service.submit(req.params.token, req.body);
    res.json({ data: checklist });
  };
}
```

#### 4.2.2 ChecklistResponseService (신규)

**파일**: `backend/services/inspection/src/services/checklist-response.service.ts`

```typescript
export class ChecklistResponseService {
  constructor(
    private repository: TrusteeChecklistRepository,
    private rabbitmq: RabbitMQClient | null
  ) {}

  async getByToken(token: string) {
    const checklist = await this.repository.findByToken(token);
    if (!checklist) throw new NotFoundError("Checklist", token);
    this.validateTokenExpiry(checklist);
    return checklist;
  }

  async updateItem(token: string, itemId: string, dto: UpdateTrusteeChecklistItemInput) {
    const checklist = await this.getByToken(token);
    this.validateEditable(checklist);
    // 첫 저장 시 상태를 in_progress로 자동 변경
    if (checklist.status === "sent") {
      await this.repository.update(checklist.id, { status: "in_progress" });
    }
    return this.repository.updateItem(itemId, dto);
  }

  async batchUpdateItems(token: string, dto: BatchUpdateChecklistItemsInput) {
    const checklist = await this.getByToken(token);
    this.validateEditable(checklist);
    if (checklist.status === "sent") {
      await this.repository.update(checklist.id, { status: "in_progress" });
    }
    return this.repository.batchUpdateItems(dto.items);
  }

  async submit(token: string, dto: SubmitTrusteeChecklistInput) {
    const checklist = await this.getByToken(token);
    this.validateEditable(checklist);
    return this.repository.update(checklist.id, {
      status: "submitted",
      submittedAt: new Date(),
      contactName: dto.contactName,
      contactEmail: dto.contactEmail,
      contactPhone: dto.contactPhone,
    });
  }

  // ── Private ──

  private validateTokenExpiry(checklist: { accessTokenExpiresAt?: Date | null }) {
    if (checklist.accessTokenExpiresAt && new Date() > checklist.accessTokenExpiresAt) {
      throw new ForbiddenError("토큰이 만료되었습니다.");
    }
  }

  private validateEditable(checklist: { status: string }) {
    if (checklist.status === "submitted" || checklist.status === "reviewed") {
      throw new ForbiddenError("이미 제출된 체크리스트는 수정할 수 없습니다.");
    }
  }
}
```

#### 4.2.3 ChecklistResponseRoutes (신규)

**파일**: `backend/services/inspection/src/routes/checklist-response.routes.ts`

```typescript
import { Router } from "express";
import { validate } from "@trustee/common";
import { ChecklistResponseController } from "../controllers";
import {
  updateTrusteeChecklistItemSchema,
  batchUpdateChecklistItemsSchema,
  submitChecklistSchema,
} from "../validation";

export function createChecklistResponseRoutes(
  controller: ChecklistResponseController
): Router {
  const router = Router();

  router.get("/:token", controller.getByToken);
  router.patch("/:token/items/:itemId",
    validate(updateTrusteeChecklistItemSchema), controller.updateItem);
  router.patch("/:token/items/batch",
    validate(batchUpdateChecklistItemsSchema), controller.batchUpdateItems);
  router.post("/:token/submit",
    validate(submitChecklistSchema), controller.submit);

  return router;
}
```

#### 4.2.4 Validation 추가 (`validation.ts`)

```typescript
// 기존 파일에 추가
export const submitChecklistSchema = z.object({
  contactName: z.string().min(1, "담당자명은 필수입니다"),
  contactEmail: z.string().email("유효한 이메일을 입력해주세요").optional().or(z.literal("")),
  contactPhone: z.string().optional(),
});
```

### 4.3 Service Bootstrap 변경 (`index.ts`)

```typescript
// 신규 import
import { ChecklistResponseService } from "./services";
import { ChecklistResponseController } from "./controllers";
import { createChecklistResponseRoutes } from "./routes";

// main() 내부에 추가
const checklistResponseService = new ChecklistResponseService(
  trusteeChecklistRepository, rabbitmq
);
const checklistResponseController = new ChecklistResponseController(
  checklistResponseService
);

// Routes 추가
app.use("/api/checklist-response",
  createChecklistResponseRoutes(checklistResponseController));
```

### 4.4 에러 클래스

`@trustee/common`에 `ForbiddenError`가 없으면 추가 필요:

```typescript
export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}
```

`@trustee/common`에 기존 `AppError` 기반으로 `ForbiddenError` 사용 가능 여부 확인 후, 없으면 `ValidationError`(400) 또는 커스텀 에러로 대체.

### 4.5 Gateway 프록시 변경

**파일**: `backend/services/gateway/src/proxy.ts`

```typescript
export const inspectionProxy = createProxyMiddleware({
  target: config.inspectionServiceUrl,
  changeOrigin: true,
  pathFilter: [
    "/api/inspections",
    "/api/inspection-items",
    "/api/checklist-templates",
    "/api/trustee-checklists",
    "/api/checklist-response",  // ★ 추가
  ],
  on: { proxyReq: fixRequestBody },
});
```

## 5. Frontend 설계

### 5.1 디렉토리 구조

```
frontend/web/src/
├── app/
│   ├── (dashboard)/
│   │   └── inspections/
│   │       └── checklists/
│   │           ├── page.tsx         # 목록 (상태 필터 + 제출일 추가)
│   │           ├── new/page.tsx     # 생성 (토큰 링크 표시 추가)
│   │           └── [id]/page.tsx    # 상세 (토큰 URL + 검토 완료 추가)
│   │
│   └── checklist/                   # ★ 수탁사 전용 (대시보드 밖)
│       └── [token]/
│           ├── layout.tsx           # 독립 레이아웃 (사이드바 없음)
│           └── page.tsx             # 체크리스트 작성 페이지
│
├── hooks/
│   ├── useTrusteeChecklists.ts      # 기존 (변경 없음)
│   └── useChecklistResponse.ts      # ★ 수탁사 토큰 API 훅 (신규)
│
└── lib/api/
    ├── trustee-checklists.ts        # 기존 (토큰 재발급 추가)
    └── checklist-response.ts        # ★ 수탁사 토큰 API 클라이언트 (신규)
```

### 5.2 API 클라이언트

#### 5.2.1 기존 확장 (`trustee-checklists.ts`)

```typescript
// 기존 trusteeChecklistsApi에 추가
regenerateToken(id: string): Promise<{ data: RegenerateTokenResponse }> {
  return apiClient.post(`/api/trustee-checklists/${id}/regenerate-token`);
},
```

#### 5.2.2 신규 (`checklist-response.ts`)

```typescript
import type {
  TrusteeChecklist,
  UpdateTrusteeChecklistItemInput,
  BatchUpdateChecklistItemsInput,
  SubmitTrusteeChecklistInput,
} from "@trustee/types";
import { apiClient } from "./client";

export const checklistResponseApi = {
  // 토큰으로 체크리스트 조회
  getByToken(token: string): Promise<{ data: TrusteeChecklist }> {
    return apiClient.get(`/api/checklist-response/${token}`);
  },

  // 항목별 답변 저장
  updateItem(
    token: string, itemId: string, data: UpdateTrusteeChecklistItemInput
  ): Promise<{ data: unknown }> {
    return apiClient.patch(
      `/api/checklist-response/${token}/items/${itemId}`, data
    );
  },

  // 항목 일괄 저장
  batchUpdateItems(
    token: string, data: BatchUpdateChecklistItemsInput
  ): Promise<{ data: unknown }> {
    return apiClient.patch(
      `/api/checklist-response/${token}/items/batch`, data
    );
  },

  // 체크리스트 제출
  submit(
    token: string, data: SubmitTrusteeChecklistInput
  ): Promise<{ data: TrusteeChecklist }> {
    return apiClient.post(
      `/api/checklist-response/${token}/submit`, data
    );
  },
};
```

### 5.3 React Query 훅

#### 5.3.1 신규 (`useChecklistResponse.ts`)

```typescript
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  UpdateTrusteeChecklistItemInput,
  BatchUpdateChecklistItemsInput,
  SubmitTrusteeChecklistInput,
} from "@trustee/types";
import { checklistResponseApi } from "@/lib/api";

const RESPONSE_KEY = ["checklist-response"];

// 토큰으로 체크리스트 조회
export function useChecklistByToken(token: string) {
  return useQuery({
    queryKey: [...RESPONSE_KEY, token],
    queryFn: () => checklistResponseApi.getByToken(token),
    enabled: !!token,
  });
}

// 항목 일괄 저장 (자동저장용)
export function useBatchSaveResponse(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BatchUpdateChecklistItemsInput) =>
      checklistResponseApi.batchUpdateItems(token, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...RESPONSE_KEY, token] });
    },
  });
}

// 체크리스트 제출
export function useSubmitChecklist(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SubmitTrusteeChecklistInput) =>
      checklistResponseApi.submit(token, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...RESPONSE_KEY, token] });
    },
  });
}
```

### 5.4 수탁사 작성 페이지 상세 설계

#### 5.4.1 레이아웃 (`/checklist/[token]/layout.tsx`)

```
┌──────────────────────────────────────┐
│  [로고]  수탁사 보안점검 시스템       │ ← AppBar (최소한)
├──────────────────────────────────────┤
│                                      │
│  {children}                          │ ← 사이드바 없음, 풀 너비
│                                      │
└──────────────────────────────────────┘
```

- MUI `Container` + `AppBar` 조합
- 대시보드 Layout과 완전 분리
- 최대 너비: `maxWidth="lg"` (1200px)

#### 5.4.2 작성 페이지 (`/checklist/[token]/page.tsx`)

**컴포넌트 구조**:

```
ChecklistResponsePage
├── 로딩 상태 (CircularProgress)
├── 에러 상태 (토큰 만료, 404)
├── 제출 완료 상태 (읽기 전용 뷰)
└── 작성 모드
    ├── 헤더 (제목 + 점검범위 + 진행률)
    ├── ContactInfoSection (작성자 정보)
    │   ├── 담당자명 (필수) *
    │   ├── 이메일
    │   └── 연락처
    ├── CategoryAccordion (범주별 아코디언) x3
    │   └── SectionAccordion (영역별 아코디언)
    │       └── ChecklistItemRow (항목별 답변 행)
    │           ├── 대상여부 (Switch)
    │           ├── 답변 (RadioGroup)
    │           ├── 현황 (TextField)
    │           ├── 증빙자료 (TextField)
    │           └── 비고 (TextField)
    ├── ProgressBar (진행률 바)
    └── ActionButtons (임시저장 + 제출)
```

**상태 관리 전략**:

```typescript
// 로컬 상태로 변경 추적 (서버 데이터와 분리)
const [changes, setChanges] = useState<Record<string, ItemChange>>({});
const [contactInfo, setContactInfo] = useState<ContactInfo>({
  contactName: "", contactEmail: "", contactPhone: "",
});

// 자동저장 (debounce 2초)
const debouncedSave = useDebouncedCallback(() => {
  const items = Object.entries(changes).map(([id, change]) => ({ id, ...change }));
  if (items.length > 0) {
    batchSave({ items });
    setChanges({}); // 저장 후 변경 초기화
  }
}, 2000);

// 항목 값 변경 시 debounce 트리거
const updateItemField = (itemId, field, value) => {
  setChanges(prev => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
  debouncedSave();
};
```

**진행률 계산**:

```typescript
// 전체 항목 중 answer가 입력된 항목 수
const totalItems = checklist.categories.reduce(
  (sum, cat) => sum + cat.sections.reduce(
    (s, sec) => s + sec.items.length, 0
  ), 0
);

const answeredItems = checklist.categories.reduce(
  (sum, cat) => sum + cat.sections.reduce(
    (s, sec) => s + sec.items.filter(
      item => (changes[item.id]?.answer ?? item.answer) != null
    ).length, 0
  ), 0
);

const progress = Math.round((answeredItems / totalItems) * 100);
```

**제출 플로우**:

```
[제출] 클릭
  ↓
미답변 항목 체크
  ├─ 있음 → 확인 Dialog "N개 미답변 항목이 있습니다. 제출하시겠습니까?"
  │           ├─ 확인 → 제출 진행
  │           └─ 취소 → 돌아가기
  └─ 없음 → 확인 Dialog "제출하시겠습니까? 제출 후 수정이 불가합니다."
              ├─ 확인 → 제출 진행
              └─ 취소 → 돌아가기

제출 진행:
  1. 미저장 변경사항이 있으면 먼저 batchSave
  2. submit API 호출 (contactName 필수 검증)
  3. 성공 → 읽기 전용 모드 전환 + "제출이 완료되었습니다" Alert
```

### 5.5 위탁사 페이지 변경 상세

#### 5.5.1 체크리스트 생성 페이지 (`/inspections/checklists/new`)

**변경 내용**: 생성 성공 후 토큰 링크 표시

```
기존: onSuccess → router.push("/inspections/checklists")
변경: onSuccess → 토큰 링크 Dialog 표시
```

```
┌────────────────────────────────────┐
│  체크리스트가 생성되었습니다!        │
│                                    │
│  수탁사에 아래 링크를 전달하세요:   │
│  ┌──────────────────────────────┐  │
│  │ https://..../checklist/abc.. │  │  ← 읽기 전용 TextField
│  │                    [복사📋]  │  │  ← 클립보드 복사 버튼
│  └──────────────────────────────┘  │
│                                    │
│  [목록으로 돌아가기]               │
└────────────────────────────────────┘
```

#### 5.5.2 체크리스트 상세 페이지 (`/inspections/checklists/[id]`)

**추가 요소**:

1. **토큰 링크 표시 영역**: 토큰 URL + 복사 버튼
2. **상태 뱃지 개선**: 현재 상태에 따른 색상 + 제출일 표시
3. **검토 완료 버튼**: `submitted` 상태일 때 "검토 완료" 버튼 표시 → `reviewed`로 변경
4. **토큰 재발급 버튼**: "링크 재발급" 버튼 (기존 토큰 무효화 확인 Dialog)
5. **작성자 정보 표시**: 수탁사 담당자가 제출 시 입력한 contactName/Email/Phone 표시

#### 5.5.3 체크리스트 목록 페이지 (`/inspections/checklists`)

**추가 컬럼**:
| 컬럼 | 설명 |
|------|------|
| 작성자 | contactName (수탁사 담당자명) |
| 제출일 | submittedAt (날짜 포맷) |

**추가 필터**: 상태별 필터 (전체/초안/전달됨/작성중/제출완료/검토완료)

## 6. API 응답 형식 상세

### 6.1 체크리스트 생성 응답 (위탁사)

```json
// POST /api/trustee-checklists
// Response 201
{
  "data": {
    "id": "clx...",
    "trusteeId": "clx...",
    "title": "수탁업체 보안 점검 체크리스트",
    "status": "sent",
    "accessToken": "550e8400-e29b-41d4-a716-446655440000",
    "categories": [ ... ],
    "createdAt": "2026-02-19T..."
  }
}
```

### 6.2 토큰 조회 응답 (수탁사)

```json
// GET /api/checklist-response/:token
// Response 200
{
  "data": {
    "id": "clx...",
    "title": "수탁업체 보안 점검 체크리스트",
    "inspectionScope": "개인정보 처리 업무 전반",
    "status": "in_progress",
    "contactName": null,
    "categories": [
      {
        "id": "clx...",
        "no": 1,
        "name": "관리적보호조치",
        "sections": [
          {
            "id": "clx...",
            "no": "1.1",
            "name": "개인정보보호정책",
            "items": [
              {
                "id": "clx...",
                "no": "1.1.1",
                "question": "개인정보 보호방침을 수립하고 있는가?",
                "hint": null,
                "applicable": true,
                "answer": "yes",
                "currentStatus": "수립 완료",
                "evidence": "개인정보보호방침_v3.pdf",
                "remarks": ""
              }
            ]
          }
        ]
      }
    ]
  }
}
```

**주의**: 토큰 API 응답에서 `accessToken` 필드는 **제외** (보안)

### 6.3 제출 요청/응답

```json
// POST /api/checklist-response/:token/submit
// Request
{
  "contactName": "홍길동",
  "contactEmail": "hong@example.com",
  "contactPhone": "010-1234-5678"
}

// Response 200
{
  "data": {
    "id": "clx...",
    "status": "submitted",
    "submittedAt": "2026-02-19T...",
    "contactName": "홍길동",
    "contactEmail": "hong@example.com"
  }
}
```

## 7. 구현 순서 (Implementation Order)

### Step 1: DB 스키마 변경
- [ ] `inspection/prisma/schema.prisma` - TrusteeChecklist에 5개 필드 추가
- [ ] `pnpm --filter @trustee/inspection-service exec prisma db push`

### Step 2: 타입 변경
- [ ] `backend/packages/types/src/checklist.ts` - TrusteeChecklist 인터페이스 확장
- [ ] `backend/packages/types/src/checklist.ts` - SubmitTrusteeChecklistInput 추가

### Step 3: Backend - Repository 확장
- [ ] `trustee-checklist.repository.ts` - `findByToken`, `regenerateToken` 추가

### Step 4: Backend - ChecklistResponseService 신규
- [ ] `services/checklist-response.service.ts` - 토큰 검증 + CRUD + 제출
- [ ] `controllers/checklist-response.controller.ts` - 4개 핸들러
- [ ] `routes/checklist-response.routes.ts` - 라우트 정의

### Step 5: Backend - Validation 추가
- [ ] `validation.ts` - `submitChecklistSchema` 추가

### Step 6: Backend - 기존 서비스 변경
- [ ] `trustee-checklist.service.ts` - create 시 상태 `sent` 변경
- [ ] `trustee-checklist.controller.ts` - `regenerateToken` 핸들러
- [ ] `trustee-checklist.routes.ts` - 재발급 라우트 추가

### Step 7: Backend - Bootstrap 변경
- [ ] `index.ts` - ChecklistResponseService/Controller/Routes 등록
- [ ] exports `index.ts` - 신규 모듈 export 추가

### Step 8: Gateway 프록시 추가
- [ ] `proxy.ts` - `/api/checklist-response` pathFilter 추가

### Step 9: Frontend - API 클라이언트 + 훅
- [ ] `lib/api/checklist-response.ts` - 신규 API 클라이언트
- [ ] `lib/api/trustee-checklists.ts` - `regenerateToken` 추가
- [ ] `lib/api/index.ts` - export 추가
- [ ] `hooks/useChecklistResponse.ts` - 신규 훅 3개
- [ ] `hooks/index.ts` - export 추가

### Step 10: Frontend - 수탁사 작성 페이지
- [ ] `app/checklist/[token]/layout.tsx` - 독립 레이아웃
- [ ] `app/checklist/[token]/page.tsx` - 체크리스트 작성 페이지

### Step 11: Frontend - 위탁사 페이지 개선
- [ ] `inspections/checklists/new/page.tsx` - 생성 후 토큰 링크 Dialog
- [ ] `inspections/checklists/[id]/page.tsx` - 토큰 URL, 검토 완료, 작성자 정보
- [ ] `inspections/checklists/page.tsx` - 상태 필터, 작성자/제출일 컬럼

## 8. 의존성

```
pnpm add use-debounce --filter @trustee/web
```

`use-debounce` 패키지: 자동저장 debounce 구현용 (`useDebouncedCallback`)

## 9. 테스트 체크리스트

| 시나리오 | 검증 항목 |
|----------|----------|
| 체크리스트 생성 | accessToken 자동 발급, status=sent |
| 토큰 링크 접속 | 체크리스트 데이터 정상 로드 |
| 항목 답변 저장 | 자동저장(debounce) 동작, status→in_progress |
| 임시저장 | 즉시 저장 후 재접속 시 데이터 유지 |
| 제출 | status→submitted, submittedAt 기록, 작성자 정보 저장 |
| 제출 후 접속 | 읽기 전용 모드 (수정 불가) |
| 만료 토큰 | 403 에러, "토큰이 만료되었습니다" 메시지 |
| 토큰 재발급 | 기존 토큰 무효화, 새 토큰 발급 |
| 위탁사 검토 | status→reviewed 변경 가능 |
| 잘못된 토큰 | 404 에러, "체크리스트를 찾을 수 없습니다" 메시지 |
