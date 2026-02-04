# Backend Services Rules

## 아키텍처
```
services/
├── gateway/     (포트 3001) - API Gateway, 프록시 + gRPC 집계
├── trustee/     (HTTP:4001, gRPC:5001) - 수탁사/계약 서비스
└── inspection/  (HTTP:4002, gRPC:5002) - 점검/평가 서비스
```

## 4계층 아키텍처 (필수)
모든 서비스는 `Routes → Controllers → Services → Repositories` 구조를 따른다.

### Routes (라우트 정의)
- Router 팩토리 함수로 생성
- validate 미들웨어는 POST/PATCH에만 적용
- Controller 메서드를 직접 바인딩
```typescript
import { Router } from "express";
import { validate } from "@trustee/common";

export function createTrusteeRoutes(controller: TrusteeController): Router {
  const router = Router();
  router.get("/", controller.list);
  router.get("/:id", controller.getById);
  router.post("/", validate(createTrusteeSchema), controller.create);
  router.patch("/:id", validate(updateTrusteeSchema), controller.update);
  router.delete("/:id", controller.delete);
  return router;
}
```

### Controllers (요청/응답 처리)
- 클래스 기반, 생성자에서 Service 주입
- 모든 메서드는 화살표 함수 (`this` 바인딩)
- try-catch로 감싸서 `next(error)` 호출
- 비즈니스 로직 없음, 단순 위임
```typescript
export class TrusteeController {
  constructor(private service: TrusteeService) {}

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const trustee = await this.service.create(req.body);
      res.status(201).json({ data: trustee });
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.service.delete(req.params.id as string);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
```

### Services (비즈니스 로직)
- 클래스 기반, Repository + RabbitMQClient 주입
- 비즈니스 규칙 검증 (중복 체크, 존재 여부 등)
- 에러 클래스: `NotFoundError`, `ConflictError`, `ValidationError`
- 이벤트 발행은 `publishEvent` private 메서드 사용
```typescript
export class TrusteeService {
  constructor(
    private repository: TrusteeRepository,
    private rabbitmq: RabbitMQClient | null
  ) {}

  async getById(id: string) {
    const trustee = await this.repository.findById(id);
    if (!trustee) {
      throw new NotFoundError("Trustee", id);
    }
    return trustee;
  }

  async create(dto: CreateTrusteeDto) {
    const existing = await this.repository.findByBusinessNumber(dto.businessNumber);
    if (existing) {
      throw new ConflictError(`사업자번호 '${dto.businessNumber}'는 이미 등록되어 있습니다.`);
    }
    const trustee = await this.repository.create(dto);
    await this.publishEvent(EVENT_ROUTING_KEYS.TRUSTEE_CREATED, {
      type: "trustee.created",
      data: { id: trustee.id, companyName: trustee.companyName },
    });
    return trustee;
  }

  private async publishEvent(routingKey: string, event: Record<string, unknown>) {
    if (!this.rabbitmq) return;
    try {
      await this.rabbitmq.publish(routingKey, {
        ...event,
        eventId: randomUUID(),
        timestamp: new Date().toISOString(),
        source: "trustee-service",
      });
    } catch {
      // 이벤트 발행 실패는 주요 동작을 차단하지 않음
    }
  }
}
```

### Repositories (데이터 접근)
- 클래스 기반, Prisma 직접 사용
- 비즈니스 로직 없음, 순수 데이터 접근
- findAll: `Promise.all([findMany, count])` 패턴으로 병렬 조회
- include로 관계 데이터 포함
```typescript
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
        include: { contracts: true },
      }),
      prisma.trustee.count({ where: params.where }),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    return prisma.trustee.findUnique({
      where: { id },
      include: { contracts: true },
    });
  }
}
```

## 서비스 부트스트랩 패턴
```typescript
async function main() {
  // 1. Repositories
  const repository = new TrusteeRepository();

  // 2. RabbitMQ (실패해도 서비스 실행)
  let rabbitmq: RabbitMQClient | null = null;
  try {
    rabbitmq = new RabbitMQClient({ url: config.rabbitmqUrl, exchange: EXCHANGE_NAME });
    await rabbitmq.connect();
  } catch (error) {
    logger.warn(error, "RabbitMQ 연결 실패 - 이벤트 발행 없이 실행됩니다");
  }

  // 3. Services → Controllers (DI)
  const service = new TrusteeService(repository, rabbitmq);
  const controller = new TrusteeController(service);

  // 4. Express 미들웨어 순서
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.get("/health", (_req, res) => { res.json({ status: "ok", ... }); });
  app.use("/api/trustees", createTrusteeRoutes(controller));
  app.use(errorHandler); // 반드시 마지막

  // 5. HTTP + gRPC 서버 시작
  app.listen(config.httpPort);
  startGrpcServer(repository);

  // 6. Graceful shutdown
  process.on("SIGTERM", async () => { await rabbitmq?.close(); process.exit(0); });
}
```

## Validation (Zod)
- 생성 스키마 정의 후, 수정은 `.partial()`로 파생
- 에러 메시지는 한국어
- 날짜 필드는 `z.string()` (ISO 문자열로 전송)
```typescript
export const createTrusteeSchema = z.object({
  companyName: z.string().min(1, "회사명은 필수입니다"),
  businessNumber: z.string().min(1, "사업자번호는 필수입니다"),
  contactEmail: z.string().email("유효한 이메일을 입력해주세요"),
  status: z.enum(["active", "inactive", "pending"]).optional(),
});

export const updateTrusteeSchema = createTrusteeSchema.partial();
```

## API 응답 형식
```typescript
// 성공 (단일)
res.json({ data: trustee });

// 성공 (생성)
res.status(201).json({ data: trustee });

// 성공 (목록)
res.json({ data: trustees, total: count });

// 성공 (삭제)
res.status(204).send();

// 에러 (errorHandler가 자동 처리)
{ error: { code: "NOT_FOUND", message: "Trustee with id 'xxx' not found" } }
{ error: { code: "VALIDATION_ERROR", message: "Validation failed", details: { field: ["msg"] } } }
```

## 에러 클래스 사용
```typescript
import { NotFoundError, ConflictError, ValidationError } from "@trustee/common";

throw new NotFoundError("Trustee", id);           // 404
throw new ConflictError("이미 등록된 사업자번호"); // 409
throw new ValidationError("잘못된 입력", details); // 400
```

## RabbitMQ 이벤트
- Exchange: `trustee.events` (topic)
- 라우팅 키: `@trustee/types`의 `EVENT_ROUTING_KEYS` 사용
- 이벤트 필수 필드: `eventId`, `timestamp`, `source`, `type`, `data`
- 이벤트 발행 실패는 무시 (주요 동작 차단 금지)

## gRPC
- proto 파일: `@trustee/proto`에서 경로 export
- 서버: `createGrpcServer()`, 클라이언트: `createGrpcClient()`
- 서비스 간 동기 통신용 (검증, 집계)
- gRPC 실패 시 graceful degradation

## 공유 패키지 import
```typescript
import { AppError, NotFoundError, ValidationError, ConflictError } from "@trustee/common";
import { createLogger, errorHandler, validate, RabbitMQClient } from "@trustee/common";
import { loadProto, createGrpcServer, createGrpcClient } from "@trustee/common";
import { EVENT_ROUTING_KEYS, EXCHANGE_NAME } from "@trustee/types";
import { TRUSTEE_PROTO_PATH, INSPECTION_PROTO_PATH } from "@trustee/proto";
```

## 파일 네이밍
- `{resource}.repository.ts` - 데이터 접근
- `{resource}.service.ts` - 비즈니스 로직
- `{resource}.controller.ts` - 요청 핸들러
- `{resource}.routes.ts` - 라우트 정의
- `validation.ts` - Zod 스키마 (서비스당 1개 파일)
- `config.ts` - 환경변수 설정
- `db.ts` - Prisma 클라이언트
- `grpc-server.ts` / `grpc-client.ts` - gRPC
- `event-handlers.ts` - RabbitMQ 이벤트 소비자

## Prisma 컨벤션
- 모델명: PascalCase (`Trustee`)
- 테이블명: snake_case (`@@map("trustees")`)
- 필드명: camelCase (`companyName`), DB 컬럼: snake_case (`@map("company_name")`)
- ID: `@id @default(cuid())`
- 타임스탬프: `createdAt @default(now())`, `updatedAt @updatedAt`
- 관계 삭제: `onDelete: Cascade`
- 서비스별 별도 DB, 별도 Prisma 스키마
