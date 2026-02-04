# 수탁사 관리 시스템 (Trustee Management System)

## 프로젝트 개요
개인정보 처리 업무를 위탁받은 수탁사를 관리하는 MSA 기반 시스템

## 아키텍처
```
Browser → Next.js (apps/web) → API Gateway (services/gateway:3001)
                                       │
                              ┌────────┴────────┐
                              │                  │
                    Trustee Service       Inspection Service
                   (HTTP:4001, gRPC:5001) (HTTP:4002, gRPC:5002)
                              │                  │
                         trustee_db          inspection_db
```

- **외부 통신**: REST API (Gateway ↔ Frontend)
- **내부 동기**: gRPC (서비스 간 데이터 조회)
- **내부 비동기**: RabbitMQ (이벤트 기반 처리)

## 기술 스택

### Frontend
- **Framework**: Next.js 15 (App Router) + TypeScript
- **UI**: MUI (Material-UI) + Tailwind CSS
- **상태관리**: React Query (TanStack Query)
- **폼 관리**: React Hook Form + Zod
- **API 클라이언트**: Gateway를 통한 REST 호출 (`src/lib/api/`, `src/hooks/`)

### Backend Services
- **Framework**: Express 5 + TypeScript
- **Database**: MySQL 8.0 + Prisma ORM (서비스별 별도 DB)
- **gRPC**: @grpc/grpc-js + @grpc/proto-loader
- **메시징**: RabbitMQ (amqplib)
- **로깅**: Pino
- **검증**: Zod

### Infrastructure
- **패키지 매니저**: pnpm (workspaces)
- **컨테이너**: Docker + Docker Compose
- **인증**: 추후 추가 예정

## 서비스 구조
- **services/gateway** - API Gateway (포트 3001): 프록시 + 집계 엔드포인트
- **services/trustee** - 수탁사/계약 서비스 (HTTP:4001, gRPC:5001)
- **services/inspection** - 점검/평가 서비스 (HTTP:4002, gRPC:5002)

### 서비스 내부 계층
Routes → Controllers → Services → Repositories (4계층 아키텍처)

## 주요 패키지
- **@trustee/common** - 에러 클래스, 미들웨어, RabbitMQ/gRPC 유틸리티, 로거
- **@trustee/proto** - gRPC .proto 파일 및 경로 export
- **@trustee/types** - 공유 타입 + 이벤트 타입 + API 타입
- **@trustee/ui** - MUI 공유 컴포넌트
- **@trustee/config** - TypeScript/ESLint/Tailwind 공유 설정
- **@trustee/database** - Prisma (레퍼런스, 서비스별 자체 Prisma 사용)

## Definition of Done
- [ ] 모든 테스트 통과
- [ ] TypeScript 에러 없음 (`pnpm -r type-check`)
- [ ] ESLint 통과 (`pnpm -r lint`)
- [ ] 콘솔 에러 없음
- [ ] 코드 리뷰 완료

## 참조 문서
@docs/ARCHITECTURE.md
@docs/CONVENTIONS.md
