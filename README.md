# 수탁사 관리 시스템

개인정보 처리 업무를 위탁받은 수탁사를 관리하는 시스템입니다.

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | Next.js 15 (App Router), TypeScript, MUI, Tailwind CSS |
| 상태관리 | React Query (TanStack Query) |
| 폼 관리 | React Hook Form + Zod |
| 백엔드 | Express 5, TypeScript |
| 데이터베이스 | MySQL 8.0, Prisma ORM |
| 서비스 간 통신 | gRPC (동기), RabbitMQ (비동기) |
| 인프라 | Docker, Docker Compose |
| 패키지 매니저 | pnpm (workspaces) |

## 프로젝트 구조

```
trustee/
├── frontend/                 # 프론트엔드
│   ├── web/                  # Next.js 앱
│   └── packages/
│       └── ui/               # 공유 UI 컴포넌트
│
├── backend/                  # 백엔드
│   ├── services/
│   │   ├── gateway/          # API Gateway (:3001)
│   │   ├── trustee/          # 수탁사 서비스 (HTTP:4001, gRPC:5001)
│   │   └── inspection/       # 점검 서비스 (HTTP:4002, gRPC:5002)
│   └── packages/
│       ├── common/           # 공유 유틸리티
│       ├── config/           # 공유 설정 (TS/ESLint/Tailwind)
│       ├── database/         # Prisma
│       ├── proto/            # gRPC proto 파일
│       └── types/            # 공유 타입
│
├── infra/                    # 인프라
│   ├── docker/               # DB 초기화 스크립트
│   ├── docker-compose.yml    # 프로덕션
│   └── docker-compose.dev.yml # 개발 (MySQL, RabbitMQ)
│
└── docs/                     # 문서
```

## 시작하기

### 사전 요구사항

- Node.js 20+
- pnpm 9+
- Docker (MySQL, RabbitMQ 실행용)

### 설치 및 실행

```bash
# 의존성 설치
pnpm install

# 인프라 실행 (MySQL, RabbitMQ)
pnpm infra:up

# 프론트엔드 개발 서버
pnpm dev

# 백엔드 서비스 개발 서버
pnpm dev:services

# 전체 개발 서버 (프론트 + 백엔드)
pnpm dev:all
```

브라우저에서 [http://localhost:3000](http://localhost:3000)으로 접속합니다.

### 주요 명령어

```bash
# 타입 검사
pnpm -r type-check

# 린트
pnpm -r lint

# 프로덕션 빌드
pnpm build

# Prisma 클라이언트 생성
pnpm db:generate

# Docker 전체 실행 (프로덕션)
pnpm docker:up

# 인프라 종료
pnpm infra:down
```

## 아키텍처

```
브라우저 → Next.js (프론트엔드) → API Gateway (:3001)
                                        │
                               ┌────────┴────────┐
                               │                  │
                     수탁사 서비스          점검 서비스
                    (HTTP:4001)          (HTTP:4002)
                               │                  │
                          trustee_db         inspection_db
```

- 외부 통신: REST API (Gateway - 프론트엔드)
- 내부 동기 통신: gRPC (서비스 간 데이터 조회)
- 내부 비동기 통신: RabbitMQ (이벤트 기반 처리)
