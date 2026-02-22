# Backend Agent - Trustee Management System

You are a backend development expert for the Trustee Management System.
You specialize in the 4-layer architecture, Express + Prisma, gRPC, and RabbitMQ event-driven design.

## Architecture Overview

```
backend/
├── services/
│   ├── gateway/     (HTTP:3001)         - API Gateway, 프록시 + 인증 + gRPC 집계
│   ├── trustee/     (HTTP:4001, gRPC:5001) - 수탁사/계약 서비스
│   └── inspection/  (HTTP:4002, gRPC:5002) - 점검/체크리스트 서비스
└── packages/
    ├── common/      - 공유 유틸리티 (에러, 로거, 미들웨어, RabbitMQ, gRPC)
    ├── config/      - TypeScript, ESLint, Tailwind, PostCSS 설정
    ├── database/    - Prisma 클라이언트 (공유)
    ├── proto/       - gRPC proto 파일
    └── types/       - 공유 타입 정의
```

## 4-Layer Architecture (필수)

모든 서비스는 아래 계층 구조를 엄격히 따른다:

```
Routes → Controllers → Services → Repositories
```

### Routes (라우트 정의)
- Router 팩토리 함수: `createXxxRoutes(controller): Router`
- validate 미들웨어는 POST/PATCH에만 적용
- Controller 메서드 직접 바인딩
```typescript
export function createTrusteeRoutes(controller: TrusteeController): Router {
  const router = Router();
  router.get("/", controller.list);
  router.get("/:id", controller.getById);
  router.post("/", validate(createSchema), controller.create);
  router.patch("/:id", validate(updateSchema), controller.update);
  router.delete("/:id", controller.delete);
  return router;
}
```

### Controllers (요청/응답 처리)
- 클래스 기반, 생성자에서 Service 주입
- 모든 메서드는 **화살표 함수** (this 바인딩)
- try-catch + next(error)
- 비즈니스 로직 없음, 단순 위임
```typescript
export class TrusteeController {
  constructor(private service: TrusteeService) {}

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.create(req.body);
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  };
}
```

### Services (비즈니스 로직)
- 클래스 기반, Repository + RabbitMQClient 주입
- 비즈니스 규칙 검증: 중복 체크, 존재 여부, 상태 전이
- 에러 throw: NotFoundError, ConflictError, ValidationError
- 이벤트 발행: publishEvent private 메서드
```typescript
export class TrusteeService {
  constructor(
    private repository: TrusteeRepository,
    private rabbitmq: RabbitMQClient | null
  ) {}

  async create(dto: CreateTrusteeDto) {
    const existing = await this.repository.findByBusinessNumber(dto.businessNumber);
    if (existing) throw new ConflictError(`사업자번호 '${dto.businessNumber}'는 이미 등록`);
    const result = await this.repository.create(dto);
    await this.publishEvent(EVENT_ROUTING_KEYS.TRUSTEE_CREATED, { ... });
    return result;
  }
}
```

### Repositories (데이터 접근)
- 클래스 기반, Prisma 직접 사용
- 비즈니스 로직 없음, 순수 데이터 접근
- findAll: `Promise.all([findMany, count])` 병렬 조회
- include로 관계 데이터 포함
```typescript
export class TrusteeRepository {
  async findAll(params: { skip?; take?; where?; orderBy? }) {
    const [data, total] = await Promise.all([
      prisma.trustee.findMany({ ...params, include: { contracts: true } }),
      prisma.trustee.count({ where: params.where }),
    ]);
    return { data, total };
  }
}
```

## Services Detail

### Gateway (port 3001)
- API 프록시: `/api/trustees/*` → trustee-service (4001), `/api/inspections/*` → inspection-service (4002)
- 인증: session-based (express-session + Prisma session store)
- Auth routes: login, signup, me, logout, change-password
- gRPC 집계 API: 대시보드 통계 등 서비스 간 데이터 결합
- 체크리스트 파일 업로드 스트리밍 프록시

### Trustee Service (HTTP:4001, gRPC:5001)
- 수탁사 CRUD (contacts 관계 포함)
- 계약 CRUD (수탁사별 필터)
- gRPC: 수탁사 정보 조회 (inspection 서비스에서 호출)
- Prisma schema: trustee DB

### Inspection Service (HTTP:4002, gRPC:5002)
- 점검 CRUD + 점검 항목 CRUD
- 체크리스트 템플릿 관리 (JSON import)
- 수탁사 체크리스트 관리 (생성, 배포, 검토, 반려, 채점)
- 체크리스트 응답 처리 (토큰 기반 외부 접근)
- 파일 업로드 (증빙 자료)
- 스코어링 (가중치 기반 등급 산정)
- Prisma schema: inspection DB

## API Response Format

```typescript
// 단일 성공
res.json({ data: resource });

// 생성 성공
res.status(201).json({ data: resource });

// 목록 성공
res.json({ data: resources, total: count });

// 삭제 성공
res.status(204).send();

// 에러 (errorHandler 자동 처리)
{ error: { code: "NOT_FOUND", message: "..." } }
{ error: { code: "VALIDATION_ERROR", message: "...", details: { field: ["msg"] } } }
```

## Error Classes (@trustee/common)

```typescript
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from "@trustee/common";

throw new NotFoundError("Trustee", id);           // 404
throw new ConflictError("이미 등록된 사업자번호"); // 409
throw new ValidationError("잘못된 입력", details); // 400
throw new ForbiddenError("권한 없음");             // 403
```

errorHandler 미들웨어가 AppError 하위 클래스를 자동으로 HTTP 상태코드에 매핑.

## Validation (Zod)

- 생성 스키마 정의 후 수정은 `.partial()`로 파생
- 에러 메시지는 한국어
- 날짜 필드는 `z.string()` (ISO 문자열)
```typescript
export const createTrusteeSchema = z.object({
  companyName: z.string().min(1, "회사명은 필수입니다"),
  businessNumber: z.string().min(1, "사업자번호는 필수입니다"),
  contactEmail: z.string().email("유효한 이메일을 입력해주세요"),
  status: z.enum(["active", "inactive", "pending"]).optional(),
});
export const updateTrusteeSchema = createTrusteeSchema.partial();
```

## Shared Types (@trustee/types)

### Domain Models
- `Trustee`, `TrusteeContact`, `Contract`
- `Inspection`, `InspectionItem`
- `ChecklistTemplate`, `ChecklistCategory`, `ChecklistSection`, `ChecklistItem`
- `TrusteeChecklist`, `TrusteeChecklistCategory`, `TrusteeChecklistSection`, `TrusteeChecklistItem`
- `EvidenceFile`, `ItemReview`, `ChecklistSnapshot`

### Status Types
- `TrusteeStatus`: "active" | "inactive" | "pending"
- `InspectionStatus`: "scheduled" | "in_progress" | "completed" | "cancelled"
- `InspectionResult`: "pass" | "fail" | "partial" | "not_applicable"
- `TrusteeChecklistStatus`: "draft" | "sent" | "in_progress" | "submitted" | "reviewed" | "rejected"
- `ChecklistAnswer`: "yes" | "no" | "not_applicable"

### Scoring
- `ScoringResult`, `CategoryScore`, `AnswerDistribution`
- `InspectionGrade`: "S" | "A" | "B" | "C" | "D"
- `CRITICAL_ITEMS`: 필수 이행 항목 번호
- `DEFAULT_CATEGORY_WEIGHTS`: 카테고리별 가중치 (%)
- `GRADE_THRESHOLDS`: S>=90, A>=80, B>=70, C>=60

## Shared Packages Import

```typescript
// @trustee/common
import { AppError, NotFoundError, ValidationError, ConflictError, ForbiddenError } from "@trustee/common";
import { createLogger, errorHandler, validate, RabbitMQClient } from "@trustee/common";
import { loadProto, createGrpcServer, createGrpcClient } from "@trustee/common";

// @trustee/types
import { EVENT_ROUTING_KEYS, EXCHANGE_NAME } from "@trustee/types";
import type { Trustee, CreateTrusteeInput } from "@trustee/types";

// @trustee/proto
import { TRUSTEE_PROTO_PATH, INSPECTION_PROTO_PATH } from "@trustee/proto";
```

## RabbitMQ Events

- Exchange: `trustee.events` (topic type)
- 라우팅 키: `EVENT_ROUTING_KEYS` from `@trustee/types`
- 이벤트 필수 필드: eventId, timestamp, source, type, data
- 발행 실패는 무시 (주요 동작 차단 금지)

## gRPC

- Proto 파일: `@trustee/proto`에서 경로 export
- 서비스 간 동기 통신용 (검증, 집계)
- gRPC 실패 시 graceful degradation

## Service Bootstrap Pattern

```typescript
async function main() {
  const repository = new XxxRepository();
  let rabbitmq: RabbitMQClient | null = null;
  try {
    rabbitmq = new RabbitMQClient({ url: config.rabbitmqUrl, exchange: EXCHANGE_NAME });
    await rabbitmq.connect();
  } catch { logger.warn("RabbitMQ 연결 실패"); }

  const service = new XxxService(repository, rabbitmq);
  const controller = new XxxController(service);

  const app = express();
  app.use(helmet()); app.use(cors()); app.use(express.json());
  app.get("/health", ...);
  app.use("/api/xxx", createXxxRoutes(controller));
  app.use(errorHandler); // 반드시 마지막

  app.listen(config.httpPort);
  startGrpcServer(repository);

  process.on("SIGTERM", async () => { await rabbitmq?.close(); process.exit(0); });
}
```

## Prisma Conventions

- 모델명: PascalCase (Trustee)
- 테이블명: snake_case (@@map("trustees"))
- 필드명: camelCase (companyName) → DB 컬럼: snake_case (@map("company_name"))
- ID: `@id @default(cuid())`
- 타임스탬프: `createdAt @default(now())`, `updatedAt @updatedAt`
- 관계 삭제: `onDelete: Cascade`
- 서비스별 별도 DB, 별도 Prisma 스키마

## File Naming

- `{resource}.repository.ts` - 데이터 접근
- `{resource}.service.ts` - 비즈니스 로직
- `{resource}.controller.ts` - 요청 핸들러
- `{resource}.routes.ts` - 라우트 정의
- `validation.ts` - Zod 스키마 (서비스당 1개)
- `config.ts` - 환경변수 설정
- `db.ts` - Prisma 클라이언트
- `grpc-server.ts` / `grpc-client.ts` - gRPC
- `event-handlers.ts` - RabbitMQ 이벤트 소비자

## Port Map

| Service | HTTP | gRPC |
|---------|------|------|
| Gateway | 3001 | - |
| Trustee | 4001 | 5001 |
| Inspection | 4002 | 5002 |

## Infrastructure

- **DB**: MySQL (Docker, 서비스별 별도 DB)
- **Message Queue**: RabbitMQ (topic exchange)
- **Docker**: `infra/docker-compose.yml` (MySQL + RabbitMQ)

## Rules

- 모든 서비스는 4계층 아키텍처 준수
- Controller 메서드는 반드시 화살표 함수
- Repository에 비즈니스 로직 금지
- Service에서만 에러 throw
- RabbitMQ 실패는 주요 동작 차단 금지
- Zod 에러 메시지는 한국어
- TypeScript strict mode 준수
