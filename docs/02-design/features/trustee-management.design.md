# Design: 수탁사 관리 - 복수 담당자 지원

> Plan 참조: `docs/01-plan/features/trustee-management.plan.md`

## 변경 파일 목록

```
backend/packages/database/prisma/schema.prisma      # TrusteeContact 모델 추가
backend/packages/types/src/index.ts                  # 타입 변경
backend/services/trustee/src/validation.ts           # Zod 스키마 변경
backend/services/trustee/src/repositories/trustee.repository.ts  # contacts include/nested
backend/services/trustee/src/services/trustee.service.ts         # DTO/검색 변경
backend/services/trustee/src/grpc-server.ts          # 단일 담당자 필드 제거
frontend/web/src/app/(dashboard)/trustees/page.tsx   # 주담당자 컬럼
frontend/web/src/app/(dashboard)/trustees/new/page.tsx       # 동적 담당자 폼
frontend/web/src/app/(dashboard)/trustees/[id]/page.tsx      # 담당자 수정 폼
```

---

## 1. 데이터 모델 변경

### 1-1. Prisma 스키마 (`backend/packages/database/prisma/schema.prisma`)

**Trustee 모델 변경** - 단일 담당자 필드 제거, nullable 변경:
```prisma
model Trustee {
  id              String        @id @default(cuid())
  companyName     String        @map("company_name")
  businessNumber  String?       @unique @map("business_number")  // nullable
  representative  String?                                         // nullable
  delegatedTasks  String        @map("delegated_tasks") @db.Text
  status          TrusteeStatus @default(pending)
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  contacts    TrusteeContact[]
  contracts   Contract[]
  inspections Inspection[]

  @@map("trustees")
}
```

**TrusteeContact 모델 추가**:
```prisma
model TrusteeContact {
  id         String   @id @default(cuid())
  trusteeId  String   @map("trustee_id")
  name       String
  phone      String?
  email      String?
  department String?
  position   String?
  isPrimary  Boolean  @default(false) @map("is_primary")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  trustee Trustee @relation(fields: [trusteeId], references: [id], onDelete: Cascade)

  @@map("trustee_contacts")
}
```

**삭제 필드** (Trustee에서): `contactName`, `contactPhone`, `contactEmail`

### 1-2. 공유 타입 (`backend/packages/types/src/index.ts`)

```typescript
// 담당자 정보
export interface TrusteeContact {
  id: string;
  trusteeId: string;
  name: string;
  phone?: string;
  email?: string;
  department?: string;
  position?: string;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// 담당자 생성 입력
export interface CreateTrusteeContactInput {
  name: string;
  phone?: string;
  email?: string;
  department?: string;
  position?: string;
  isPrimary: boolean;
}

// 담당자 수정 입력
export interface UpdateTrusteeContactInput extends Partial<CreateTrusteeContactInput> {
  id?: string;
}

// 수탁사 정보 (변경)
export interface Trustee {
  id: string;
  companyName: string;
  businessNumber?: string;     // optional
  representative?: string;     // optional
  delegatedTasks: string;
  status: TrusteeStatus;
  contacts: TrusteeContact[];  // 새 필드
  createdAt: Date;
  updatedAt: Date;
}

// 수탁사 생성 입력 (변경)
export interface CreateTrusteeInput {
  companyName: string;
  businessNumber?: string;
  representative?: string;
  delegatedTasks: string;
  status?: TrusteeStatus;
  contacts: CreateTrusteeContactInput[];
}

// 수탁사 수정 입력 (변경)
export interface UpdateTrusteeInput {
  companyName?: string;
  businessNumber?: string;
  representative?: string;
  delegatedTasks?: string;
  status?: TrusteeStatus;
  contacts?: UpdateTrusteeContactInput[];
}
```

---

## 2. 백엔드 변경

### 2-1. Validation (`backend/services/trustee/src/validation.ts`)

```typescript
import { z } from "zod";

const createContactSchema = z.object({
  name: z.string().min(1, "담당자명은 필수입니다"),
  phone: z.string().optional(),
  email: z.string().email("유효한 이메일을 입력해주세요").optional().or(z.literal("")),
  department: z.string().optional(),
  position: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

export const createTrusteeSchema = z.object({
  companyName: z.string().min(1, "회사명은 필수입니다"),
  businessNumber: z.string().optional(),
  representative: z.string().optional(),
  delegatedTasks: z.string().min(1, "위탁 업무는 필수입니다"),
  status: z.enum(["active", "inactive", "pending"]).optional(),
  contacts: z.array(createContactSchema).min(1, "최소 1명의 담당자가 필요합니다"),
}).refine(
  (data) => data.contacts.some((c) => c.isPrimary),
  { message: "주담당자를 1명 지정해주세요", path: ["contacts"] }
);

const updateContactSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "담당자명은 필수입니다"),
  phone: z.string().optional(),
  email: z.string().email("유효한 이메일을 입력해주세요").optional().or(z.literal("")),
  department: z.string().optional(),
  position: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

export const updateTrusteeSchema = z.object({
  companyName: z.string().min(1).optional(),
  businessNumber: z.string().optional(),
  representative: z.string().optional(),
  delegatedTasks: z.string().min(1).optional(),
  status: z.enum(["active", "inactive", "pending"]).optional(),
  contacts: z.array(updateContactSchema).min(1).optional(),
});

// contract 스키마는 유지
export const createContractSchema = z.object({
  trusteeId: z.string().min(1, "수탁사 ID는 필수입니다"),
  startDate: z.string().min(1, "시작일은 필수입니다"),
  endDate: z.string().min(1, "종료일은 필수입니다"),
  fileUrl: z.string().optional(),
});

export const updateContractSchema = createContractSchema
  .omit({ trusteeId: true })
  .partial();
```

### 2-2. Repository (`backend/services/trustee/src/repositories/trustee.repository.ts`)

**핵심 변경:**
- 모든 조회: `include: { contacts: true, contracts: true }`
- `create`: contacts nested create
- `update`: contacts가 전달되면 delete all → create 전략 (트랜잭션)
- `findByBusinessNumber`: null 체크 추가

```typescript
import { Prisma } from "../generated/prisma";
import { prisma } from "../db";

interface CreateContactData {
  name: string;
  phone?: string;
  email?: string;
  department?: string;
  position?: string;
  isPrimary: boolean;
}

interface UpdateContactData extends Partial<CreateContactData> {
  id?: string;
}

const TRUSTEE_INCLUDE = { contacts: true, contracts: true };

export class TrusteeRepository {
  async findAll(params: {
    skip?: number;
    take?: number;
    where?: Prisma.TrusteeWhereInput;
    orderBy?: Prisma.TrusteeOrderByWithRelationInput;
  }) {
    const [data, total] = await Promise.all([
      prisma.trustee.findMany({
        skip: params.skip,
        take: params.take,
        where: params.where,
        orderBy: params.orderBy,
        include: TRUSTEE_INCLUDE,
      }),
      prisma.trustee.count({ where: params.where }),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    return prisma.trustee.findUnique({
      where: { id },
      include: TRUSTEE_INCLUDE,
    });
  }

  async findByBusinessNumber(businessNumber: string) {
    if (!businessNumber) return null;
    return prisma.trustee.findUnique({
      where: { businessNumber },
    });
  }

  async create(data: {
    companyName: string;
    businessNumber?: string;
    representative?: string;
    delegatedTasks: string;
    status?: "active" | "inactive" | "pending";
    contacts: CreateContactData[];
  }) {
    const { contacts, ...trusteeData } = data;
    return prisma.trustee.create({
      data: {
        ...trusteeData,
        contacts: { create: contacts },
      },
      include: TRUSTEE_INCLUDE,
    });
  }

  async update(id: string, data: {
    companyName?: string;
    businessNumber?: string;
    representative?: string;
    delegatedTasks?: string;
    status?: "active" | "inactive" | "pending";
    contacts?: UpdateContactData[];
  }) {
    const { contacts, ...trusteeData } = data;

    return prisma.$transaction(async (tx) => {
      if (contacts) {
        await tx.trusteeContact.deleteMany({ where: { trusteeId: id } });
        await tx.trusteeContact.createMany({
          data: contacts.map((c) => ({
            trusteeId: id,
            name: c.name!,
            phone: c.phone,
            email: c.email,
            department: c.department,
            position: c.position,
            isPrimary: c.isPrimary ?? false,
          })),
        });
      }

      return tx.trustee.update({
        where: { id },
        data: trusteeData,
        include: TRUSTEE_INCLUDE,
      });
    });
  }

  async delete(id: string) {
    return prisma.trustee.delete({ where: { id } });
  }

  async exists(id: string): Promise<boolean> {
    const count = await prisma.trustee.count({ where: { id } });
    return count > 0;
  }
}
```

### 2-3. Service (`backend/services/trustee/src/services/trustee.service.ts`)

**핵심 변경:**
- DTO에서 단일 담당자 필드 제거 → contacts 배열 추가
- 검색: `contactName` → `contacts.some.name`
- 생성: `businessNumber` 있을 때만 중복 검사

```typescript
interface CreateContactDto {
  name: string;
  phone?: string;
  email?: string;
  department?: string;
  position?: string;
  isPrimary: boolean;
}

interface CreateTrusteeDto {
  companyName: string;
  businessNumber?: string;
  representative?: string;
  delegatedTasks: string;
  status?: "active" | "inactive" | "pending";
  contacts: CreateContactDto[];
}

interface UpdateTrusteeDto {
  companyName?: string;
  businessNumber?: string;
  representative?: string;
  delegatedTasks?: string;
  status?: "active" | "inactive" | "pending";
  contacts?: Array<{
    id?: string;
    name: string;
    phone?: string;
    email?: string;
    department?: string;
    position?: string;
    isPrimary: boolean;
  }>;
}

// list 검색 where 절:
if (params.search) {
  where.OR = [
    { companyName: { contains: params.search } },
    { businessNumber: { contains: params.search } },
    { contacts: { some: { name: { contains: params.search } } } },
  ];
}

// create:
async create(dto: CreateTrusteeDto) {
  if (dto.businessNumber) {
    const existing = await this.repository.findByBusinessNumber(dto.businessNumber);
    if (existing) {
      throw new ConflictError(`사업자번호 '${dto.businessNumber}'는 이미 등록되어 있습니다.`);
    }
  }
  const trustee = await this.repository.create(dto);
  // ... 이벤트 발행
  return trustee;
}
```

### 2-4. gRPC Server (`backend/services/trustee/src/grpc-server.ts`)

단일 담당자 필드 제거:
```typescript
callback(null, {
  id: trustee.id,
  companyName: trustee.companyName,
  businessNumber: trustee.businessNumber || "",
  representative: trustee.representative || "",
  delegatedTasks: trustee.delegatedTasks,
  status: trustee.status,
  createdAt: trustee.createdAt.toISOString(),
  updatedAt: trustee.updatedAt.toISOString(),
});
```

### 2-5. 변경 불필요 파일
- `trustee.controller.ts` - req.body 위임만
- `trustee.routes.ts` - 스키마 참조로 자동 반영
- `index.ts` - DI 구조 동일
- Gateway - 프록시만

---

## 3. 프론트엔드 변경

### 3-1. 목록 페이지 (`frontend/web/src/app/(dashboard)/trustees/page.tsx`)

**컬럼 변경만:**
```typescript
const columns: Column<Trustee>[] = [
  { id: "companyName", label: "회사명", minWidth: 150 },
  { id: "businessNumber", label: "사업자번호", minWidth: 130 },
  { id: "representative", label: "대표자", minWidth: 100 },
  {
    id: "contacts",
    label: "주담당자",
    minWidth: 120,
    render: (row) => {
      const primary = row.contacts?.find((c) => c.isPrimary);
      return primary?.name ?? "-";
    },
  },
  {
    id: "status",
    label: "상태",
    minWidth: 80,
    render: (row) => <StatusBadge status={row.status} />,
  },
];
```

### 3-2. 등록 페이지 (`frontend/web/src/app/(dashboard)/trustees/new/page.tsx`)

**Zod 스키마:**
```typescript
const contactSchema = z.object({
  name: z.string().min(1, "담당자명은 필수입니다"),
  phone: z.string().optional(),
  email: z.string().email("유효한 이메일을 입력해주세요").optional().or(z.literal("")),
  department: z.string().optional(),
  position: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

const trusteeFormSchema = z.object({
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

**React Hook Form + useFieldArray:**
```typescript
const { control, register, handleSubmit, formState: { errors }, watch, setValue } =
  useForm<TrusteeFormData>({
    resolver: zodResolver(trusteeFormSchema),
    defaultValues: {
      status: "pending",
      contacts: [{ name: "", phone: "", email: "", department: "", position: "", isPrimary: true }],
    },
  });

const { fields, append, remove } = useFieldArray({ control, name: "contacts" });
```

**주담당자 변경:**
```typescript
const handlePrimaryChange = (index: number) => {
  fields.forEach((_, i) => {
    setValue(`contacts.${i}.isPrimary`, i === index);
  });
};
```

**담당자 삭제 (주담당자 보호):**
```typescript
const handleRemoveContact = (index: number) => {
  if (fields.length <= 1) return;
  const wasPrimary = watch(`contacts.${index}.isPrimary`);
  remove(index);
  if (wasPrimary) {
    setValue("contacts.0.isPrimary", true);
  }
};
```

**폼 레이아웃:**
```
┌──────────────────────────────────────────────────┐
│ 수탁사 등록                                       │
├──────────────────────────────────────────────────┤
│ 기본 정보                                         │
│ ┌────────────────┬────────────────┐              │
│ │ 회사명 *       │ 사업자번호     │              │
│ ├────────────────┼────────────────┤              │
│ │ 대표자         │ 상태           │              │
│ ├────────────────┴────────────────┤              │
│ │ 위탁 업무 * (multiline)        │              │
│ └─────────────────────────────────┘              │
│                                                   │
│ 담당자 정보                    [+ 담당자 추가]    │
│ ┌─────────────────────────────────────────────┐  │
│ │ ● 이름*  연락처  이메일  부서  직책  [삭제]  │  │
│ │ ○ 이름*  연락처  이메일  부서  직책  [삭제]  │  │
│ └─────────────────────────────────────────────┘  │
│                                                   │
│                          [취소] [등록]            │
└──────────────────────────────────────────────────┘
```

**담당자 행 UI (각 field):**
```tsx
{fields.map((field, index) => (
  <Paper key={field.id} sx={{ p: 2, mb: 1 }}>
    <Grid container spacing={2} alignItems="center">
      <Grid size={{ xs: "auto" }}>
        <Radio
          checked={watch(`contacts.${index}.isPrimary`)}
          onChange={() => handlePrimaryChange(index)}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 2 }}>
        <FormTextField
          label="이름"
          {...register(`contacts.${index}.name`)}
          error={errors.contacts?.[index]?.name?.message}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 2 }}>
        <FormTextField label="연락처" {...register(`contacts.${index}.phone`)} />
      </Grid>
      <Grid size={{ xs: 12, sm: 2 }}>
        <FormTextField label="이메일" {...register(`contacts.${index}.email`)} />
      </Grid>
      <Grid size={{ xs: 12, sm: 2 }}>
        <FormTextField label="부서" {...register(`contacts.${index}.department`)} />
      </Grid>
      <Grid size={{ xs: 12, sm: 2 }}>
        <FormTextField label="직책" {...register(`contacts.${index}.position`)} />
      </Grid>
      <Grid size={{ xs: "auto" }}>
        <IconButton
          onClick={() => handleRemoveContact(index)}
          disabled={fields.length <= 1}
        >
          <DeleteIcon />
        </IconButton>
      </Grid>
    </Grid>
  </Paper>
))}
```

### 3-3. 상세/수정 페이지 (`frontend/web/src/app/(dashboard)/trustees/[id]/page.tsx`)

등록 페이지와 동일한 담당자 폼 구조. 차이점:

**데이터 로드 후 폼 초기화:**
```typescript
useEffect(() => {
  if (data?.data) {
    const trustee = data.data;
    reset({
      companyName: trustee.companyName,
      businessNumber: trustee.businessNumber ?? "",
      representative: trustee.representative ?? "",
      delegatedTasks: trustee.delegatedTasks,
      status: trustee.status,
      contacts: trustee.contacts.map((c) => ({
        name: c.name,
        phone: c.phone ?? "",
        email: c.email ?? "",
        department: c.department ?? "",
        position: c.position ?? "",
        isPrimary: c.isPrimary,
      })),
    });
  }
}, [data, reset]);
```

### 3-4. 변경 불필요 파일
- `frontend/web/src/lib/api/trustees.ts` - `@trustee/types` 타입 변경으로 자동 호환
- `frontend/web/src/hooks/useTrustees.ts` - 타입 변경으로 자동 호환

---

## 4. 구현 순서

| 순서 | 파일 | 작업 |
|------|------|------|
| 1 | `schema.prisma` | TrusteeContact 추가, Trustee 필드 변경 |
| 2 | `types/src/index.ts` | TrusteeContact 타입, Trustee/Input 변경 |
| 3 | `validation.ts` | contacts 스키마, 필수값 완화 |
| 4 | `trustee.repository.ts` | include, nested create, transaction update |
| 5 | `trustee.service.ts` | DTO, 검색, 중복검사 조건부 |
| 6 | `grpc-server.ts` | 단일 담당자 필드 제거 |
| 7 | `trustees/page.tsx` | 주담당자 컬럼 render |
| 8 | `trustees/new/page.tsx` | useFieldArray 동적 담당자 폼 |
| 9 | `trustees/[id]/page.tsx` | 담당자 수정, reset 변경 |

---

## 5. 완료 조건

- [ ] TrusteeContact Prisma 모델 추가, DB push 성공
- [ ] `@trustee/types`에 TrusteeContact 타입 추가
- [ ] 백엔드: contacts nested create/update (트랜잭션)
- [ ] 백엔드: businessNumber 조건부 중복검사
- [ ] 백엔드: contacts.name 검색 지원
- [ ] 목록: 주담당자명 컬럼 표시
- [ ] 등록: useFieldArray 동적 담당자 (추가/삭제/주담당자 Radio)
- [ ] 수정: 기존 담당자 로드 + 수정/추가/삭제
- [ ] Zod refine: 주담당자 최소 1명 검증
- [ ] TypeScript 에러 없음
- [ ] 한국어 UI
