import { http as httpMsw, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { server } from '../../test/msw-server';
import { ApiError } from './error';
import { http } from './http';
import type { ApiResult } from './types';

const TEST_URL = 'http://localhost/api/test';

function successEnvelope<T>(data: T): ApiResult<T> {
  return { success: true, data, message: 'ok', details: null, total: null };
}

function failureEnvelope(
  errorCode: string,
  message = 'fail',
  fields?: { field: string; reason: string }[],
): ApiResult<null> {
  return {
    success: false,
    data: null,
    message,
    details: { errorCode, fields },
    total: null,
  };
}

describe('http client', () => {
  afterEach(() => server.resetHandlers());

  it('성공 envelope이면 data만 반환한다', async () => {
    server.use(
      httpMsw.get(TEST_URL, () =>
        HttpResponse.json(successEnvelope({ status: 'ok' })),
      ),
    );
    const data = await http.get<{ status: string }>(TEST_URL);
    expect(data).toEqual({ status: 'ok' });
  });

  it('실패 envelope이면 ApiError로 throw하고 status/errorCode/fields를 채운다', async () => {
    server.use(
      httpMsw.post(TEST_URL, () =>
        HttpResponse.json(
          failureEnvelope('VALIDATION_FAILED', '입력값을 확인해 주세요', [
            { field: 'email', reason: 'required' },
          ]),
          { status: 400 },
        ),
      ),
    );

    await expect(http.post(TEST_URL, { a: 1 })).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      errorCode: 'VALIDATION_FAILED',
      message: '입력값을 확인해 주세요',
      fields: [{ field: 'email', reason: 'required' }],
    });
  });

  it('success:true 인데 data:null 이면 INVALID_RESPONSE로 throw한다', async () => {
    server.use(
      httpMsw.get(TEST_URL, () =>
        HttpResponse.json({
          success: true,
          data: null,
          message: 'ok',
          details: null,
          total: null,
        } satisfies ApiResult<unknown>),
      ),
    );

    await expect(http.get(TEST_URL)).rejects.toMatchObject({
      name: 'ApiError',
      errorCode: 'INVALID_RESPONSE',
    });
  });

  it('JSON 파싱 실패도 ApiError로 변환된다', async () => {
    server.use(
      httpMsw.get(TEST_URL, () =>
        HttpResponse.text('<<not json>>', { status: 502 }),
      ),
    );

    const err = await http.get(TEST_URL).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).errorCode).toBe('INVALID_RESPONSE');
    expect((err as ApiError).status).toBe(502);
  });
});
