import { emitAuthExpired, tokenStorage } from '../auth';
import { ApiError } from './error';
import type { ApiResult } from './types';

export interface HttpClient {
  get<T>(url: string, init?: RequestInit): Promise<T>;
  post<T>(url: string, body?: unknown, init?: RequestInit): Promise<T>;
}

// ---- internal: refresh single-flight ----
//
// 여러 요청이 동시에 TOKEN_EXPIRED 를 받으면 refresh 가 동시에 N 회 호출될 수 있다.
// BE 의 refresh 토큰은 1회용 회전이라 동시 호출 시 두 번째부터 실패한다.
// → 진행 중 refresh 가 있으면 그 Promise 를 모두 공유한다.
let refreshInFlight: Promise<string> | null = null;

async function performRefresh(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refresh = tokenStorage.getRefresh();
    if (refresh === null || refresh === '') {
      throw new ApiError({
        status: 401,
        message: 'no refresh token',
        errorCode: 'UNAUTHENTICATED',
      });
    }

    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });

    let envelope: ApiResult<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }>;
    try {
      envelope = (await res.json()) as ApiResult<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
      }>;
    } catch {
      throw new ApiError({
        status: res.status,
        message: 'invalid refresh response',
        errorCode: 'INVALID_RESPONSE',
      });
    }

    if (!envelope.success || envelope.data === null) {
      throw new ApiError({
        status: res.status,
        message: envelope.message ?? 'refresh failed',
        errorCode: envelope.details?.errorCode ?? 'UNAUTHENTICATED',
        fields: envelope.details?.fields,
        traceId: envelope.details?.traceId,
      });
    }

    tokenStorage.set(envelope.data.accessToken, envelope.data.refreshToken);
    return envelope.data.accessToken;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

interface RequestInternalInit extends RequestInit {
  _retry?: boolean;
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
  init: RequestInternalInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const access = tokenStorage.getAccess();
  if (access && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${access}`);
  }

  const res = await fetch(url, {
    ...init,
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });

  let envelope: ApiResult<T>;
  try {
    envelope = (await res.json()) as ApiResult<T>;
  } catch {
    throw new ApiError({
      status: res.status,
      message: 'invalid JSON response',
      errorCode: 'INVALID_RESPONSE',
    });
  }

  // 401 + TOKEN_EXPIRED → 자동 refresh 후 1회 재시도.
  // _retry 가 이미 true 면 재시도조차 실패한 것 — 재귀 차단.
  if (
    res.status === 401 &&
    envelope.details?.errorCode === 'TOKEN_EXPIRED' &&
    !init._retry
  ) {
    try {
      await performRefresh();
    } catch {
      tokenStorage.clear();
      emitAuthExpired();
      throw new ApiError({
        status: 401,
        message: '로그인이 필요합니다.',
        errorCode: 'UNAUTHENTICATED',
      });
    }
    return request<T>(method, url, body, { ...init, _retry: true });
  }

  // 401 (TOKEN_EXPIRED 아님) — refresh 시도 불가, 토큰 폐기 + auth expired 알림.
  // INVALID_CREDENTIALS 같은 400 은 폼이 처리하므로 별개.
  if (res.status === 401 && !envelope.success) {
    tokenStorage.clear();
    emitAuthExpired();
  }

  if (!envelope.success) {
    throw new ApiError({
      status: res.status,
      message: envelope.message ?? '',
      errorCode: envelope.details?.errorCode,
      fields: envelope.details?.fields,
      traceId: envelope.details?.traceId,
    });
  }

  if (envelope.data === null) {
    throw new ApiError({
      status: res.status,
      message: 'data is null in success response',
      errorCode: 'INVALID_RESPONSE',
    });
  }

  return envelope.data;
}

export const http: HttpClient = {
  get: <T>(url: string, init?: RequestInit) =>
    request<T>('GET', url, undefined, init),
  post: <T>(url: string, body?: unknown, init?: RequestInit) =>
    request<T>('POST', url, body, init),
};
