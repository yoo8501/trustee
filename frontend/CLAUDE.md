# DocFlow Frontend (React 19 + Vite + MUI)

> 본 파일은 frontend stack 라우터. 루트 [`../CLAUDE.md`](../CLAUDE.md) §3 공통 절대 규칙은 항상 우선한다.
> 공유 contract: [`../context/api.md`](../context/api.md), [`../context/error.md`](../context/error.md).

---

## 1. 기술 스택

- **언어/프레임워크**: TypeScript (strict) + React 19
- **빌드/번들러**: Vite (SPA — SSR/SSG 미사용. 서버는 Go API 단독)
- **라우팅**: React Router v7 (declarative mode, 브라우저 history)
- **UI**: MUI (Material-UI) + Emotion
- **서버 상태**: TanStack Query (React Query) — API fetch / cache / mutation 전담
- **클라이언트 전역 상태**: React Context 우선. 다음 신호 중 하나 이상 발생 시 **Zustand** 도입:
  - Provider 중첩이 4개 이상으로 늘어남
  - 같은 Context를 구독하는 컴포넌트가 많아 불필요한 리렌더가 측정됨
  - selector / partial subscribe가 필요해짐
- **폼**: React Hook Form + Zod
- **테스트**: Vitest + React Testing Library + MSW
- **i18n**: i18next + react-i18next — `defaultValue` 패턴 (§5)
- **패키지 매니저**: bun 또는 pnpm

API 호스팅은 Go 백엔드가 단독. 프론트는 정적 자산(Vite `dist/`)으로 빌드되어 reverse proxy (Caddy / Traefik) 가 `/` → SPA, `/api/*` → Go 백엔드로 라우팅한다.

---

## 2. 디렉토리 규칙 (제안)

```
frontend/
├── index.html                 Vite entry HTML
├── src/
│   ├── main.tsx               createRoot + Router 부트스트랩
│   ├── App.tsx                Router 트리 + Provider 합성
│   ├── routes/                React Router 라우트 정의 + 페이지 (login.tsx, attendance.tsx 등)
│   ├── components/            재사용 컴포넌트 (MUI 기반)
│   ├── features/              도메인별 UI (leave/, approval/, attendance/, calendar/)
│   │   └── <domain>/
│   │       ├── api/           API client + ApiResult parser
│   │       ├── hooks/         useQuery / useMutation
│   │       ├── components/    feature 전용 컴포넌트
│   │       └── types.ts       Zod schema + 추론 타입
│   └── lib/
│       ├── api/               http client, ApiResult parser, ApiError
│       ├── auth/              JWT 저장/refresh
│       ├── theme/             MUI theme (라이트 + 다크) + design token 매핑
│       └── i18n/              resolveErrorMessage 등
├── vite.config.ts
└── package.json
```

도메인 간 import는 `features/<domain>/index.ts` 통해서만 (boundary).

---

## 3. 절대 규칙 (Frontend 한정)

1. **TypeScript strict 모드**. `any` 금지 (필요 시 `unknown` + narrow).
2. **모든 API 호출은 `lib/api` 의 공통 client 경유**. `fetch` / `axios` 직접 사용 금지.
3. **envelope 전체를 parsing**해서 `data` 추출. `success === true` 일 때만 사용. 실패는 `ApiError` throw.
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
     if (res.data.data === null) throw new ApiError({ code: 'INVALID_RESPONSE', message: 'data is null' });
     return res.data.data;
   }
   ```
4. **Domain data fallback 생성 금지** — `apiModel.user_name || 'Unknown'`, `data?.total ?? 0` ❌. API가 반환하지 않은 값을 임의 생성하면 silent drift. UI에서 null/undefined로 분기.
   ```tsx
   // Bad
   const name = user?.name || 'Unknown';
   // Good
   return user?.name == null ? <EmptyState /> : <span>{user.name}</span>;
   ```
5. **i18n `defaultValue` 는 허용** (번역 fallback, domain data와 다름).
   ```ts
   t('user.greeting', { defaultValue: 'Hello' });  // ✅ 번역 정책
   ```
6. **단건 조회는 `useQuery`, 그 외(목록/등록/수정/삭제/상태 변경)는 `useMutation`** ([`../context/api.md`](../context/api.md) §3 HTTP method 규칙).
7. **에러 처리 계층** ([`../context/error.md`](../context/error.md) §2):
   - 400 `VALIDATION_FAILED` → form/mutation hook에서 `fields[]` → `setError` 매핑
   - 401 → global interceptor (login flow)
   - 403/409/5xx → mutation hook 또는 global toast
   - 404 → route/page에서 not found 화면
8. **MUI 컴포넌트 사용 시 design token만 참조**. 하드코딩 색상/spacing 금지 ([`../docs/02-design/design-system.md`](../docs/02-design/design-system.md)).
9. **사용자에게 보여줄 텍스트는 i18n key만**. 한국어/영어 raw text를 component에 hardcode 금지.
10. **모든 화면은 다크 모드를 전제로 설계한다**.
    - 색상은 항상 CSS 변수 / MUI theme token으로 표현 (`var(--surface)`, `theme.palette.background.paper`). raw hex 금지.
    - 라이트/다크 두 팔레트 모두에서 대비비 WCAG AA (본문 4.5:1, 큰 텍스트 3:1) 통과.
    - 캘린더 휴가 종류 색상처럼 학습 누적 토큰은 두 모드에서 hue를 유지하고 밝기만 보정 (light: 600 saturation, dark: 300 saturation 기준).
    - 새 컴포넌트 PR은 라이트 + 다크 스크린샷을 함께 제출.
    - `prefers-color-scheme` 자동 감지 + 사용자 토글 (localStorage 저장) 둘 다 지원. `<html data-theme="dark">` 패턴 사용.
    - shadow, border, divider는 다크에서 별도 토큰으로 분기 (light 그림자 그대로 쓰면 가라앉음).

---

## 4. UX 원칙 (PR 자가 점검 체크리스트)

> 매일 쓰는 사내 도구라 **사용자 편의성이 핵심 정당성**([`../docs/01-plan/features/hr-platform.plan.md`](../docs/01-plan/features/hr-platform.plan.md) §Problem Statement). 철학·근거·측정 지표는 [`../DESIGN.md`](../DESIGN.md) §사용자 편의성 원칙. **본 섹션은 PR 차단 조건**.

PR 올리기 전 9항목 모두 자가 점검. 위반 시 머지 불가.

- [ ] **즉각 피드백** — 거의 실패하지 않는 액션 (출퇴근 / 휴가 취소 / 알림 읽음)은 **TanStack Query optimistic update** 사용. 실패 시 `onError`에서 1초 안 원복 + warn toast.
- [ ] **실수 복구** — 비파괴 액션은 5초 Undo (`useUndoableMutation` 헬퍼). 폼 입력은 **localStorage draft (24h TTL)**, 제출 성공 시 clear.
- [ ] **에러 예방** — 잔여 부족 / 중복 / 검증 실패는 **폼 단계에서 차단** (Zod `superRefine` + RHF `disabled`). 서버 reject 의존 금지. 비활성 버튼 옆에 이유 inline.
- [ ] **합리적 기본값** — 휴가 종류 = 가장 자주 쓰는 것, 휴가 기간 = **다음 영업일** (오늘 X), 결재 사유 = placeholder만.
- [ ] **Time-to-action** — 대시보드 LCP ≤ 1.5s (Lighthouse CI 체크), 출근 클릭 반영 ≤ 100ms (옵티미스틱 패턴 강제), 휴가 신청 폼 30s 안에 제출 가능한 입력 수.
- [ ] **키보드 단축키** — 폼 제출 `Cmd/Ctrl+Enter`, 출퇴근 `Enter`/`Space`, 닫기 `Esc`. 모든 인터랙티브 요소 `tabindex` + focus visible.
- [ ] **모바일 thumb zone** — 주요 액션 버튼은 `position: sticky bottom` 또는 화면 하단 1/3 영역. 데스크탑에선 자연 위치.
- [ ] **자동 저장 / 기억** — 휴가 사유 draft, 캘린더 마지막 뷰, 테마, 사이드바 접힘 상태 모두 `localStorage` 또는 `sessionStorage` 저장.
- [ ] **결과 명확화** — 모든 mutation 성공/실패 후 toast로 **무엇이 일어났는지 + 다음 단계** 안내 (`"휴가 신청됨 — 팀장에게 알림 전송"`). 침묵 금지. 1초 넘는 작업은 spinner, 3초 넘으면 진행 메시지.

**자주 위반되는 안티-패턴**: 클릭 후 spinner 지각 / 같은 액션의 위치 불일치 / 실수 비용 낮은데 "정말 하시겠습니까?" 남발 / 페이지 이동 시 입력 사라짐 / 잔여 0인데 신청 버튼 활성. 상세 목록은 [`../DESIGN.md`](../DESIGN.md) §안티-패턴.

---

## 5. TanStack Query 패턴

- Query key는 도메인별 factory 함수 (`leaveKeys.detail(id)`, `leaveKeys.list(filter)`).
- 단건 조회: `useQuery({ queryKey, queryFn })`.
- 변경 작업: `useMutation({ mutationFn, onError, onSuccess })` + `queryClient.invalidateQueries`.
- 페이지네이션은 `useQuery` + `keepPreviousData: true` 또는 `useInfiniteQuery`.
- mutation의 onError에서 `ApiError.errorCode` 기반 i18n 매핑 + form field error 처리.

---

## 6. 에러 메시지 i18n 매핑

```ts
function resolveErrorMessage(error: ApiError, t: TFunction): string {
  if (error.errorCode) {
    return t(`error.${error.errorCode}`, { defaultValue: error.message ?? '' });
  }
  return error.message ?? t('error.unknown');
}

// Validation 매핑 (React Hook Form)
const onError = (error: ApiError) => {
  if (error.errorCode === 'VALIDATION_FAILED' && error.fields) {
    error.fields.forEach(({ field, reason }) => {
      formApi.setError(field, { type: reason, message: t(`error.field.${field}.${reason}`) });
    });
    return;
  }
  showErrorToast(resolveErrorMessage(error, t));
};
```

`t(..., { defaultValue })` 는 **번역 fallback**으로 허용. domain data fallback과 혼동 금지 (§3.4).

---

## 7. 테스트 규칙

### TDD 강제 ([`../CLAUDE.md`](../CLAUDE.md) §3.11)

- **Red → Green → Refactor**. 실패하는 테스트를 먼저 commit, 그 후 구현을 별도 commit. PR review 시 commit 순서로 검증.
- 신규 컴포넌트 / hook / API client / Zod schema / reducer 모두 테스트 없는 PR 차단.
- 버그 수정: 버그를 재현하는 실패 테스트 먼저 → fail 확인 → fix → green.
- Coverage 목표: `features/*` ≥ **80%**, 결재 흐름 / 권한 분기 / 옵티미스틱 update 롤백 / 라우트 가드는 100%.
- TDD 작성 단계별 권장:
  1. **Zod schema + 타입** 테스트 먼저 (validation 케이스 5개 — 정상/필수누락/타입오류/길이초과/도메인규칙).
  2. **TanStack Query hook** 테스트 (success / 401 refresh / 4xx error / 5xx retry).
  3. **컴포넌트** 테스트 (5 상태 모두: Loading / Empty / Error / Success / Partial).
  4. **E2E** (Playwright)는 critical path에만.

### 인프라

- `bun test` 또는 `pnpm test` (Vitest) 통과. `tsc --noEmit`, ESLint 통과.
- Component test: React Testing Library + MSW 로 API mock. Mock 응답은 항상 `ApiResult` envelope shape.
- 검증 실패 시나리오 (`VALIDATION_FAILED` + `fields[]`) 테스트 1개 이상.
- 라우터 의존 컴포넌트는 `<MemoryRouter>` (React Router v7) 로 감싼다.
- E2E는 Playwright (선택). 핵심 골든 패스(로그인 → 휴가 신청 → 결재 승인) 우선.

---

## 8. 작업별 추가 참고

| 작업 | 추가 문서 |
|------|----------|
| 새 페이지 / 라우트 | `src/routes/` + React Router v7 routes 정의 + `../docs/02-design/wireframes/` |
| API 연동 | `../context/api.md`, `../context/error.md` |
| 디자인 시스템 적용 | `../docs/02-design/design-system.md` |
| 결재 UI 흐름 | `../docs/01-plan/features/hr-platform.plan.md` (권한 매트릭스) |
| 폼 검증 | RHF + Zod schema, `../context/error.md` §1 `VALIDATION_FAILED` |
| 캘린더 컴포넌트 | `../docs/02-design/wireframes/`, plan.md (휴가 가시성 정책) |
