/**
 * http 401 interceptor 테스트.
 *
 * Sprint 2 — TOKEN_EXPIRED 응답이 오면 자동으로 /api/auth/refresh 를 호출해
 * 새 access 를 발급받고 원 요청을 1회 재시도한다. refresh 실패 시 tokens 를 clear 하고
 * `docflow:auth:expired` 커스텀 이벤트를 발행한다.
 */
import { http as httpMsw, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_EXPIRED_EVENT, tokenStorage } from '../auth';
import { server } from '../../test/msw-server';
import { ApiError } from './error';
import { http } from './http';
import type { ApiResult } from './types';

const TEST_URL = 'http://localhost:3000/api/protected';
const REFRESH_URL = 'http://localhost:3000/api/auth/refresh';

function ok<T>(data: T): ApiResult<T> {
  return { success: true, data, message: 'ok', details: null, total: null };
}

function fail(code: string, message = 'fail'): ApiResult<null> {
  return {
    success: false,
    data: null,
    message,
    details: { errorCode: code },
    total: null,
  };
}

describe('http interceptor — token attach + 401 refresh', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
  });

  it('access token 있으면 Authorization 헤더에 Bearer 로 첨부', async () => {
    tokenStorage.set('access-X', 'refresh-X');
    let seenAuth: string | null = null;
    server.use(
      httpMsw.get(TEST_URL, ({ request }) => {
        seenAuth = request.headers.get('Authorization');
        return HttpResponse.json(ok({ id: 1 }));
      }),
    );

    await http.get<{ id: number }>(TEST_URL);
    expect(seenAuth).toBe('Bearer access-X');
  });

  it('TOKEN_EXPIRED 응답 → /api/auth/refresh 호출 → 새 access 로 재시도 → 성공', async () => {
    tokenStorage.set('old-access', 'good-refresh');
    let callCount = 0;
    let refreshBody: { refreshToken: string } | null = null;
    let secondAuth: string | null = null;

    server.use(
      httpMsw.get(TEST_URL, ({ request }) => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(fail('TOKEN_EXPIRED', '만료'), {
            status: 401,
          });
        }
        secondAuth = request.headers.get('Authorization');
        return HttpResponse.json(ok({ id: 99 }));
      }),
      httpMsw.post(REFRESH_URL, async ({ request }) => {
        refreshBody = (await request.json()) as { refreshToken: string };
        return HttpResponse.json(
          ok({
            accessToken: 'new-access',
            refreshToken: 'new-refresh',
            expiresIn: 3600,
          }),
        );
      }),
    );

    const result = await http.get<{ id: number }>(TEST_URL);
    expect(result).toEqual({ id: 99 });
    expect(callCount).toBe(2);
    expect(refreshBody).toEqual({ refreshToken: 'good-refresh' });
    expect(secondAuth).toBe('Bearer new-access');
    expect(tokenStorage.getAccess()).toBe('new-access');
    expect(tokenStorage.getRefresh()).toBe('new-refresh');
  });

  it('TOKEN_EXPIRED 인데 refresh 도 실패 → 토큰 clear + auth:expired 이벤트 + ApiError throw', async () => {
    tokenStorage.set('old-access', 'bad-refresh');
    const expiredListener = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, expiredListener);

    server.use(
      httpMsw.get(TEST_URL, () =>
        HttpResponse.json(fail('TOKEN_EXPIRED'), { status: 401 }),
      ),
      httpMsw.post(REFRESH_URL, () =>
        HttpResponse.json(fail('UNAUTHENTICATED', '리프레시 무효'), {
          status: 401,
        }),
      ),
    );

    await expect(http.get(TEST_URL)).rejects.toBeInstanceOf(ApiError);
    expect(tokenStorage.getAccess()).toBeNull();
    expect(tokenStorage.getRefresh()).toBeNull();
    expect(expiredListener).toHaveBeenCalled();
    window.removeEventListener(AUTH_EXPIRED_EVENT, expiredListener);
  });

  it('refresh token 자체가 없는데 TOKEN_EXPIRED → 즉시 실패 + 이벤트', async () => {
    // access 만 있고 refresh 가 없는 비정상 상황
    window.localStorage.setItem('docflow-access-token', 'a');
    const expiredListener = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, expiredListener);

    server.use(
      httpMsw.get(TEST_URL, () =>
        HttpResponse.json(fail('TOKEN_EXPIRED'), { status: 401 }),
      ),
    );

    await expect(http.get(TEST_URL)).rejects.toBeInstanceOf(ApiError);
    expect(expiredListener).toHaveBeenCalled();
    window.removeEventListener(AUTH_EXPIRED_EVENT, expiredListener);
  });

  it('INVALID_CREDENTIALS (400) 는 refresh 시도하지 않고 그대로 throw — 로그인 폼이 처리', async () => {
    server.use(
      httpMsw.post(TEST_URL, () =>
        HttpResponse.json(fail('INVALID_CREDENTIALS', '잘못된 자격'), {
          status: 400,
        }),
      ),
    );

    const err = await http
      .post(TEST_URL, { email: 'a', password: 'b' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).errorCode).toBe('INVALID_CREDENTIALS');
    expect((err as ApiError).status).toBe(400);
  });

  it('UNAUTHENTICATED (401, TOKEN_EXPIRED 아님) — refresh 시도 없이 그대로 throw + 이벤트', async () => {
    tokenStorage.set('a', 'r');
    const expiredListener = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, expiredListener);

    server.use(
      httpMsw.get(TEST_URL, () =>
        HttpResponse.json(fail('UNAUTHENTICATED'), { status: 401 }),
      ),
    );

    await expect(http.get(TEST_URL)).rejects.toBeInstanceOf(ApiError);
    expect(tokenStorage.getAccess()).toBeNull();
    expect(expiredListener).toHaveBeenCalled();
    window.removeEventListener(AUTH_EXPIRED_EVENT, expiredListener);
  });

  it('동시 401 두 건 → refresh 는 한 번만 호출되고 두 요청 모두 재시도된다 (single-flight)', async () => {
    tokenStorage.set('old', 'r');
    let refreshCount = 0;
    let firstCall = 0;
    let secondCall = 0;
    const FIRST = 'http://localhost:3000/api/a';
    const SECOND = 'http://localhost:3000/api/b';

    server.use(
      httpMsw.get(FIRST, () => {
        firstCall += 1;
        if (firstCall === 1) {
          return HttpResponse.json(fail('TOKEN_EXPIRED'), { status: 401 });
        }
        return HttpResponse.json(ok({ which: 'a' }));
      }),
      httpMsw.get(SECOND, () => {
        secondCall += 1;
        if (secondCall === 1) {
          return HttpResponse.json(fail('TOKEN_EXPIRED'), { status: 401 });
        }
        return HttpResponse.json(ok({ which: 'b' }));
      }),
      httpMsw.post(REFRESH_URL, () => {
        refreshCount += 1;
        return HttpResponse.json(
          ok({
            accessToken: 'new-access',
            refreshToken: 'new-refresh',
            expiresIn: 3600,
          }),
        );
      }),
    );

    const [a, b] = await Promise.all([
      http.get<{ which: string }>(FIRST),
      http.get<{ which: string }>(SECOND),
    ]);
    expect(a.which).toBe('a');
    expect(b.which).toBe('b');
    expect(refreshCount).toBe(1);
  });
});
