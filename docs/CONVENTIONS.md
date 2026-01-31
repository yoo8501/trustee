# 코딩 컨벤션

## 네이밍 규칙
- 컴포넌트: PascalCase (예: TrusteeList.tsx)
- 유틸리티/훅: camelCase (예: useTrustees.ts)
- API 라우트: route.ts 파일 사용
- 패키지: @trustee/패키지명 (예: @trustee/ui, @trustee/types)

## 언어
- UI: 한국어
- 코드: 영어

## 개발 명령어 (pnpm)
```bash
# 의존성 설치
pnpm install

# 개발 서버 실행
pnpm dev

# 프로덕션 빌드
pnpm build

# 개발 서버 시작 (빌드 후)
pnpm start

# 린트 검사
pnpm lint

# 타입 검사
pnpm type-check

# Prisma 클라이언트 생성
pnpm db:generate

# 스키마를 DB에 반영
pnpm db:push

# Prisma Studio 실행
pnpm db:studio

# 모든 node_modules 삭제
pnpm clean
```

## 특정 워크스페이스 명령어
```bash
# 특정 패키지에서 명령어 실행
pnpm --filter @trustee/web dev
pnpm --filter @trustee/database generate

# 모든 패키지에서 명령어 실행
pnpm -r lint
pnpm -r type-check
```

## 환경 변수 (.env)
```
DATABASE_URL="mysql://user:password@localhost:3306/trustee"
```

## 패키지 import 방법
```typescript
// 공유 타입
import { Trustee, Contract, Inspection } from "@trustee/types";

// UI 컴포넌트
import { Button, DataTable, Dialog, theme } from "@trustee/ui";

// Database
import { prisma } from "@trustee/database";
```

## 새 패키지 의존성 추가
```bash
# 루트에 devDependency 추가
pnpm add -D typescript -w

# 특정 워크스페이스에 dependency 추가
pnpm add react --filter @trustee/web
pnpm add @prisma/client --filter @trustee/database

# 내부 패키지 의존성 추가
pnpm add @trustee/ui --filter @trustee/web --workspace
```
