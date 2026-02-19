# 점검 시스템 고도화 - 통합 아키텍처 설계서

## 1. 개요

이 문서는 Phase 0에서 산출된 개인정보보호 점검 항목 체계서, 스코어링 모델, UI 화면 설계서, 디자인 시스템 가이드를 통합하여, 점검 시스템 고도화를 위한 상세 구현 아키텍처를 정의한다.

### 1.1 핵심 목표
1. **스코어링 엔진**: 체크리스트 제출 시 자동 점수 산정 및 등급 부여
2. **결과 시각화**: 점수/등급 배지, 카테고리별 레이더 차트, 답변 분포 시각화
3. **대시보드 고도화**: 점검 메인 페이지를 통계 대시보드로 전환
4. **목록 UX 개선**: 점수/등급 컬럼, 진행률 표시, 필터 강화
5. **상세 페이지 고도화**: ScorePanel, 레이더 차트, 미흡 항목 하이라이트

### 1.2 변경 범위
- **inspection-service**: 스코어링 엔진 추가, API 응답 확장
- **프론트엔드 페이지**: 3개 페이지 개선 (메인, 목록, 상세)
- **@trustee/ui**: 신규 컴포넌트 2개 (GradeBadge, inspectionColors 토큰)
- **@trustee/web 컴포넌트**: 5개 신규 (ScorePanel, RadarChart, ProgressBar, StatusChip, ItemCard)
- **공유 타입**: ScoringResult 관련 타입 추가

### 1.3 하위 호환성
- 기존 DB 스키마 변경 **없음** (컬럼 추가만)
- 기존 API 엔드포인트 유지, 응답 필드 추가만
- 기존 프론트엔드 기능 보존

---

## 2. 데이터 모델

### 2.1 Prisma 스키마 변경

기존 `TrusteeChecklist` 모델에 스코어링 결과 필드를 추가한다.

```prisma
// backend/services/inspection/prisma/schema.prisma

// ── 기존 TrusteeChecklist 모델에 추가할 필드 ──
model TrusteeChecklist {
  // ... 기존 필드 모두 유지 ...

  // ★ 신규: 스코어링 결과
  totalScore      Float?   @map("total_score")
  grade           String?  @db.VarChar(2)     // "S", "A", "B", "C", "D"
  scoreDetail     Json?    @map("score_detail")  // ScoringResult JSON
  scoredAt        DateTime? @map("scored_at")

  // ... 기존 관계 유지 ...
}

// ── 기존 ChecklistCategory에 가중치 추가 ──
model ChecklistCategory {
  // ... 기존 필드 모두 유지 ...

  // ★ 신규: 카테고리 가중치
  weight  Int  @default(0)  // 백분율 (15, 20, 25, 10, 10, 10, 10)
}

// ── 기존 TrusteeChecklistCategory에 가중치 스냅샷 추가 ──
model TrusteeChecklistCategory {
  // ... 기존 필드 모두 유지 ...

  // ★ 신규: 가중치 스냅샷 (템플릿에서 복사)
  weight  Int  @default(0)
}

// ── 기존 ChecklistItem에 필수이행 플래그 추가 ──
model ChecklistItem {
  // ... 기존 필드 모두 유지 ...

  // ★ 신규: 필수 이행 항목 플래그
  isCritical  Boolean  @default(false) @map("is_critical")
}

// ── 기존 TrusteeChecklistItem에 필수이행 플래그 스냅샷 추가 ──
model TrusteeChecklistItem {
  // ... 기존 필드 모두 유지 ...

  // ★ 신규: 필수 이행 항목 플래그 (템플릿에서 복사)
  isCritical  Boolean  @default(false) @map("is_critical")
}
```

### 2.2 상세 스키마 변경 (inspection-service Prisma)

아래는 `backend/services/inspection/prisma/schema.prisma`에서 변경/추가할 부분만 표시한다.

#### TrusteeChecklist 모델 변경
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

  accessToken          String    @unique @default(uuid()) @map("access_token")
  accessTokenExpiresAt DateTime  @map("access_token_expires_at")

  submissionCount Int @default(0) @map("submission_count")

  contactName  String? @map("contact_name")
  contactEmail String? @map("contact_email")
  contactPhone String? @map("contact_phone")

  // ★ 신규 필드
  totalScore   Float?    @map("total_score")
  grade        String?   @db.VarChar(2)
  scoreDetail  Json?     @map("score_detail")
  scoredAt     DateTime? @map("scored_at")

  categories TrusteeChecklistCategory[]

  @@map("trustee_checklists")
}
```

#### ChecklistCategory 모델 변경
```prisma
model ChecklistCategory {
  id         String @id @default(cuid())
  templateId String @map("template_id")
  no         Int
  name       String
  sortOrder  Int    @default(0) @map("sort_order")
  weight     Int    @default(0)  // ★ 신규

  template ChecklistTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  sections ChecklistSection[]

  @@map("checklist_categories")
}
```

#### TrusteeChecklistCategory 모델 변경
```prisma
model TrusteeChecklistCategory {
  id          String @id @default(cuid())
  checklistId String @map("checklist_id")
  no          Int
  name        String
  sortOrder   Int    @default(0) @map("sort_order")
  weight      Int    @default(0)  // ★ 신규

  checklist TrusteeChecklist          @relation(fields: [checklistId], references: [id], onDelete: Cascade)
  sections  TrusteeChecklistSection[]

  @@map("trustee_checklist_categories")
}
```

#### ChecklistItem 모델 변경
```prisma
model ChecklistItem {
  id        String  @id @default(cuid())
  sectionId String  @map("section_id")
  no        String
  question  String  @db.Text
  hint      String? @db.Text
  sortOrder Int     @default(0) @map("sort_order")
  isCritical Boolean @default(false) @map("is_critical")  // ★ 신규

  section ChecklistSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)

  @@map("checklist_items")
}
```

#### TrusteeChecklistItem 모델 변경
```prisma
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
  remarks       String?          @db.Text
  isCritical    Boolean          @default(false) @map("is_critical")  // ★ 신규

  section       TrusteeChecklistSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  evidenceFiles EvidenceFile[]

  @@map("trustee_checklist_items")
}
```

### 2.3 마이그레이션 전략
1. `prisma db push`로 새 컬럼 추가 (기본값이 있으므로 기존 데이터 호환)
2. 기존 데이터의 `weight`는 0으로 초기화 (새로 생성하는 템플릿부터 가중치 적용)
3. `totalScore`, `grade`, `scoreDetail`은 nullable이므로 기존 체크리스트에 영향 없음

---

## 3. 공유 타입 변경

### 3.1 `backend/packages/types/src/checklist.ts` 추가/변경

```typescript
// ── 기존 타입에 추가할 필드 ──

// ChecklistCategory에 weight 추가
export interface ChecklistCategory {
  // ... 기존 필드 유지 ...
  weight: number;        // ★ 신규
}

// TrusteeChecklistCategory에 weight 추가
export interface TrusteeChecklistCategory {
  // ... 기존 필드 유지 ...
  weight: number;        // ★ 신규
}

// ChecklistItem에 isCritical 추가
export interface ChecklistItem {
  // ... 기존 필드 유지 ...
  isCritical: boolean;   // ★ 신규
}

// TrusteeChecklistItem에 isCritical 추가
export interface TrusteeChecklistItem {
  // ... 기존 필드 유지 ...
  isCritical: boolean;   // ★ 신규
}

// TrusteeChecklist에 스코어링 필드 추가
export interface TrusteeChecklist {
  // ... 기존 필드 유지 ...
  totalScore?: number;    // ★ 신규
  grade?: string;         // ★ 신규
  scoreDetail?: ScoringResult;  // ★ 신규
  scoredAt?: Date;        // ★ 신규
}

// CreateChecklistTemplateInput의 categories에 weight 추가
export interface CreateChecklistTemplateInput {
  title: string;
  version?: string;
  description?: string;
  categories: {
    no: number;
    name: string;
    weight?: number;     // ★ 신규
    sections: {
      no: string;
      name: string;
      items: {
        no: string;
        question: string;
        hint?: string;
        isCritical?: boolean;  // ★ 신규
      }[];
    }[];
  }[];
}
```

### 3.2 `backend/packages/types/src/scoring.ts` (신규 파일)

```typescript
// 스코어링 결과
export interface ScoringResult {
  totalScore: number;
  grade: InspectionGrade;
  categoryScores: CategoryScore[];
  criticalFailures: string[];
  answerDistribution: AnswerDistribution;
  recommendation: string;
}

export type InspectionGrade = "S" | "A" | "B" | "C" | "D";

export interface CategoryScore {
  categoryNo: number;
  name: string;
  score: number;
  maxScore: number;
  weight: number;
  yesCount: number;
  noCount: number;
  naCount: number;
  applicableCount: number;
  totalCount: number;
  percentage: number;
}

export interface AnswerDistribution {
  yes: number;
  no: number;
  na: number;
  total: number;
}

// 필수 이행 항목 번호 (상수)
export const CRITICAL_ITEMS = ["2.1.1", "2.2.1", "3.2.2", "3.2.3", "3.3.1", "7.1.3"] as const;

// 카테고리별 기본 가중치 (%)
export const DEFAULT_CATEGORY_WEIGHTS: Record<number, number> = {
  1: 15,
  2: 20,
  3: 25,
  4: 10,
  5: 10,
  6: 10,
  7: 10,
};

// 등급 산정 기준
export const GRADE_THRESHOLDS = {
  S: 90,
  A: 80,
  B: 70,
  C: 60,
} as const;

// 등급별 후속 조치 권고
export const GRADE_RECOMMENDATIONS: Record<InspectionGrade, string> = {
  S: "차기 점검 주기 연장 가능 (12개월), 우수 수탁사 인정",
  A: "정기 점검 주기 유지 (6~12개월), 경미한 개선 권고",
  B: "3개월 내 미흡 항목 개선 계획 수립 및 이행 확인",
  C: "1개월 내 개선 계획 수립, 3개월 내 재점검 실시",
  D: "즉시 개선 조치 요구, 1개월 내 재점검, 위탁 계약 재검토",
};
```

### 3.3 `backend/packages/types/src/index.ts` 변경

```typescript
// 기존 export 유지
export * from "./events";
export * from "./api";
export * from "./auth";
export * from "./checklist";
export * from "./scoring";    // ★ 신규 추가
```

---

## 4. 백엔드 변경 사항

### 4.1 파일 구조 (변경/추가 목록)

```
backend/services/inspection/src/
├── services/
│   ├── scoring.service.ts                    # ★ 신규: 스코어링 엔진
│   ├── trustee-checklist.service.ts          # 수정: 스코어링 연동
│   └── checklist-response.service.ts         # 수정: 제출 시 자동 점수 산정
├── repositories/
│   └── trustee-checklist.repository.ts       # 수정: 스코어링 필드 업데이트
├── controllers/
│   ├── trustee-checklist.controller.ts       # 수정: score 엔드포인트 추가
│   └── checklist-response.controller.ts      # 수정: 제출 응답에 스코어 포함
├── routes/
│   └── trustee-checklist.routes.ts           # 수정: score 라우트 추가
├── validation.ts                             # 수정: weight, isCritical 스키마 추가
└── index.ts                                  # 수정: ScoringService DI 추가
```

### 4.2 스코어링 엔진

#### `backend/services/inspection/src/services/scoring.service.ts` (신규)

```typescript
import type {
  ScoringResult,
  CategoryScore,
  AnswerDistribution,
  InspectionGrade,
} from "@trustee/types";
import {
  CRITICAL_ITEMS,
  GRADE_THRESHOLDS,
  GRADE_RECOMMENDATIONS,
} from "@trustee/types";

// 체크리스트의 전체 트리 구조 (repository에서 include한 결과)
interface ChecklistWithItems {
  categories: {
    no: number;
    name: string;
    weight: number;
    sections: {
      items: {
        no: string;
        applicable: boolean;
        answer: "yes" | "no" | "not_applicable" | null;
        isCritical: boolean;
      }[];
    }[];
  }[];
}

export class ScoringService {
  calculate(checklist: ChecklistWithItems): ScoringResult {
    let totalScore = 0;
    let totalWeight = 0;
    const categoryScores: CategoryScore[] = [];
    const criticalFailures: string[] = [];
    const distribution: AnswerDistribution = { yes: 0, no: 0, na: 0, total: 0 };

    for (const category of checklist.categories) {
      const weight = category.weight;
      let yesCount = 0;
      let noCount = 0;
      let naCount = 0;
      let applicableCount = 0;
      let totalCount = 0;

      for (const section of category.sections) {
        for (const item of section.items) {
          totalCount++;
          distribution.total++;

          if (!item.applicable || item.answer === "not_applicable") {
            naCount++;
            distribution.na++;
            continue;
          }

          applicableCount++;

          if (item.answer === "yes") {
            yesCount++;
            distribution.yes++;
          } else {
            noCount++;
            distribution.no++;
          }

          // 필수 이행 항목 체크
          if (item.isCritical && item.answer !== "yes") {
            criticalFailures.push(item.no);
          }
        }
      }

      if (applicableCount === 0) {
        // 카테고리 전체 해당없음 -> 가중치 재분배 대상
        continue;
      }

      const categoryScore = weight * (yesCount / applicableCount);
      categoryScores.push({
        categoryNo: category.no,
        name: category.name,
        score: Math.round(categoryScore * 100) / 100,
        maxScore: weight,
        weight,
        yesCount,
        noCount,
        naCount,
        applicableCount,
        totalCount,
        percentage: Math.round((yesCount / applicableCount) * 10000) / 100,
      });

      totalScore += categoryScore;
      totalWeight += weight;
    }

    // 가중치 재분배 (해당없음 카테고리 제외 후 비례 조정)
    if (totalWeight > 0 && totalWeight < 100) {
      const adjustmentFactor = 100 / totalWeight;
      totalScore *= adjustmentFactor;
      for (const cs of categoryScores) {
        cs.score = Math.round(cs.score * adjustmentFactor * 100) / 100;
        cs.maxScore = Math.round(cs.maxScore * adjustmentFactor * 100) / 100;
      }
    }

    totalScore = Math.round(totalScore * 10) / 10;

    // 등급 산정
    let grade = this.calculateGrade(totalScore);

    // 필수 이행 항목 위반 시 등급 제한 (최고 B)
    if (criticalFailures.length > 0 && (grade === "S" || grade === "A")) {
      grade = "B";
    }

    return {
      totalScore,
      grade,
      categoryScores,
      criticalFailures,
      answerDistribution: distribution,
      recommendation: GRADE_RECOMMENDATIONS[grade],
    };
  }

  private calculateGrade(score: number): InspectionGrade {
    if (score >= GRADE_THRESHOLDS.S) return "S";
    if (score >= GRADE_THRESHOLDS.A) return "A";
    if (score >= GRADE_THRESHOLDS.B) return "B";
    if (score >= GRADE_THRESHOLDS.C) return "C";
    return "D";
  }
}
```

### 4.3 TrusteeChecklistService 변경

`backend/services/inspection/src/services/trustee-checklist.service.ts`에 다음을 추가:

```typescript
// 생성자에 ScoringService 추가
constructor(
  private repository: TrusteeChecklistRepository,
  private templateRepository: ChecklistTemplateRepository,
  private rabbitmq: RabbitMQClient | null,
  private scoringService: ScoringService       // ★ 신규
) {}

// 스코어링 메서드 추가
async score(id: string): Promise<ScoringResult> {
  const checklist = await this.repository.findById(id);
  if (!checklist) {
    throw new NotFoundError("TrusteeChecklist", id);
  }

  if (checklist.status !== "submitted" && checklist.status !== "reviewed") {
    throw new ValidationError("제출 또는 검토 상태의 체크리스트만 점수를 산정할 수 있습니다.");
  }

  const result = this.scoringService.calculate(checklist);

  // DB에 점수 저장
  await this.repository.update(id, {
    totalScore: result.totalScore,
    grade: result.grade,
    scoreDetail: result as unknown as Record<string, unknown>,
    scoredAt: new Date(),
  });

  return result;
}

// 통계 조회 메서드 추가
async getStats() {
  return this.repository.getStats();
}

// 최근 제출 조회 메서드 추가
async getRecentSubmitted(limit: number = 5) {
  return this.repository.findRecentSubmitted(limit);
}
```

### 4.4 ChecklistResponseService 변경

`backend/services/inspection/src/services/checklist-response.service.ts`의 `submit` 메서드에 자동 스코어링 추가:

```typescript
// 생성자에 ScoringService 추가
constructor(
  private repository: TrusteeChecklistRepository,
  private rabbitmq: RabbitMQClient | null,
  private storage: StorageProvider,
  private scoringService: ScoringService       // ★ 신규
) {}

async submit(token: string, dto: SubmitTrusteeChecklistInput) {
  const checklist = await this.getByToken(token);
  this.validateEditable(checklist);

  // 제출 처리
  const updated = await this.repository.update(checklist.id, {
    status: "submitted",
    submittedAt: new Date(),
    submissionCount: (checklist.submissionCount || 0) + 1,
    contactName: dto.contactName,
    contactEmail: dto.contactEmail || undefined,
    contactPhone: dto.contactPhone || undefined,
  });

  // ★ 자동 스코어링
  const scoreResult = this.scoringService.calculate(updated);
  await this.repository.update(checklist.id, {
    totalScore: scoreResult.totalScore,
    grade: scoreResult.grade,
    scoreDetail: scoreResult as unknown as Record<string, unknown>,
    scoredAt: new Date(),
  });

  await this.publishEvent(EVENT_ROUTING_KEYS.INSPECTION_CREATED, {
    type: "checklist.submitted",
    data: {
      id: checklist.id,
      trusteeId: checklist.trusteeId,
      contactName: dto.contactName,
      submissionCount: updated.submissionCount,
      totalScore: scoreResult.totalScore,
      grade: scoreResult.grade,
    },
  });

  // 스코어 포함 최신 데이터 반환
  return this.repository.findById(checklist.id);
}
```

### 4.5 TrusteeChecklistRepository 변경

`backend/services/inspection/src/repositories/trustee-checklist.repository.ts`에 추가:

```typescript
// update 메서드의 data 타입에 스코어링 필드 추가
async update(
  id: string,
  data: UpdateTrusteeChecklistInput & {
    submittedAt?: Date;
    submissionCount?: number;
    accessTokenExpiresAt?: Date;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    totalScore?: number;     // ★ 신규
    grade?: string;          // ★ 신규
    scoreDetail?: unknown;   // ★ 신규 (JSON)
    scoredAt?: Date;         // ★ 신규
  }
)

// createFromTemplate에서 weight, isCritical 스냅샷 복사
async createFromTemplate(params: { ... }) {
  // categories 생성 시 weight 포함
  categories: {
    create: params.template.categories.map((cat) => ({
      no: cat.no,
      name: cat.name,
      sortOrder: cat.sortOrder,
      weight: cat.weight || 0,  // ★ 신규
      sections: {
        create: cat.sections.map((sec) => ({
          // ...
          items: {
            create: sec.items.map((item) => ({
              // ...
              isCritical: item.isCritical || false,  // ★ 신규
            })),
          },
        })),
      },
    })),
  },
}

// ★ 신규: 통계 조회
async getStats() {
  const [total, submitted, reviewed, scores] = await Promise.all([
    prisma.trusteeChecklist.count(),
    prisma.trusteeChecklist.count({ where: { status: "submitted" } }),
    prisma.trusteeChecklist.count({ where: { status: "reviewed" } }),
    prisma.trusteeChecklist.aggregate({
      _avg: { totalScore: true },
      where: { totalScore: { not: null } },
    }),
  ]);

  return {
    total,
    submitted,
    reviewed,
    averageScore: scores._avg.totalScore
      ? Math.round(scores._avg.totalScore * 10) / 10
      : null,
  };
}

// ★ 신규: 최근 제출 목록
async findRecentSubmitted(limit: number) {
  return prisma.trusteeChecklist.findMany({
    where: {
      status: { in: ["submitted", "reviewed"] },
    },
    orderBy: { submittedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      trusteeId: true,
      status: true,
      totalScore: true,
      grade: true,
      submittedAt: true,
    },
  });
}

// findAll에서 목록 조회 시에도 totalScore, grade 포함
async findAll(params: { ... }) {
  const [data, total] = await Promise.all([
    prisma.trusteeChecklist.findMany({
      skip: params.skip,
      take: params.take,
      where: params.where,
      orderBy: { createdAt: "desc" },
      // ★ 기존에 없던 select/include가 없으므로 전체 필드 반환됨
      // totalScore, grade 등 새 필드는 자동으로 포함
    }),
    prisma.trusteeChecklist.count({ where: params.where }),
  ]);
  return { data, total };
}
```

### 4.6 Controller 변경

#### TrusteeChecklistController에 추가
```typescript
// backend/services/inspection/src/controllers/trustee-checklist.controller.ts

// 점수 산정 엔드포인트
score = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await this.service.score(req.params.id as string);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};

// 통계 조회 엔드포인트
stats = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await this.service.getStats();
    res.json({ data: stats });
  } catch (error) {
    next(error);
  }
};

// 최근 제출 조회 엔드포인트
recentSubmitted = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 5;
    const data = await this.service.getRecentSubmitted(limit);
    res.json({ data });
  } catch (error) {
    next(error);
  }
};
```

### 4.7 Routes 변경

#### TrusteeChecklist Routes에 추가
```typescript
// backend/services/inspection/src/routes/trustee-checklist.routes.ts

// 기존 라우트 유지 + 아래 추가
router.get("/stats/summary", controller.stats);              // ★ 신규
router.get("/recent/submitted", controller.recentSubmitted); // ★ 신규
router.post("/:id/score", controller.score);                 // ★ 신규
```

**주의**: `stats/summary`와 `recent/submitted`는 `/:id` 라우트보다 먼저 등록해야 한다.

### 4.8 Validation 변경

`backend/services/inspection/src/validation.ts`에 추가:

```typescript
// createChecklistTemplateSchema의 categories에 weight 추가
export const createChecklistTemplateSchema = z.object({
  title: z.string().min(1, "제목은 필수입니다"),
  version: z.string().optional(),
  description: z.string().optional(),
  categories: z.array(z.object({
    no: z.number(),
    name: z.string().min(1),
    weight: z.number().min(0).max(100).optional(),  // ★ 신규
    sections: z.array(z.object({
      no: z.string().min(1),
      name: z.string().min(1),
      items: z.array(z.object({
        no: z.string().min(1),
        question: z.string().min(1),
        hint: z.string().optional(),
        isCritical: z.boolean().optional(),  // ★ 신규
      })).min(1),
    })).min(1),
  })).min(1),
});
```

### 4.9 서비스 부트스트랩 변경

`backend/services/inspection/src/index.ts`:

```typescript
import { ScoringService } from "./services/scoring.service";

// ...

// Services
const scoringService = new ScoringService();  // ★ 신규

const trusteeChecklistService = new TrusteeChecklistService(
  trusteeChecklistRepository,
  checklistTemplateRepository,
  rabbitmq,
  scoringService  // ★ 신규 주입
);

const checklistResponseService = new ChecklistResponseService(
  trusteeChecklistRepository,
  rabbitmq,
  storageProvider,
  scoringService  // ★ 신규 주입
);
```

### 4.10 Gateway 변경

게이트웨이 프록시 설정은 변경 불필요. 기존 `/api/trustee-checklists` pathFilter가 하위 경로 (`/stats/summary`, `/recent/submitted`, `/:id/score`)를 모두 포워딩한다.

---

## 5. API 설계

### 5.1 신규 엔드포인트

| 메서드 | 경로 | 설명 | 요청 | 응답 |
|--------|------|------|------|------|
| GET | `/api/trustee-checklists/stats/summary` | 통계 요약 | - | `{ data: ChecklistStats }` |
| GET | `/api/trustee-checklists/recent/submitted` | 최근 제출 목록 | `?limit=5` | `{ data: RecentChecklist[] }` |
| POST | `/api/trustee-checklists/:id/score` | 점수 산정 | - | `{ data: ScoringResult }` |

### 5.2 응답 스키마

#### ChecklistStats
```typescript
interface ChecklistStats {
  total: number;          // 전체 체크리스트 수
  submitted: number;      // 제출완료 수
  reviewed: number;       // 검토완료 수
  averageScore: number | null;  // 평균 점수
}
```

#### RecentChecklist
```typescript
interface RecentChecklist {
  id: string;
  title: string;
  trusteeId: string;
  status: TrusteeChecklistStatus;
  totalScore: number | null;
  grade: string | null;
  submittedAt: Date | null;
}
```

### 5.3 기존 엔드포인트 응답 변경

| 경로 | 변경 내용 |
|------|----------|
| `GET /api/trustee-checklists` | 목록 각 항목에 `totalScore`, `grade` 필드 추가 |
| `GET /api/trustee-checklists/:id` | 상세에 `totalScore`, `grade`, `scoreDetail`, `scoredAt` 필드 추가 |
| `POST /api/checklist-response/:token/submit` | 제출 응답에 스코어링 결과 포함 |

---

## 6. 프론트엔드 변경 사항

### 6.1 파일 구조 (변경/추가 목록)

```
frontend/
├── packages/ui/src/
│   ├── theme/
│   │   └── tokens.ts                          # 수정: inspectionColors 추가
│   ├── components/
│   │   └── GradeBadge.tsx                     # ★ 신규
│   └── index.ts                               # 수정: 신규 export 추가
│
└── web/src/
    ├── lib/
    │   ├── api/
    │   │   └── trustee-checklists.ts          # 수정: 신규 API 추가
    │   └── inspection-utils.ts                # ★ 신규: 등급 유틸리티
    ├── hooks/
    │   └── useTrusteeChecklists.ts            # 수정: 신규 훅 추가
    ├── components/
    │   ├── ScorePanel.tsx                     # ★ 신규
    │   ├── InspectionRadarChart.tsx            # ★ 신규
    │   ├── ChecklistProgressBar.tsx            # ★ 신규
    │   ├── InspectionStatusChip.tsx            # ★ 신규
    │   └── DeficientItemsPanel.tsx             # ★ 신규: 미흡 항목 패널
    └── app/(dashboard)/inspections/
        ├── page.tsx                            # 수정: 대시보드로 전환
        ├── checklists/
        │   ├── page.tsx                       # 수정: 점수/등급/진행률 추가
        │   └── [id]/
        │       └── page.tsx                   # 수정: ScorePanel, RadarChart 추가
```

### 6.2 @trustee/ui 변경

#### 6.2.1 `frontend/packages/ui/src/theme/tokens.ts` 변경

기존 `tokens.ts` 파일 끝에 `inspectionColors` 추가 (디자인 시스템 가이드 1-1 참조):

```typescript
export const inspectionColors = {
  grade: {
    aPlus: { bg: "#27a64418", border: "#27a64433", text: "#27a644", label: "A+" },
    a:     { bg: "#4ea7fc18", border: "#4ea7fc33", text: "#4ea7fc", label: "A" },
    bPlus: { bg: "#00b8cc18", border: "#00b8cc33", text: "#00b8cc", label: "B+" },
    b:     { bg: "#f0bf0018", border: "#f0bf0033", text: "#f0bf00", label: "B" },
    c:     { bg: "#fc784018", border: "#fc784033", text: "#fc7840", label: "C" },
    d:     { bg: "#eb575718", border: "#eb575733", text: "#eb5757", label: "D" },
  },
  answer: {
    yes: { bg: "#27a64412", border: "#27a644", text: "#27a644" },
    no:  { bg: "#fc784012", border: "#fc7840", text: "#fc7840" },
    na:  { bg: "#62666d12", border: "#62666d", text: "#62666d" },
  },
  status: {
    draft:       { bg: "#62666d18", text: "#8a8f98", label: "초안" },
    sent:        { bg: "#4ea7fc18", text: "#4ea7fc", label: "전달됨" },
    in_progress: { bg: "#f0bf0018", text: "#f0bf00", label: "작성중" },
    submitted:   { bg: "#5e6ad218", text: "#7170ff", label: "제출완료" },
    reviewed:    { bg: "#27a64418", text: "#27a644", label: "검토완료" },
  },
} as const;
```

#### 6.2.2 `frontend/packages/ui/src/components/GradeBadge.tsx` (신규)

디자인 시스템 가이드 2-1 참조. UI 등급 매핑은 스코어링 모델의 S/A/B/C/D 5등급을 UI 표시용 A+/A/B+/B/C/D 6등급으로 변환:

| 백엔드 등급 | 점수 범위 | UI 표시 |
|------------|----------|---------|
| S | 95-100 | A+ |
| S | 90-94 | A |
| A | 80-89 | B+ |
| B | 70-79 | B |
| C | 60-69 | C |
| D | 60 미만 | D |

```typescript
"use client";

import Box from "@mui/material/Box";
import { inspectionColors } from "../theme/tokens";

export type UIGrade = "A+" | "A" | "B+" | "B" | "C" | "D";

export interface GradeBadgeProps {
  grade: UIGrade;
  size?: "sm" | "md" | "lg";
}

const KEY_MAP: Record<UIGrade, keyof typeof inspectionColors.grade> = {
  "A+": "aPlus", "A": "a", "B+": "bPlus", "B": "b", "C": "c", "D": "d",
};

const SIZE_MAP = {
  sm: { px: 1, py: 0.25, fontSize: "0.6875rem", minWidth: 28 },
  md: { px: 1.25, py: 0.375, fontSize: "0.75rem", minWidth: 36 },
  lg: { px: 2, py: 0.75, fontSize: "0.9375rem", minWidth: 48 },
};

export function GradeBadge({ grade, size = "md" }: GradeBadgeProps) {
  const colors = inspectionColors.grade[KEY_MAP[grade]];
  const s = SIZE_MAP[size];

  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        px: s.px,
        py: s.py,
        borderRadius: "6px",
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.bg,
        fontWeight: 600,
        color: colors.text,
        fontSize: s.fontSize,
        letterSpacing: "0.05em",
        minWidth: s.minWidth,
      }}
    >
      {grade}
    </Box>
  );
}
```

#### 6.2.3 `frontend/packages/ui/src/index.ts` 변경

```typescript
// Theme 섹션에 추가
export { colors, typography, radius, shadows, spacing, animation, focusRing, inspectionColors } from "./theme/tokens";

// Components 섹션에 추가
export { GradeBadge, type GradeBadgeProps, type UIGrade } from "./components/GradeBadge";
```

### 6.3 프론트엔드 유틸리티

#### `frontend/web/src/lib/inspection-utils.ts` (신규)

```typescript
import type { UIGrade } from "@trustee/ui";
import type { InspectionGrade } from "@trustee/types";

/**
 * 백엔드 등급(S/A/B/C/D) + 점수를 UI 표시용 등급으로 변환
 */
export function toUIGrade(grade: InspectionGrade, score: number): UIGrade {
  if (grade === "S" && score >= 95) return "A+";
  if (grade === "S") return "A";
  if (grade === "A") return "B+";
  if (grade === "B") return "B";
  if (grade === "C") return "C";
  return "D";
}

/**
 * 점수에서 직접 UI 등급 변환
 */
export function scoreToUIGrade(score: number): UIGrade {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 80) return "B+";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}
```

### 6.4 API 클라이언트 변경

#### `frontend/web/src/lib/api/trustee-checklists.ts` 변경

```typescript
// 기존 API 유지 + 아래 추가

import type { ScoringResult } from "@trustee/types";

interface ChecklistStats {
  total: number;
  submitted: number;
  reviewed: number;
  averageScore: number | null;
}

interface RecentChecklist {
  id: string;
  title: string;
  trusteeId: string;
  status: string;
  totalScore: number | null;
  grade: string | null;
  submittedAt: string | null;
}

export const trusteeChecklistsApi = {
  // ... 기존 메서드 유지 ...

  // ★ 신규
  stats(): Promise<{ data: ChecklistStats }> {
    return apiClient.get("/api/trustee-checklists/stats/summary");
  },

  recentSubmitted(limit?: number): Promise<{ data: RecentChecklist[] }> {
    return apiClient.get("/api/trustee-checklists/recent/submitted", { limit });
  },

  score(id: string): Promise<{ data: ScoringResult }> {
    return apiClient.post(`/api/trustee-checklists/${id}/score`);
  },
};
```

### 6.5 React Query 훅 변경

#### `frontend/web/src/hooks/useTrusteeChecklists.ts` 변경

```typescript
// 기존 훅 유지 + 아래 추가

export function useChecklistStats() {
  return useQuery({
    queryKey: [...CHECKLISTS_KEY, "stats"],
    queryFn: () => trusteeChecklistsApi.stats(),
  });
}

export function useRecentSubmitted(limit?: number) {
  return useQuery({
    queryKey: [...CHECKLISTS_KEY, "recent", limit],
    queryFn: () => trusteeChecklistsApi.recentSubmitted(limit),
  });
}

export function useScoreChecklist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => trusteeChecklistsApi.score(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });
    },
  });
}
```

#### `frontend/web/src/hooks/index.ts` 변경

```typescript
// 기존 export에 추가
export {
  // ... 기존 ...
  useChecklistStats,
  useRecentSubmitted,
  useScoreChecklist,
} from "./useTrusteeChecklists";
```

### 6.6 페이지 변경 상세

#### 6.6.1 점검 메인 대시보드 (`/inspections/page.tsx`)

**현재**: 카드 2개만 있는 단순 허브 페이지
**변경**: 통계 + 최근 제출 + 빠른 이동 대시보드

```
레이아웃 구조:
┌─ PageHeader ────────────────────────────┐
├─ StatCard x4 (총 체크리스트/제출완료/검토완료/평균점수) ─┤
├─ 최근 제출 체크리스트 DataTable ─────────┤
├─ 빠른 이동 카드 x2 (기존 유지) ──────────┤
└─────────────────────────────────────────┘
```

사용할 훅:
- `useChecklistStats()` - StatCard 데이터
- `useRecentSubmitted(5)` - 최근 제출 테이블

사용할 컴포넌트:
- `StatCard` (기존 @trustee/ui)
- `GradeBadge` (신규 @trustee/ui)
- `DataTable` (기존 @trustee/ui)
- `InspectionStatusChip` (신규 웹 컴포넌트)

#### 6.6.2 체크리스트 목록 (`/inspections/checklists/page.tsx`)

**현재**: 상태/작성자/기한만 표시
**변경**: 점수/등급 컬럼 추가, 작성중 상태 진행률 표시

DataTable 컬럼 변경:
| 기존 컬럼 | 변경/추가 |
|----------|----------|
| No | 유지 |
| 제목 | 유지 |
| 상태 | `InspectionStatusChip` 사용으로 변경 |
| **점수/등급** | **★ 신규: totalScore + GradeBadge 또는 ChecklistProgressBar** |
| 작성 기한 | 유지 |
| 제출 | 유지 |
| 생성일 | 유지 |
| 제출일 | 유지 |

점수/등급 컬럼 렌더링 로직:
```tsx
{
  id: "score",
  label: "점수/등급",
  minWidth: 140,
  render: (row) => {
    // 제출/검토완료 상태이고 점수가 있으면 점수+등급 표시
    if (row.totalScore != null && row.grade) {
      const uiGrade = scoreToUIGrade(row.totalScore);
      return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="body2">{row.totalScore}점</Typography>
          <GradeBadge grade={uiGrade} size="sm" />
        </Box>
      );
    }
    // 작성중 상태이면 진행률 표시
    if (row.status === "in_progress") {
      const { completed, total } = calculateProgress(row);
      return <ChecklistProgressBar completed={completed} total={total} />;
    }
    return <Typography variant="body2" color="text.disabled">-</Typography>;
  },
}
```

#### 6.6.3 체크리스트 상세 (`/inspections/checklists/[id]/page.tsx`)

**현재**: 토큰 링크 + 기한 + 작성자 정보 + 아코디언 테이블
**변경**: ScorePanel + RadarChart 추가, 미흡 항목 패널 추가

```
레이아웃 구조:
┌─ PageHeader (기존 유지) ────────────────┐
├─ 2컬럼: ScorePanel | RadarChart ────────┤ ★ 신규 (submitted/reviewed만)
├─ 토큰 링크 (기존 유지) ────────────────┤
├─ 기한 정보 (기존 유지) ────────────────┤
├─ 작성자 정보 (기존 유지) ──────────────┤
├─ DeficientItemsPanel (미흡 항목) ──────┤ ★ 신규 (submitted/reviewed만)
├─ 카테고리별 아코디언 (기존 유지, 요약 추가) ┤
└─────────────────────────────────────────┘
```

ScorePanel/RadarChart 표시 조건: `checklist.status === "submitted" || checklist.status === "reviewed"`

```tsx
{(checklist.status === "submitted" || checklist.status === "reviewed") &&
 checklist.scoreDetail && (
  <Box
    sx={{
      display: "grid",
      gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
      gap: 3,
      mb: 3,
    }}
  >
    <ScorePanel
      score={checklist.totalScore ?? 0}
      distribution={checklist.scoreDetail.answerDistribution}
    />
    <InspectionRadarChart
      data={checklist.scoreDetail.categoryScores.map((cs) => ({
        category: cs.name,
        current: cs.percentage,
      }))}
    />
  </Box>
)}
```

아코디언 헤더에 적합/미흡 요약 추가:
```tsx
<AccordionSummary expandIcon={<ExpandMoreIcon />}>
  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
    <Chip label={`${category.no}`} size="small" color="primary" />
    <Typography fontWeight={600}>{category.name}</Typography>
    <Typography variant="body2" color="text.secondary">
      ({totalItems}개 항목)
    </Typography>
    {/* ★ 신규: 적합/미흡 요약 */}
    {hasAnswers && (
      <>
        <Chip label={`적합: ${yesCount}`} size="small" sx={{ bgcolor: "#27a64420", color: "#27a644" }} />
        <Chip label={`미흡: ${noCount}`} size="small" sx={{ bgcolor: "#fc784020", color: "#fc7840" }} />
      </>
    )}
  </Box>
</AccordionSummary>
```

### 6.7 신규 웹 컴포넌트

| 파일 | 설명 | 사용처 |
|------|------|--------|
| `components/ScorePanel.tsx` | 종합 점수/등급/답변 분포 | 상세 페이지 |
| `components/InspectionRadarChart.tsx` | 카테고리별 레이더 차트 | 상세 페이지 |
| `components/ChecklistProgressBar.tsx` | 진행률 바 | 목록 페이지 |
| `components/InspectionStatusChip.tsx` | 상태 Chip | 목록/상세 페이지 |
| `components/DeficientItemsPanel.tsx` | 미흡(no) 항목 모음 | 상세 페이지 |

각 컴포넌트의 구현 코드는 디자인 시스템 가이드의 2-2 ~ 2-5를 참조한다.

#### DeficientItemsPanel (신규)

```tsx
"use client";

import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import { Box, Paper } from "@trustee/ui";
import { colors } from "@trustee/ui";
import type { TrusteeChecklistCategory } from "@trustee/types";

interface DeficientItem {
  no: string;
  question: string;
  currentStatus?: string;
  remarks?: string;
  isCritical: boolean;
  categoryName: string;
}

interface DeficientItemsPanelProps {
  categories: TrusteeChecklistCategory[];
}

export function DeficientItemsPanel({ categories }: DeficientItemsPanelProps) {
  const deficientItems: DeficientItem[] = [];

  for (const cat of categories) {
    for (const sec of cat.sections) {
      for (const item of sec.items) {
        if (item.applicable && item.answer === "no") {
          deficientItems.push({
            no: item.no,
            question: item.question,
            currentStatus: item.currentStatus,
            remarks: item.remarks,
            isCritical: item.isCritical,
            categoryName: cat.name,
          });
        }
      }
    }
  }

  if (deficientItems.length === 0) return null;

  return (
    <Accordion defaultExpanded sx={{ mb: 3 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WarningAmberIcon sx={{ color: "#fc7840" }} />
          <Typography fontWeight={600}>미흡 항목</Typography>
          <Chip label={`${deficientItems.length}건`} size="small" color="warning" />
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {deficientItems.map((item) => (
          <Paper
            key={item.no}
            variant="outlined"
            sx={{
              p: 2,
              mb: 1,
              borderLeft: `3px solid ${item.isCritical ? "#eb5757" : "#fc7840"}`,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 0.5 }}>
              <Chip label={item.no} size="small" variant="outlined" />
              {item.isCritical && (
                <Chip label="필수" size="small" color="error" />
              )}
              <Typography variant="body2" fontWeight={500}>{item.question}</Typography>
            </Box>
            {item.currentStatus && (
              <Typography variant="caption" color="text.secondary">
                현황: {item.currentStatus}
              </Typography>
            )}
            {item.remarks && (
              <Typography variant="caption" color="text.secondary" display="block">
                비고: {item.remarks}
              </Typography>
            )}
          </Paper>
        ))}
      </AccordionDetails>
    </Accordion>
  );
}
```

### 6.8 외부 라이브러리 추가

```bash
pnpm add recharts --filter @trustee/web
```

---

## 7. 스코어링 엔진 상세 설계

### 7.1 점수 산정 흐름

```
수탁사 체크리스트 제출
  │
  ├── ChecklistResponseService.submit()
  │     ├── 1. 상태 → submitted
  │     ├── 2. ScoringService.calculate()
  │     │     ├── 카테고리별 이행률 계산
  │     │     ├── 가중치 적용
  │     │     ├── 해당없음 카테고리 가중치 재분배
  │     │     ├── 필수 이행 항목 위반 체크
  │     │     └── 등급 산정
  │     └── 3. DB 저장 (totalScore, grade, scoreDetail)
  │
  └── 관리자 수동 재산정 (POST /score)
        └── TrusteeChecklistService.score()
              └── ScoringService.calculate() → DB 저장
```

### 7.2 점수 산정 공식

```
카테고리 점수 = 카테고리_가중치(%) × (이행_항목수 ÷ 적용가능_항목수)

총점 = Σ(카테고리별 점수)

가중치 재분배:
  전체 해당없음 카테고리 제외 후 남은 가중치 합이 < 100인 경우
  조정계수 = 100 ÷ 남은_가중치_합
  총점 × 조정계수
```

### 7.3 등급 산정

```
S: 90점 이상
A: 80~89점
B: 70~79점
C: 60~69점
D: 60점 미만

필수 이행 항목 미이행 시: S/A → B로 제한
```

### 7.4 필수 이행 항목

| 항목 No | 항목명 | 법적 근거 |
|---------|--------|----------|
| 2.1.1 | 내부관리계획 수립 | 안전성 확보조치 기준 제4조 |
| 2.2.1 | 개인정보 보호책임자 지정 | 개인정보보호법 제31조 |
| 3.2.2 | 고유식별정보 암호화 | 안전성 확보조치 기준 제7조 |
| 3.2.3 | 전송구간 암호화 | 안전성 확보조치 기준 제7조 |
| 3.3.1 | 접속기록 보관 | 안전성 확보조치 기준 제8조 |
| 7.1.3 | 유출 시 위탁자 통지 절차 | 개인정보보호법 제34조 |

---

## 8. 진행률 계산 로직

목록 페이지에서 `in_progress` 상태의 체크리스트 진행률을 표시하기 위해, 프론트엔드에서 계산한다.

```typescript
function calculateProgress(checklist: TrusteeChecklist): { completed: number; total: number } {
  let completed = 0;
  let total = 0;

  for (const category of checklist.categories || []) {
    for (const section of category.sections || []) {
      for (const item of section.items || []) {
        total++;
        // 답변이 있거나 미적용(applicable=false)이면 완료로 간주
        if (item.answer != null || !item.applicable) {
          completed++;
        }
      }
    }
  }

  return { completed, total };
}
```

**주의**: 목록 API 응답에는 categories가 포함되지 않으므로(현재 findAll에 include 없음), 진행률 표시를 위해 두 가지 방안이 있다:

**방안 A (권장)**: 서버에서 진행률 계산하여 `answeredCount`, `totalItemCount` 필드를 목록 응답에 추가
```typescript
// Repository의 findAll에 virtual field로 추가
async findAll(params: { ... }) {
  const data = await prisma.trusteeChecklist.findMany({
    // ... 기존 ...
    include: {
      _count: {
        select: {
          categories: true,  // 실질적 도움 안됨
        },
      },
    },
  });

  // 또는 raw query로 answeredCount 계산
}
```

**방안 B**: 목록 페이지에서 진행률 컬럼 대신 상태만 표시하고, 상세 페이지에서만 진행률 표시

**최종 결정**: 방안 A를 채택하되, `TrusteeChecklist` 모델에 `answeredCount`와 `totalItemCount` 컬럼을 추가한다.

```prisma
model TrusteeChecklist {
  // ... 기존 필드 ...

  // ★ 신규: 진행률 캐시
  totalItemCount   Int  @default(0) @map("total_item_count")
  answeredCount    Int  @default(0) @map("answered_count")
}
```

이 값은:
- 체크리스트 생성 시 `totalItemCount` 초기화
- 항목 답변 저장 시 `answeredCount` 갱신 (batch update 후 카운트 쿼리)

---

## 9. 구현 순서 및 우선순위

### Phase 2-1: 백엔드 기반 (우선순위: 높음)
1. **Prisma 스키마 변경** - 새 필드 추가, db push
2. **공유 타입 추가** - `scoring.ts`, `checklist.ts` 필드 추가
3. **ScoringService 구현** - 스코어링 엔진
4. **Repository 변경** - 스코어링 필드 저장, stats/recent 쿼리
5. **Service 변경** - TrusteeChecklistService, ChecklistResponseService
6. **Controller/Routes 변경** - 새 엔드포인트
7. **Validation 변경** - weight, isCritical 스키마

### Phase 2-2: UI 기반 (우선순위: 높음)
1. **tokens.ts 확장** - `inspectionColors` 추가
2. **GradeBadge 컴포넌트** - @trustee/ui
3. **inspection-utils.ts** - 등급 변환 유틸리티

### Phase 2-3: 프론트엔드 페이지 (우선순위: 중간)
1. **API 클라이언트 변경** - 새 API 메서드
2. **React Query 훅 변경** - 새 훅
3. **recharts 설치**
4. **웹 컴포넌트 구현** - ScorePanel, RadarChart, ProgressBar, StatusChip, DeficientItemsPanel
5. **점검 메인 대시보드** - 페이지 전환
6. **체크리스트 목록** - 점수/등급/진행률 추가
7. **체크리스트 상세** - ScorePanel, RadarChart, 미흡항목 패널

### Phase 2-4: 검증 (우선순위: 중간)
1. TypeScript 에러 확인
2. ESLint 통과
3. 브라우저 콘솔 에러 확인
4. 스코어링 로직 검증 (edge case)

---

## 10. 주의사항

### 10.1 하위 호환성
- 모든 신규 DB 컬럼은 nullable이거나 기본값이 있어 기존 데이터 영향 없음
- 기존 API 응답에 필드가 추가될 뿐 제거되지 않음
- 기존 프론트엔드 기능은 모두 보존됨

### 10.2 성능 고려
- 스코어링은 서버 사이드에서만 수행 (클라이언트 조작 방지)
- `scoreDetail`은 JSON 필드로 저장하여 별도 테이블 조회 없이 한 번에 로드
- 목록 조회 시 include 없이 `totalScore`, `grade` 직접 접근
- `answeredCount`/`totalItemCount` 캐시로 목록 진행률 계산 쿼리 최소화

### 10.3 보안
- 스코어링 API는 관리자 전용 (`POST /api/trustee-checklists/:id/score`)
- 수탁사 응답 제출 시 자동 스코어링은 서버에서만 수행
- `scoreDetail`에 민감 정보 없음 (통계 데이터만 포함)

### 10.4 UI/UX
- 스코어가 없는 체크리스트(draft, sent, in_progress)에서는 ScorePanel/RadarChart 미표시
- 등급 색상은 `inspectionColors.grade` 토큰으로 통일
- 상태 표시는 `inspectionColors.status` 토큰으로 통일
- 반응형: 2컬럼 레이아웃은 `md` 브레이크포인트 이하에서 1컬럼으로 전환
