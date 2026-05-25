import { ApiError } from './error';
import type { ApiResult } from './types';

export interface HttpClient {
  get<T>(url: string, init?: RequestInit): Promise<T>;
  post<T>(url: string, body?: unknown, init?: RequestInit): Promise<T>;
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
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
