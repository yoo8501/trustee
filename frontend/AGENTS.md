# DocFlow Frontend - Codex 작업 지침

> Frontend 작업 시 루트 [`../AGENTS.md`](../AGENTS.md)를 먼저 따른다.
> 공유 contract는 [`../context/api.md`](../context/api.md), [`../context/error.md`](../context/error.md)가 우선한다.

---

## 1. 기술 스택

- TypeScript strict + React 19
- Vite (SPA 빌드. SSR/SSG 사용 안 함)
- React Router v7 (declarative)
- MUI + Emotion
- 서버 상태: TanStack Query
- 클라이언트 전역 상태: React Context 우선, 필요 시 Zustand (Redux 사용 안 함)
- React Hook Form + Zod
- Vitest + React Testing Library + MSW
- i18next + react-i18next
- 패키지 매니저는 기존 lockfile 기준으로 bun 또는 pnpm을 따른다.

API 서버는 Go 백엔드 단독. 프론트는 정적 빌드 산출물(`dist/`)을 reverse proxy 뒤에 둔다.

---

## 2. 디렉토리 기준

```text
frontend/
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes/
│   ├── components/
│   ├── features/
│   │   └── <domain>/
│   │       ├── api/
│   │       ├── hooks/
│   │       ├── components/
│   │       └── types.ts
│   └── lib/
│       ├── api/
│       ├── auth/
│       ├── theme/
│       └── i18n/
├── vite.config.ts
└── package.json
```

도메인 간 import는 가능하면 `features/<domain>/index.ts`를 통해 노출된 API만 사용한다.

---

## 3. Frontend 절대 규칙

1. TypeScript strict를 유지한다. `any`는 금지하고 `unknown` + narrow를 사용한다.
2. 모든 API 호출은 `lib/api` 공통 client를 경유한다. 컴포넌트나 hook에서 `fetch`/`axios`를 직접 호출하지 않는다.
3. API layer는 `ApiResult<T>` envelope 전체를 파싱한다. `success === true`일 때만 `data`를 사용하고 실패는 `ApiError`로 변환해 throw한다.
4. Domain data fallback을 만들지 않는다. `apiModel.user_name || 'Unknown'`, `data?.total ?? 0`처럼 API가 주지 않은 값을 조용히 생성하지 않는다.
5. i18n `defaultValue`는 번역 fallback으로 허용한다. domain data fallback과 혼동하지 않는다.
6. 단건 조회는 `useQuery`, 목록/등록/수정/삭제/상태 변경은 `useMutation`을 사용한다.
7. ErrorCode 처리 계층은 [`../context/error.md`](../context/error.md)를 따른다.
8. MUI는 design token을 우선 사용한다. 색상/spacing 하드코딩을 피하고 [`../docs/02-design/design-system.md`](../docs/02-design/design-system.md)를 확인한다.
9. 사용자에게 보이는 텍스트는 i18n key를 사용한다. 컴포넌트에 한국어/영어 raw text를 박지 않는다.
10. 모든 화면은 다크 모드를 함께 설계한다. 색상은 항상 CSS 변수 / MUI theme token으로만 표현하고, 라이트/다크 두 팔레트에서 WCAG AA 대비비를 충족한다. PR에 라이트 + 다크 스크린샷을 함께 첨부하고, 테마는 `prefers-color-scheme` 감지 + 사용자 토글(localStorage)을 둘 다 지원한다.

---

## 4. API / Query 패턴

```ts
async function fetchLeave(id: string): Promise<Leave> {
  const res = await http.get<ApiResult<Leave>>(`/api/leave/${id}`);

  if (!res.data.success) {
    throw new ApiError({
      code: mapStatusToErrorCode(res.status),
      message: res.data.message ?? '',
      errorCode: res.data.details?.errorCode,
      fields: res.data.details?.fields,
    });
  }

  if (res.data.data === null) {
    throw new ApiError({ code: 'INVALID_RESPONSE', message: 'data is null' });
  }

  return res.data.data;
}
```

- Query key는 도메인별 factory 함수로 만든다.
- mutation 성공 후 관련 query를 invalidate한다.
- `VALIDATION_FAILED`의 `fields[]`는 React Hook Form `setError`로 매핑한다.
- 401은 global interceptor, 404는 route/page, 409는 mutation hook, 5xx는 global toast 또는 mutation hook에서 처리한다.

---

## 5. UI 구현 기준

- 기존 MUI theme, component variant, spacing scale을 먼저 확인한다.
- 카드 중첩, 과한 hero/marketing layout, 설명문 중심 화면을 피하고 실제 업무 흐름을 첫 화면에 둔다.
- 버튼에는 가능한 한 의미 있는 icon을 함께 사용한다.
- 모바일/데스크톱에서 텍스트가 버튼, 카드, 테이블 셀 밖으로 넘치지 않게 한다.
- 표/목록/폼은 반복 업무에 맞게 조밀하지만 읽기 쉽게 구성한다.

---

## 6. 테스트 / 검증

**TDD 강제** ([`../AGENTS.md`](../AGENTS.md) §3.11). 실패하는 테스트를 먼저 commit, 그 다음 구현을 별도 commit한다. 신규 컴포넌트/hook/Zod schema는 테스트 없이 머지 불가. coverage 목표 `features/*` ≥ 80%, critical path 100%.

Frontend 변경 후 가능한 검증:

```bash
tsc --noEmit
eslint .
bun test --coverage
```

프로젝트가 pnpm을 쓰면 기존 script에 맞춰 `pnpm test` 등으로 실행한다.

- Component test는 React Testing Library + MSW를 사용한다.
- Mock 응답은 항상 `ApiResult` envelope shape를 따른다.
- 검증 실패 시나리오(`VALIDATION_FAILED` + `fields[]`)를 주요 form에 최소 1개 포함한다.

---

## 7. 작업별 참조

| 작업 | 추가 참조 |
|------|-----------|
| 새 페이지 / 라우트 | `src/routes/` React Router v7 정의, `../docs/02-design/wireframes/` |
| API 연동 | `../context/api.md`, `../context/error.md` |
| 디자인 시스템 적용 | `../docs/02-design/design-system.md` |
| 결재 UI 흐름 | `../docs/01-plan/features/hr-platform.plan.md` |
| 폼 검증 | RHF + Zod, `../context/error.md` |
| 캘린더 | wireframes, plan.md 휴가 가시성 정책 |
