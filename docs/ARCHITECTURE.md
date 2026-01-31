# 아키텍처

## 모노레포 구조
```
trustee/
├── apps/
│   └── web/                  # @trustee/web - Next.js 15 앱
│       ├── src/
│       │   ├── app/          # App Router 페이지
│       │   │   ├── (dashboard)/     # 대시보드 레이아웃 그룹
│       │   │   │   ├── layout.tsx
│       │   │   │   ├── page.tsx     # 대시보드 메인
│       │   │   │   ├── trustees/    # 수탁사 관리
│       │   │   │   ├── contracts/   # 계약 관리
│       │   │   │   └── inspections/ # 점검/평가 관리
│       │   │   ├── api/             # API 라우트
│       │   │   ├── layout.tsx
│       │   │   └── globals.css
│       │   ├── components/          # 웹 전용 컴포넌트
│       │   └── lib/                 # 웹 전용 유틸리티
│       ├── package.json
│       ├── next.config.mjs
│       ├── tailwind.config.ts
│       └── tsconfig.json
│
├── packages/
│   ├── config/               # @trustee/config - 공유 설정
│   │   ├── typescript/       # TypeScript 설정
│   │   │   ├── base.json
│   │   │   ├── nextjs.json
│   │   │   └── library.json
│   │   ├── eslint/           # ESLint 설정
│   │   │   ├── base.js
│   │   │   └── next.js
│   │   ├── tailwind/         # Tailwind 설정
│   │   └── postcss/          # PostCSS 설정
│   │
│   ├── types/                # @trustee/types - 공유 타입
│   │   └── src/
│   │       └── index.ts      # Trustee, Contract, Inspection 타입
│   │
│   ├── database/             # @trustee/database - Prisma
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── src/
│   │       ├── client.ts
│   │       └── index.ts
│   │
│   └── ui/                   # @trustee/ui - MUI 컴포넌트
│       └── src/
│           ├── theme/        # MUI 테마
│           ├── components/   # 공유 컴포넌트
│           └── index.ts
│
├── pnpm-workspace.yaml
├── package.json              # 루트 package.json
├── .npmrc
└── docs/
```

## 패키지 의존성
```
@trustee/web
├── @trustee/ui
├── @trustee/types
├── @trustee/database
└── @trustee/config

@trustee/ui
├── @trustee/config
└── (MUI, Emotion)

@trustee/types
└── @trustee/config

@trustee/database
├── @trustee/config
└── (Prisma)
```

## 데이터 모델
- **Trustee**: 수탁사 정보 (companyName, businessNumber, representative, contactName, contactPhone, contactEmail, delegatedTasks, status)
- **Contract**: 계약 정보 (trusteeId, startDate, endDate, fileUrl)
- **Inspection**: 점검 정보 (trusteeId, inspectionDate, score, status, findings, improvements)
- **InspectionItem**: 점검 항목 (inspectionId, category, question, result, note)
