# Design: 프론트엔드-백엔드 통신 에러 처리 통합

## 1. 아키텍처 개요

### 1.1 에러 처리 3계층

```
┌─────────────────────────────────────────────────────┐
│  Layer 3: UI (사용자에게 보여주는 에러)               │
│  ┌─ ToastProvider (전역 Snackbar)                   │
│  ├─ error.tsx (Error Boundary - 렌더링 에러)         │
│  └─ 페이지별 인라인 에러 (폼 유효성 등)               │
├─────────────────────────────────────────────────────┤
│  Layer 2: React Query (데이터 페칭 에러)             │
│  ┌─ QueryClient 전역 onError → Toast 자동 표시      │
│  ├─ retry: 네트워크 에러만 3회 재시도                 │
│  └─ Mutation onError → 전역 핸들러 위임              │
├─────────────────────────────────────────────────────┤
│  Layer 1: API Client (HTTP 통신 에러)                │
│  ┌─ 타임아웃 (AbortController, 30초)                │
│  ├─ 네트워크 에러 분류 (NetworkError)                │
│  ├─ 401 → 로그인 리다이렉트                          │
│  └─ 에러 응답 정규화 (ApiError)                      │
└─────────────────────────────────────────────────────┘
```

### 1.2 Provider 트리 (현재 → 변경 후)

```
// 현재
<ThemeProvider>
  <QueryProvider>          ← QueryClient 기본 설정
    <AuthProvider>
      {children}
    </AuthProvider>
  </QueryProvider>
</ThemeProvider>

// 변경 후
<ThemeProvider>
  <ToastProvider>            ← ★ 신규 (최상위 - 모든 곳에서 접근 가능)
    <QueryProvider>          ← ★ 수정 (전역 onError에서 Toast 호출)
      <AuthProvider>
        {children}
      </AuthProvider>
    </QueryProvider>
  </ToastProvider>
</ThemeProvider>
```

## 2. 상세 설계

### 2.1 API 클라이언트 개선

**파일**: `frontend/web/src/lib/api/client.ts`

#### 2.1.1 에러 클래스 확장

```typescript
// 기존 ApiError 유지 + 네트워크 에러 추가
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

export class TimeoutError extends Error {
  constructor(url: string) {
    super(`요청 시간이 초과되었습니다 (${url})`);
    this.name = "TimeoutError";
  }
}
```

#### 2.1.2 request 메서드 개선

```typescript
private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, timeout = 30000, ...init } = options;
  const url = this.buildUrl(path, params);

  // AbortController로 타임아웃 구현
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // 401 처리: 로그인 페이지로 리다이렉트
    if (response.status === 401) {
      window.location.href = "/login?expired=true";
      throw new ApiError("인증이 만료되었습니다. 다시 로그인해주세요.", 401, "UNAUTHORIZED");
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const message = errorBody?.error?.message || HTTP_STATUS_MESSAGES[response.status] || `HTTP ${response.status}`;
      throw new ApiError(message, response.status, errorBody?.error?.code);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;

    // AbortError → 타임아웃
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new TimeoutError(url);
    }

    // TypeError (네트워크 에러: 서버 다운, DNS 실패 등)
    if (error instanceof TypeError) {
      throw new NetworkError("서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요.", error);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

#### 2.1.3 HTTP 상태 메시지 맵

```typescript
const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: "잘못된 요청입니다.",
  403: "접근 권한이 없습니다.",
  404: "요청한 데이터를 찾을 수 없습니다.",
  409: "데이터 충돌이 발생했습니다.",
  422: "입력값을 확인해주세요.",
  429: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  500: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  502: "서버에 연결할 수 없습니다.",
  503: "서비스 점검 중입니다.",
};
```

### 2.2 전역 Toast 시스템

#### 2.2.1 ToastProvider

**파일**: `frontend/web/src/components/ToastProvider.tsx`

```typescript
"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

type ToastSeverity = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  message: string;
  severity: ToastSeverity;
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, severity: ToastSeverity) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, severity }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (message: string) => addToast(message, "success"),
    error: (message: string) => addToast(message, "error"),
    warning: (message: string) => addToast(message, "warning"),
    info: (message: string) => addToast(message, "info"),
  };

  // 현재 표시할 toast (큐의 첫 번째)
  const current = toasts[0];

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <Snackbar
        open={!!current}
        autoHideDuration={5000}
        onClose={() => current && removeToast(current.id)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {current ? (
          <Alert
            onClose={() => removeToast(current.id)}
            severity={current.severity}
            variant="filled"
            sx={{ width: "100%" }}
          >
            {current.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context.toast;
}
```

#### 2.2.2 useToast 훅 re-export

**파일**: `frontend/web/src/hooks/useToast.ts`

```typescript
"use client";

export { useToast } from "@/components/ToastProvider";
```

### 2.3 React Query 전역 에러 핸들링

**파일**: `frontend/web/src/components/QueryProvider.tsx`

```typescript
"use client";

import { QueryClient, QueryClientProvider, type Mutation } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ApiError, NetworkError, TimeoutError } from "@/lib/api/client";
import { useToast } from "@/hooks/useToast";

function makeQueryClient(showError: (msg: string) => void) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // 4xx 에러는 재시도 안 함
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            return false;
          }
          // 네트워크/타임아웃 에러만 3회 재시도
          return failureCount < 3;
        },
      },
      mutations: {
        onError: (error) => {
          handleGlobalError(error, showError);
        },
      },
    },
  });
}

function handleGlobalError(error: unknown, showError: (msg: string) => void) {
  // 401은 API 클라이언트에서 이미 리다이렉트 처리
  if (error instanceof ApiError && error.status === 401) return;

  if (error instanceof NetworkError) {
    showError("서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요.");
    return;
  }

  if (error instanceof TimeoutError) {
    showError("요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
    return;
  }

  if (error instanceof ApiError) {
    // 서버가 보내준 에러 메시지 그대로 표시
    showError(error.message);
    return;
  }

  // 알 수 없는 에러
  console.error("Unhandled error:", error);
  showError("오류가 발생했습니다.");
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [queryClient] = useState(() => makeQueryClient(toast.error));

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

**핵심 변경점**:
- `QueryProvider`가 `ToastProvider` 안에 있으므로 `useToast()` 사용 가능
- Mutation 에러는 전역 `onError`에서 자동 Toast 표시
- Query 에러는 재시도 후에도 실패하면 컴포넌트에서 `error` 상태로 처리
- 4xx 에러는 재시도 안 함 (의미 없음)

### 2.4 Next.js Error Boundary

#### 2.4.1 대시보드 Error Boundary

**파일**: `frontend/web/src/app/(dashboard)/error.tsx`

```typescript
"use client";

import Typography from "@mui/material/Typography";
import { Button, Box, colors } from "@trustee/ui";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "50vh",
        gap: 2,
        textAlign: "center",
      }}
    >
      <Typography variant="h5" color={colors.text.primary}>
        문제가 발생했습니다
      </Typography>
      <Typography variant="body1" color={colors.text.secondary}>
        {error.message || "페이지를 불러오는 중 오류가 발생했습니다."}
      </Typography>
      <Button variant="contained" onClick={reset}>
        다시 시도
      </Button>
    </Box>
  );
}
```

#### 2.4.2 글로벌 Error Boundary

**파일**: `frontend/web/src/app/error.tsx`

동일 구조, `minHeight: "100vh"` + 홈으로 이동 버튼 추가.

### 2.5 layout.tsx 수정

**파일**: `frontend/web/src/app/layout.tsx`

```typescript
// 변경: ToastProvider 추가
import { ToastProvider } from "@/components/ToastProvider";

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <ToastProvider>          {/* ★ 추가 */}
              <QueryProvider>
                <AuthProvider>{children}</AuthProvider>
              </QueryProvider>
            </ToastProvider>          {/* ★ 추가 */}
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
```

### 2.6 기존 페이지 에러 처리 정리

#### 변경 패턴

**Before** (각 페이지에서 직접 관리):
```typescript
const [snackbar, setSnackbar] = useState<string | null>(null);

const mutation = useMutation({
  onError: () => setSnackbar("저장에 실패했습니다."),
});

// ... JSX 아래에
<Snackbar open={!!snackbar} onClose={() => setSnackbar(null)}>
  <Alert severity="error">{snackbar}</Alert>
</Snackbar>
```

**After** (전역 Toast 위임):
```typescript
// snackbar state 제거, Snackbar JSX 제거
// mutation onError는 QueryProvider 전역 핸들러가 자동 처리

const mutation = useMutation({
  onSuccess: () => {
    toast.success("저장되었습니다.");  // 성공만 명시적으로 표시
  },
  // onError 제거 → 전역 핸들러가 서버 에러 메시지 자동 표시
});
```

#### 정리 대상 파일

| 파일 | 제거 항목 |
|------|----------|
| `inspections/checklists/[id]/page.tsx` | `snackbar` state, `setSnackbar` 5곳, `<Snackbar>` JSX |
| `checklist/[token]/page.tsx` | `snackbar` state, `setSnackbar` 3곳, `<Snackbar>` JSX |
| `inspections/checklists/new/page.tsx` | `catch` 블록의 `alert()` 호출 |
| `inspections/templates/new/page.tsx` | `catch` 블록의 `alert()` 호출 |

**주의**: 페이지별로 특화된 에러 메시지가 필요한 경우(예: 폼 유효성 검사)는 해당 페이지에서 `useToast()`를 직접 호출. 단, `useState`+`Snackbar` 패턴 대신 `toast.error()`만 호출.

## 3. 에러 처리 흐름 상세

### 3.1 Query 에러 흐름

```
useQuery → fetch → 에러 발생
  │
  ├─ NetworkError/TimeoutError → retry (3회)
  │    └─ 여전히 실패 → 컴포넌트의 error 상태
  │         └─ 페이지에서 error UI 표시 또는 Error Boundary 캐치
  │
  └─ ApiError (4xx/5xx) → retry 안 함 → 컴포넌트의 error 상태
       └─ 페이지에서 error UI 표시
```

Query 에러는 **전역 Toast를 표시하지 않음** (페이지에서 인라인 처리가 더 적합).

### 3.2 Mutation 에러 흐름

```
useMutation → fetch → 에러 발생
  │
  ├─ 401 → API 클라이언트에서 로그인 리다이렉트 (Toast 없음)
  │
  └─ 기타 에러 → QueryClient 전역 onError
       └─ handleGlobalError → toast.error(메시지)
```

Mutation 에러는 **전역 Toast가 자동 표시** (사용자 액션의 결과이므로 피드백 필수).

### 3.3 성공 알림 흐름

```
useMutation → onSuccess
  └─ 페이지에서 toast.success("저장되었습니다") 명시적 호출
```

성공 알림은 **전역 자동이 아님**. 각 페이지에서 필요시 `toast.success()` 호출.

## 4. 파일 변경 목록 (확정)

### 신규 파일 (4개)
| 파일 | 설명 |
|------|------|
| `frontend/web/src/components/ToastProvider.tsx` | 전역 Toast Context + Snackbar |
| `frontend/web/src/hooks/useToast.ts` | Toast 훅 re-export |
| `frontend/web/src/app/(dashboard)/error.tsx` | 대시보드 Error Boundary |
| `frontend/web/src/app/error.tsx` | 글로벌 Error Boundary |

### 수정 파일 (7개)
| 파일 | 변경 내용 |
|------|----------|
| `frontend/web/src/lib/api/client.ts` | NetworkError, TimeoutError 추가, 타임아웃, 401 리다이렉트, HTTP 메시지 맵 |
| `frontend/web/src/components/QueryProvider.tsx` | 전역 onError, retry 전략, useToast 연동 |
| `frontend/web/src/app/layout.tsx` | ToastProvider 래핑 |
| `frontend/web/src/hooks/index.ts` | useToast export 추가 |
| `frontend/web/src/app/(dashboard)/inspections/checklists/[id]/page.tsx` | snackbar 제거 → useToast 전환 |
| `frontend/web/src/app/checklist/[token]/page.tsx` | snackbar 제거 → useToast 전환 |
| `frontend/web/src/app/(dashboard)/inspections/checklists/new/page.tsx` | alert() 제거 → useToast 전환 |

## 5. 구현 순서

| 순서 | 작업 | 의존성 |
|------|------|--------|
| 1 | `ToastProvider.tsx` + `useToast.ts` 생성 | 없음 |
| 2 | `layout.tsx`에 ToastProvider 래핑 | 1 |
| 3 | `client.ts` 에러 클래스/타임아웃/401 개선 | 없음 |
| 4 | `QueryProvider.tsx` 전역 에러 핸들링 추가 | 1, 3 |
| 5 | `error.tsx` Error Boundary 2개 생성 | 없음 |
| 6 | 기존 페이지 snackbar/alert 정리 → useToast 전환 | 1, 2, 4 |
| 7 | `hooks/index.ts`에 useToast export 추가 | 1 |
