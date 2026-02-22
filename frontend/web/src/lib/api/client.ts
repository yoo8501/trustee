const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  params?: Record<string, string | number | undefined>;
  timeout?: number;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      });
    }
    return url.toString();
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { body, params, timeout = 30000, ...init } = options;

    const url = this.buildUrl(path, params);

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

      if (response.status === 401) {
        // 인증 관련 API 또는 인증 페이지에서는 리다이렉트 하지 않음
        const isAuthApi = path.startsWith("/api/auth/");
        const authPages = ["/login", "/signup", "/forgot-password", "/reset-password"];
        const isAuthPage = typeof window !== "undefined" && authPages.some((p) => window.location.pathname.startsWith(p));
        if (typeof window !== "undefined" && !isAuthApi && !isAuthPage) {
          window.location.href = "/login?expired=true";
        }
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

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new TimeoutError(url);
      }

      if (error instanceof TypeError) {
        throw new NetworkError("서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요.", error);
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>(path, { method: "GET", params });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: "POST", body });
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: "PATCH", body });
  }

  async delete(path: string): Promise<void> {
    return this.request(path, { method: "DELETE" });
  }

  async uploadFiles<T>(path: string, files: File[]): Promise<T> {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    const url = this.buildUrl(path);
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const message = errorBody?.error?.message || `HTTP ${response.status}`;
      throw new ApiError(message, response.status, errorBody?.error?.code);
    }

    return response.json();
  }
}

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
  constructor(message: string, public cause?: Error) {
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

export const apiClient = new ApiClient(API_BASE_URL);
