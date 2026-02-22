"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ApiError, NetworkError, TimeoutError } from "@/lib/api/client";
import { useToast } from "@/hooks/useToast";

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
    showError(error.message);
    return;
  }

  console.error("Unhandled error:", error);
  showError("오류가 발생했습니다.");
}

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

export function QueryProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [queryClient] = useState(() => makeQueryClient(toast.error));

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
