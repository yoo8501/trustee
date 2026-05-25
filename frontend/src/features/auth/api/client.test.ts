import { http as httpMsw, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tokenStorage } from '../../../lib/auth';
import { server } from '../../../test/msw-server';
import type { ApiResult } from '../../../lib/api';
import { ApiError } from '../../../lib/api';
import { authApi } from './client';

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

describe('authApi', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
  });

  it('register — POST /api/auth/register 후 RegisteredUser 반환', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/auth/register', async () =>
        HttpResponse.json(
          ok({ id: 1, email: 'a@b.com', name: '홍길동' }),
          { status: 201 },
        ),
      ),
    );
    const u = await authApi.register({
      email: 'a@b.com',
      password: 'pw12345!',
      name: '홍길동',
    });
    expect(u).toEqual({ id: 1, email: 'a@b.com', name: '홍길동' });
  });

  it('register — EMAIL_DUPLICATE 는 ApiError 로 전파', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/auth/register', () =>
        HttpResponse.json(fail('EMAIL_DUPLICATE', '이미 등록'), { status: 400 }),
      ),
    );
    const err = await authApi
      .register({ email: 'dup@x.com', password: 'pw12345!', name: '중복' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).errorCode).toBe('EMAIL_DUPLICATE');
  });

  it('login — TokenPair 반환', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/auth/login', () =>
        HttpResponse.json(
          ok({
            accessToken: 'a1',
            refreshToken: 'r1',
            expiresIn: 3600,
            userId: 7,
            role: 'general',
          }),
        ),
      ),
    );
    const pair = await authApi.login({
      email: 'a@b.com',
      password: 'pw12345!',
    });
    expect(pair).toMatchObject({
      accessToken: 'a1',
      refreshToken: 'r1',
      userId: 7,
      role: 'general',
    });
  });

  it('login — INVALID_CREDENTIALS 는 ApiError (refresh 시도 없이 그대로)', async () => {
    server.use(
      httpMsw.post('http://localhost:3000/api/auth/login', () =>
        HttpResponse.json(fail('INVALID_CREDENTIALS', '불일치'), {
          status: 400,
        }),
      ),
    );
    const err = await authApi
      .login({ email: 'a@b.com', password: 'wrong' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).errorCode).toBe('INVALID_CREDENTIALS');
    expect((err as ApiError).status).toBe(400);
  });

  it('me — CurrentUser 반환', async () => {
    tokenStorage.set('a1', 'r1');
    server.use(
      httpMsw.get('http://localhost:3000/api/users/me', () =>
        HttpResponse.json(
          ok({
            id: 7,
            email: 'a@b.com',
            name: '홍길동',
            status: 'active',
            role: 'general',
            teamId: null,
            managerId: null,
            hireDate: '2026-01-01',
          }),
        ),
      ),
    );
    const me = await authApi.me();
    expect(me.id).toBe(7);
    expect(me.role).toBe('general');
  });

  it('logout — POST /api/auth/logout 호출', async () => {
    tokenStorage.set('a1', 'r1');
    let called = false;
    server.use(
      httpMsw.post('http://localhost:3000/api/auth/logout', ({ request }) => {
        called = true;
        expect(request.headers.get('Authorization')).toBe('Bearer a1');
        return HttpResponse.json(ok({ status: 'ok' }));
      }),
    );
    const res = await authApi.logout();
    expect(called).toBe(true);
    expect(res.status).toBe('ok');
  });
});
