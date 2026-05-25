# DocFlow Frontend

React 19 + Vite + MUI + TanStack Query + i18next SPA.

## Setup

```bash
cd frontend
bun install
```

## Develop

```bash
bun run dev          # http://localhost:5173 (proxies /api → http://localhost:8080)
bun test             # Vitest
bun run lint         # ESLint
bunx tsc --noEmit    # 타입 체크
bun run build        # tsc -b && vite build → dist/
```

## 구조

```
src/
├── routes/      React Router v7 라우트
├── components/  재사용 컴포넌트
├── features/    도메인별 UI (도메인은 Sprint 2부터)
└── lib/
    ├── api/     공통 http client + ApiResult/ApiError
    ├── theme/   MUI light/dark 팔레트 + ThemeProvider
    └── i18n/    i18next 부트 + ko/en 리소스
```

자세한 규칙은 [`CLAUDE.md`](./CLAUDE.md) 참조.
