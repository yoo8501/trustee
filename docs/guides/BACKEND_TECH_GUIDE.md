# 백엔드 기술 스택 가이드

> 이 문서는 개발을 처음 시작하는 사람을 위해, 이 프로젝트의 백엔드에서 사용하는 기술들을 하나하나 설명합니다.

---

## 목차

1. [Node.js & TypeScript](#1-nodejs--typescript)
2. [Express](#2-express)
3. [MySQL & Prisma ORM](#3-mysql--prisma-orm)
4. [Zod (데이터 검증)](#4-zod-데이터-검증)
5. [gRPC & Protocol Buffers](#5-grpc--protocol-buffers)
6. [RabbitMQ (메시지 브로커)](#6-rabbitmq-메시지-브로커)
7. [Pino (로깅)](#7-pino-로깅)
8. [보안 미들웨어 (Helmet, CORS, Rate Limit)](#8-보안-미들웨어-helmet-cors-rate-limit)
9. [Docker & Docker Compose](#9-docker--docker-compose)
10. [pnpm Workspaces (모노레포)](#10-pnpm-workspaces-모노레포)
11. [전체 그림: 요청이 처리되는 흐름](#11-전체-그림-요청이-처리되는-흐름)

---

## 1. Node.js & TypeScript

### Node.js가 뭔가요?

Node.js는 **JavaScript를 서버에서 실행**할 수 있게 해주는 런타임(실행 환경)입니다.

원래 JavaScript는 웹 브라우저 안에서만 동작하는 언어였습니다. 하지만 Node.js 덕분에 서버 프로그램도 JavaScript로 만들 수 있게 되었습니다. 즉, 프론트엔드(화면)와 백엔드(서버)를 같은 언어로 개발할 수 있습니다.

### TypeScript는 뭔가요?

TypeScript는 JavaScript에 **타입(type)** 을 추가한 언어입니다. Microsoft가 만들었습니다.

JavaScript에서는 이런 코드가 가능합니다:

```javascript
// JavaScript - 아무 값이나 넣을 수 있음
let name = "홍길동";
name = 123; // 에러 없이 실행됨 → 나중에 버그 발생 가능
```

TypeScript에서는 타입을 명시합니다:

```typescript
// TypeScript - 타입을 지정
let name: string = "홍길동";
name = 123; // 컴파일 에러! 문자열에 숫자를 넣을 수 없음
```

**왜 쓰나요?**
- 코드를 실행하기 전에 오류를 잡아줍니다 (컴파일 타임 검사)
- IDE(코드 편집기)에서 자동완성이 잘 됩니다
- 큰 프로젝트에서 코드 품질을 유지하기 쉽습니다

### 이 프로젝트에서의 사용

이 프로젝트는 모든 백엔드 코드를 TypeScript로 작성하고, `tsx`라는 도구로 개발 중에 바로 실행합니다. 프로덕션 배포 시에는 TypeScript를 JavaScript로 컴파일한 뒤 Node.js로 실행합니다.

---

## 2. Express

### Express가 뭔가요?

Express는 Node.js에서 가장 널리 쓰이는 **웹 서버 프레임워크**입니다.

"웹 서버"란 클라이언트(브라우저, 앱 등)가 보내는 **HTTP 요청**(예: "수탁사 목록 보여줘")을 받아서 **응답**(수탁사 데이터)을 돌려주는 프로그램입니다. Express를 사용하면 이 과정을 간단하게 코드로 작성할 수 있습니다.

### 기본 개념

```typescript
import express from "express";

const app = express();

// GET /api/trustees 요청이 오면 수탁사 목록을 응답
app.get("/api/trustees", (req, res) => {
  res.json({ data: [{ id: "1", companyName: "A회사" }] });
});

// 서버를 4001번 포트에서 시작
app.listen(4001, () => {
  console.log("서버가 4001번 포트에서 실행 중입니다");
});
```

### 미들웨어란?

Express의 핵심 개념입니다. **미들웨어**는 요청이 최종 처리 함수에 도달하기 전에 거치는 중간 단계입니다. 공항 보안검색처럼, 요청이 여러 검문소를 통과하는 것입니다.

```
요청 → [Helmet] → [CORS] → [JSON 파싱] → [인증 확인] → [라우트 처리] → 응답
```

```typescript
const app = express();

// 1. 보안 헤더 추가 (Helmet)
app.use(helmet());

// 2. 다른 도메인에서의 요청 허용 (CORS)
app.use(cors());

// 3. JSON 형태의 요청 본문을 파싱
app.use(express.json());

// 4. 실제 라우트
app.use("/api/trustees", trusteeRoutes);

// 5. 에러 처리 (반드시 마지막)
app.use(errorHandler);
```

### 이 프로젝트에서의 사용

이 프로젝트에는 3개의 Express 서버가 있습니다:

| 서비스 | 포트 | 역할 |
|--------|------|------|
| Gateway | 3001 | 프론트엔드의 요청을 받아서 적절한 서비스로 전달 |
| Trustee Service | 4001 | 수탁사/계약 데이터 처리 |
| Inspection Service | 4002 | 점검/평가 데이터 처리 |

---

## 3. MySQL & Prisma ORM

### MySQL이 뭔가요?

MySQL은 **관계형 데이터베이스(RDBMS)** 입니다. 데이터를 **테이블(표)** 형태로 저장합니다.

엑셀 시트를 떠올려 보세요:

| id | company_name | business_number | status |
|----|-------------|-----------------|--------|
| 1  | A회사       | 123-45-67890    | active |
| 2  | B회사       | 098-76-54321    | pending |

이런 식으로 정형화된 데이터를 저장하고, **SQL**이라는 질의 언어로 데이터를 조회/추가/수정/삭제합니다.

```sql
-- 활성 상태인 수탁사 목록 조회
SELECT * FROM trustees WHERE status = 'active';

-- 새 수탁사 추가
INSERT INTO trustees (company_name, business_number) VALUES ('C회사', '111-22-33333');
```

### Prisma ORM이 뭔가요?

ORM(Object-Relational Mapping)은 데이터베이스의 테이블을 프로그래밍 언어의 **객체(Object)** 로 다룰 수 있게 해주는 도구입니다. SQL을 직접 작성하지 않아도 됩니다.

Prisma는 Node.js/TypeScript에서 가장 인기 있는 ORM입니다.

**스키마 정의** (`prisma/schema.prisma`):

```prisma
// 데이터베이스 연결 설정
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// 수탁사 모델 (= 테이블 구조 정의)
model Trustee {
  id             String        @id @default(cuid())  // 자동 생성되는 고유 ID
  companyName    String        @map("company_name")   // DB에는 snake_case로 저장
  businessNumber String        @unique @map("business_number")
  status         TrusteeStatus @default(pending)
  createdAt      DateTime      @default(now())        // 생성 시간 자동 기록
  updatedAt      DateTime      @updatedAt             // 수정 시간 자동 갱신
  contracts      Contract[]                            // 이 수탁사의 계약 목록 (1:N 관계)

  @@map("trustees")  // 실제 테이블 이름
}
```

**Prisma를 사용한 데이터 조회** (SQL 없이!):

```typescript
// 모든 수탁사 조회 (계약 정보 포함)
const trustees = await prisma.trustee.findMany({
  include: { contracts: true },
});

// 특정 수탁사 조회
const trustee = await prisma.trustee.findUnique({
  where: { id: "abc123" },
});

// 새 수탁사 생성
const newTrustee = await prisma.trustee.create({
  data: {
    companyName: "C회사",
    businessNumber: "111-22-33333",
    representative: "김대표",
    contactName: "이담당",
    contactPhone: "010-1234-5678",
    contactEmail: "lee@company.com",
    delegatedTasks: "개인정보 처리",
  },
});
```

### 서비스별 별도 데이터베이스

이 프로젝트에서는 각 서비스가 **자기만의 데이터베이스**를 갖습니다:

- `trustee_db`: Trustee Service가 사용 (수탁사, 계약 데이터)
- `inspection_db`: Inspection Service가 사용 (점검, 점검항목 데이터)

이렇게 분리하면 한 서비스의 데이터베이스에 문제가 생겨도 다른 서비스에 영향을 주지 않습니다.

---

## 4. Zod (데이터 검증)

### Zod가 뭔가요?

사용자가 서버에 데이터를 보낼 때, 그 데이터가 올바른 형식인지 **검증(validation)** 해야 합니다. 예를 들어 "이메일 주소" 필드에 "abc"라고 보내면 안 되겠죠. Zod는 이런 검증을 쉽게 해주는 라이브러리입니다.

### 어떻게 사용하나요?

**스키마 정의** (어떤 데이터를 기대하는지 선언):

```typescript
import { z } from "zod";

// 수탁사 생성 시 필요한 데이터 스키마
const createTrusteeSchema = z.object({
  companyName: z.string().min(1, "회사명은 필수입니다"),
  businessNumber: z.string().min(1, "사업자번호는 필수입니다"),
  contactEmail: z.string().email("유효한 이메일을 입력해주세요"),
  status: z.enum(["active", "inactive", "pending"]).optional(),
});

// 수정 스키마는 모든 필드가 선택적(optional)
const updateTrusteeSchema = createTrusteeSchema.partial();
```

**검증 실행**:

```typescript
// 올바른 데이터 → 통과
createTrusteeSchema.parse({
  companyName: "A회사",
  businessNumber: "123-45-67890",
  contactEmail: "contact@a.com",
}); // ✅ 성공

// 잘못된 데이터 → 에러 발생
createTrusteeSchema.parse({
  companyName: "",           // 빈 문자열 → 에러
  contactEmail: "invalid",   // 이메일 형식 아님 → 에러
}); // ❌ ZodError 발생
```

### 이 프로젝트에서의 사용

Express 미들웨어로 연결하여, 요청 데이터가 라우트 핸들러에 도달하기 전에 자동으로 검증합니다:

```typescript
// validate 미들웨어가 요청 본문을 스키마로 검증
router.post("/", validate(createTrusteeSchema), controller.create);
//                ↑ 검증 실패 시 400 에러 자동 반환
```

---

## 5. gRPC & Protocol Buffers

### 먼저, REST API를 알아봅시다

일반적으로 클라이언트와 서버는 **REST API**로 통신합니다. 사람이 읽기 쉬운 **JSON** 형식으로 데이터를 주고받습니다.

```
브라우저 → GET /api/trustees/123 → 서버
브라우저 ← { "data": { "id": "123", "companyName": "A회사" } } ← 서버
```

### gRPC는 뭔가요?

gRPC는 Google이 만든 **서비스 간 통신 프로토콜**입니다. REST API와 비슷한 역할을 하지만, **서버와 서버 사이**의 통신에 특화되어 있습니다.

**REST API vs gRPC 비교:**

| 비교 항목 | REST API | gRPC |
|----------|----------|------|
| 데이터 형식 | JSON (텍스트) | Protocol Buffers (바이너리) |
| 속도 | 보통 | 빠름 |
| 사람이 읽기 | 쉬움 | 어려움 |
| 주 사용처 | 클라이언트 ↔ 서버 | 서버 ↔ 서버 |

### Protocol Buffers(Protobuf)란?

gRPC가 주고받는 데이터의 구조를 정의하는 언어입니다. `.proto` 파일에 작성합니다.

```protobuf
// trustee.proto - "수탁사 서비스에서 어떤 기능을 제공하는지" 정의

syntax = "proto3";
package trustee;

// 서비스 정의: 어떤 함수(rpc)를 호출할 수 있는지
service TrusteeService {
  // 수탁사 정보 조회
  rpc GetTrustee (GetTrusteeRequest) returns (TrusteeResponse);
  // 수탁사 존재 여부 확인
  rpc ValidateTrusteeExists (ValidateTrusteeExistsRequest) returns (ValidateTrusteeExistsResponse);
}

// 요청 메시지: 어떤 데이터를 보내야 하는지
message GetTrusteeRequest {
  string id = 1;
}

// 응답 메시지: 어떤 데이터를 받는지
message TrusteeResponse {
  string id = 1;
  string company_name = 2;
  string business_number = 3;
  string status = 4;
  // ...
}
```

### 이 프로젝트에서의 사용

Inspection Service가 Trustee Service에게 "이 수탁사가 존재하는지 확인해줘"라고 물어볼 때 gRPC를 사용합니다:

```
[Inspection Service] --gRPC--> [Trustee Service]
"trusteeId 'abc123'이 존재해?"  →  "네, 존재합니다. 회사명은 A회사입니다"
```

**gRPC 서버 구현** (Trustee Service):

```typescript
// 다른 서비스의 요청을 처리
const implementations = {
  validateTrusteeExists: async (call, callback) => {
    const trustee = await repository.findById(call.request.id);
    callback(null, {
      exists: !!trustee,
      companyName: trustee?.companyName || "",
    });
  },
};
```

**gRPC 클라이언트 사용** (Inspection Service):

```typescript
// Trustee Service에 수탁사 존재 여부 확인 요청
const result = await validateTrusteeExists("abc123");
if (!result.exists) {
  throw new NotFoundError("Trustee", "abc123");
}
```

**왜 REST 대신 gRPC를 쓰나요?**
- 바이너리 형식이라 JSON보다 빠릅니다
- `.proto` 파일로 서비스 간 계약(인터페이스)을 명확하게 정의합니다
- 타입 안전성이 보장됩니다

---

## 6. RabbitMQ (메시지 브로커)

### 메시지 브로커가 뭔가요?

두 프로그램이 직접 통신하지 않고, **중간에 메시지 전달자**를 두는 것입니다. 실생활로 비유하면 **우체국** 같은 역할입니다.

**직접 통신 (동기 방식):**
```
[A 서비스] → "수탁사 삭제했어, 관련 점검도 취소해줘" → [B 서비스]
```
문제: B 서비스가 죽어있으면 A 서비스도 에러가 발생합니다.

**메시지 브로커 (비동기 방식):**
```
[A 서비스] → "수탁사 삭제 이벤트" → [RabbitMQ] → [B 서비스]
```
장점: B 서비스가 잠시 죽어있어도 메시지가 RabbitMQ에 보관됩니다. B 서비스가 살아나면 그때 처리합니다.

### RabbitMQ 핵심 개념

```
Producer(발행자) → Exchange(교환기) → Queue(대기열) → Consumer(소비자)
```

- **Producer**: 메시지를 보내는 쪽 (예: Trustee Service)
- **Exchange**: 메시지를 적절한 Queue로 라우팅하는 교환기
- **Queue**: 메시지가 대기하는 줄
- **Consumer**: 메시지를 받아 처리하는 쪽 (예: Inspection Service)
- **Routing Key**: 메시지의 주제 (예: `trustee.deleted`)

### 이 프로젝트에서의 사용

**이벤트 발행** (Trustee Service - 수탁사 삭제 시):

```typescript
// 수탁사를 삭제한 후 이벤트를 발행
async delete(id: string) {
  const trustee = await this.repository.findById(id);
  await this.repository.delete(id);

  // RabbitMQ로 "수탁사가 삭제되었다"는 이벤트 발행
  await this.publishEvent("trustee.deleted", {
    type: "trustee.deleted",
    data: { id: trustee.id, companyName: trustee.companyName },
  });
}
```

**이벤트 수신** (Inspection Service - 수탁사 삭제 이벤트를 듣고 있다가 처리):

```typescript
// "trustee.deleted" 이벤트를 구독
await rabbitmq.subscribe(
  "inspection.trustee-deleted",      // 큐 이름
  "trustee.deleted",                 // 라우팅 키
  async (message) => {
    // 삭제된 수탁사의 점검들을 자동으로 취소
    await inspectionService.cancelByTrusteeId(
      message.data.id,
      `수탁사 '${message.data.companyName}' 삭제로 인한 자동 취소`
    );
  }
);
```

### 이 프로젝트의 이벤트 목록

| 이벤트 | 발행 서비스 | 의미 |
|--------|------------|------|
| `trustee.created` | Trustee | 수탁사가 새로 등록됨 |
| `trustee.updated` | Trustee | 수탁사 정보가 수정됨 |
| `trustee.deleted` | Trustee | 수탁사가 삭제됨 |
| `inspection.created` | Inspection | 점검이 새로 등록됨 |
| `inspection.completed` | Inspection | 점검이 완료됨 |
| `inspection.cancelled` | Inspection | 점검이 취소됨 |

---

## 7. Pino (로깅)

### 로깅이 뭔가요?

서버에서 일어나는 일을 **기록**하는 것입니다. 에러가 발생하면 어디서 왜 발생했는지 추적하기 위해 반드시 필요합니다.

```typescript
// console.log 대신 Pino 로거를 사용
import { createLogger } from "@trustee/common";

const logger = createLogger("trustee-service");

logger.info("서버가 시작되었습니다");
logger.warn("RabbitMQ 연결 실패 - 이벤트 발행 없이 실행됩니다");
logger.error(error, "수탁사 생성 중 에러 발생");
```

### console.log 대신 Pino를 쓰는 이유

| 비교 | console.log | Pino |
|------|------------|------|
| 출력 형식 | 일반 텍스트 | 구조화된 JSON |
| 로그 레벨 | 없음 | debug, info, warn, error 등 |
| 성능 | 느림 | 매우 빠름 (Node.js 최고 속도) |
| 프로덕션 | 부적합 | 적합 (로그 수집 도구와 연동 가능) |

**개발 환경에서는** `pino-pretty`로 사람이 읽기 좋게 출력됩니다:

```
[14:30:22] INFO (trustee-service): 서버가 시작되었습니다
[14:30:23] INFO (trustee-service): HTTP 서버가 4001번 포트에서 실행 중
```

**프로덕션 환경에서는** JSON 형태로 출력되어 로그 수집 도구가 파싱할 수 있습니다:

```json
{"level":30,"time":1707700222,"name":"trustee-service","msg":"서버가 시작되었습니다"}
```

---

## 8. 보안 미들웨어 (Helmet, CORS, Rate Limit)

### Helmet

HTTP 응답 헤더를 자동으로 설정하여 **보안 취약점을 방지**하는 미들웨어입니다.

```typescript
app.use(helmet());
```

한 줄로 여러 보안 헤더가 추가됩니다:
- XSS(크로스 사이트 스크립팅) 공격 방지
- 클릭재킹 방지
- MIME 타입 스니핑 방지 등

### CORS (Cross-Origin Resource Sharing)

**다른 도메인에서 오는 요청을 허용**하는 설정입니다.

기본적으로 브라우저는 보안을 위해 다른 도메인의 서버에 요청을 보내는 것을 차단합니다:

```
프론트엔드 (localhost:3000) → 백엔드 (localhost:3001)
                            ↑ 도메인(포트)이 다름 → 브라우저가 차단!
```

CORS를 설정하면 이 제한을 풀어줍니다:

```typescript
app.use(cors());
// "다른 도메인에서 오는 요청도 허용해줘"
```

### Rate Limit (요청 제한)

**같은 사용자가 너무 많은 요청을 보내는 것을 방지**합니다. DDoS 공격이나 API 남용을 막아줍니다.

```typescript
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15분 동안
  max: 1000,                  // 최대 1000번 요청 허용
});
app.use(limiter);
```

15분 내에 같은 IP에서 1000번 이상 요청하면 `429 Too Many Requests` 에러를 반환합니다.

---

## 9. Docker & Docker Compose

### Docker가 뭔가요?

Docker는 애플리케이션을 **컨테이너**라는 격리된 환경에 담아서 실행하는 도구입니다.

**문제 상황을 생각해 봅시다:**
- 개발자 A의 컴퓨터: Node.js 18, MySQL 8.0 → 잘 동작
- 개발자 B의 컴퓨터: Node.js 16, MySQL 5.7 → 에러 발생
- "내 컴퓨터에서는 되는데…"

**Docker의 해결 방법:**
- Node.js 18, MySQL 8.0이 포함된 컨테이너를 만들어서
- 어떤 컴퓨터에서든 동일한 환경으로 실행합니다.

### Docker Compose는 뭔가요?

여러 개의 Docker 컨테이너를 **한 번에 관리**하는 도구입니다. 이 프로젝트에는 5개의 서비스가 있으므로 Docker Compose로 한꺼번에 실행합니다.

```yaml
# docker-compose.yml (간소화)
services:
  # 1. MySQL 데이터베이스
  mysql:
    image: mysql:8.0
    ports:
      - "3306:3306"
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_USER: trustee
      MYSQL_PASSWORD: trusteepassword

  # 2. RabbitMQ 메시지 브로커
  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"    # AMQP 통신 포트
      - "15672:15672"  # 관리 웹 UI (브라우저에서 접속 가능)

  # 3. Gateway 서비스
  gateway:
    build: ./backend/services/gateway
    ports:
      - "3001:3001"
    depends_on:
      - trustee-service
      - inspection-service

  # 4. Trustee 서비스
  trustee-service:
    build: ./backend/services/trustee
    ports:
      - "4001:4001"
      - "5001:5001"
    depends_on:
      - mysql
      - rabbitmq

  # 5. Inspection 서비스
  inspection-service:
    build: ./backend/services/inspection
    ports:
      - "4002:4002"
      - "5002:5002"
    depends_on:
      - mysql
      - rabbitmq
```

**실행 방법:**

```bash
# 모든 서비스 한 번에 시작
docker compose up

# 백그라운드에서 실행
docker compose up -d

# 모든 서비스 중지
docker compose down
```

---

## 10. pnpm Workspaces (모노레포)

### 모노레포(Monorepo)가 뭔가요?

여러 개의 프로젝트(패키지)를 **하나의 저장소(Repository)** 에서 관리하는 방식입니다.

**일반적인 방식 (멀티레포):**
```
trustee-frontend/    ← 별도 저장소
trustee-gateway/     ← 별도 저장소
trustee-service/     ← 별도 저장소
trustee-inspection/  ← 별도 저장소
trustee-common/      ← 별도 저장소
```
문제: 공통 코드를 수정하려면 여러 저장소를 돌아다녀야 합니다.

**모노레포 방식:**
```
trustee/                        ← 하나의 저장소
├── frontend/web/               # 프론트엔드
├── backend/services/gateway/   # Gateway
├── backend/services/trustee/   # Trustee 서비스
├── backend/services/inspection/# Inspection 서비스
└── backend/packages/common/    # 공유 코드
```
장점: 한 곳에서 모든 코드를 관리하고, 공유 코드 수정이 즉시 반영됩니다.

### pnpm Workspaces

pnpm은 Node.js **패키지 매니저** (npm, yarn과 같은 역할)입니다. Workspaces 기능으로 모노레포를 지원합니다.

```yaml
# pnpm-workspace.yaml
packages:
  - "frontend/web"
  - "frontend/packages/*"
  - "backend/services/*"
  - "backend/packages/*"
```

이렇게 설정하면 각 폴더가 하나의 패키지로 인식되어, 서로를 import할 수 있습니다:

```typescript
// backend/services/trustee에서 backend/packages/common의 코드를 사용
import { NotFoundError, createLogger } from "@trustee/common";

// backend/services/inspection에서 backend/packages/types의 타입을 사용
import { EVENT_ROUTING_KEYS, EXCHANGE_NAME } from "@trustee/types";
```

### 이 프로젝트의 공유 패키지

| 패키지 | 이름 | 역할 |
|--------|------|------|
| `backend/packages/common` | @trustee/common | 에러 클래스, 미들웨어, RabbitMQ/gRPC 유틸, 로거 |
| `backend/packages/types` | @trustee/types | 공유 TypeScript 타입, 이벤트 타입 |
| `backend/packages/proto` | @trustee/proto | gRPC .proto 파일 경로 제공 |
| `backend/packages/config` | @trustee/config | TypeScript/ESLint/Tailwind 공유 설정 |
| `frontend/packages/ui` | @trustee/ui | 프론트엔드 공유 UI 컴포넌트 |

---

## 11. 전체 그림: 요청이 처리되는 흐름

### 1단계: 사용자가 수탁사 목록을 조회하는 경우

```
[브라우저]
   │
   │ GET http://localhost:3001/api/trustees
   ▼
[Gateway :3001]
   │ http-proxy-middleware가 요청을 Trustee Service로 전달
   ▼
[Trustee Service :4001]
   │
   ├── Routes: GET /api/trustees → controller.list
   ├── Controller: req에서 query 파라미터 추출 → service.list() 호출
   ├── Service: 비즈니스 로직 처리 → repository.findAll() 호출
   └── Repository: Prisma로 MySQL 조회 → 데이터 반환
   │
   ▼
[브라우저] ← { data: [...], total: 50 }
```

### 2단계: 수탁사를 삭제하면 점검도 자동 취소되는 경우

```
[브라우저]
   │ DELETE /api/trustees/abc123
   ▼
[Gateway] → [Trustee Service]
              │
              ├── Service: 수탁사 삭제 실행
              ├── Repository: MySQL에서 삭제
              └── RabbitMQ로 이벤트 발행: "trustee.deleted"
                    │
                    ▼
              [RabbitMQ]
                    │ 이벤트를 구독 중인 서비스에 전달
                    ▼
              [Inspection Service]
                    │
                    └── Event Handler: 해당 수탁사의 점검을 모두 "취소" 상태로 변경
```

### 3단계: 점검 생성 시 수탁사 존재 여부를 확인하는 경우

```
[브라우저]
   │ POST /api/inspections { trusteeId: "abc123", ... }
   ▼
[Gateway] → [Inspection Service]
              │
              ├── Service: 먼저 수탁사가 존재하는지 확인해야 함
              │     │
              │     │ gRPC 호출: ValidateTrusteeExists("abc123")
              │     ▼
              │   [Trustee Service :5001]
              │     └── "존재합니다, 회사명: A회사"
              │
              ├── Service: 존재 확인됨 → 점검 생성 진행
              └── Repository: MySQL에 점검 데이터 저장
```

---

## 기술별 사용 목적 요약

| 기술 | 한 줄 설명 | 이 프로젝트에서의 역할 |
|------|-----------|---------------------|
| **Node.js** | 서버에서 JavaScript 실행 | 모든 백엔드 서비스의 실행 환경 |
| **TypeScript** | 타입이 있는 JavaScript | 코드 안전성과 생산성 향상 |
| **Express** | 웹 서버 프레임워크 | HTTP 요청/응답 처리 |
| **MySQL** | 관계형 데이터베이스 | 수탁사, 계약, 점검 데이터 저장 |
| **Prisma** | ORM (DB 접근 도구) | SQL 없이 TypeScript로 DB 조작 |
| **Zod** | 데이터 검증 라이브러리 | 요청 데이터의 유효성 검사 |
| **gRPC** | 서버 간 통신 프로토콜 | 서비스 간 동기 데이터 조회 |
| **RabbitMQ** | 메시지 브로커 | 서비스 간 비동기 이벤트 전달 |
| **Pino** | 로깅 라이브러리 | 서버 동작 기록 및 에러 추적 |
| **Helmet** | 보안 헤더 미들웨어 | HTTP 보안 취약점 방지 |
| **CORS** | 교차 출처 허용 | 프론트엔드 ↔ 백엔드 통신 허용 |
| **Rate Limit** | 요청 제한 미들웨어 | API 남용 및 DDoS 방지 |
| **Docker** | 컨테이너 실행 도구 | 일관된 실행 환경 보장 |
| **Docker Compose** | 다중 컨테이너 관리 | 5개 서비스를 한 번에 실행 |
| **pnpm** | 패키지 매니저 | 모노레포에서 의존성 관리 |
