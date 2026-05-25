import { describe, expect, it } from 'vitest';
import { ApiError } from './error';

describe('ApiError', () => {
  it('생성자에 전달한 필드를 모두 보존한다', () => {
    const err = new ApiError({
      status: 400,
      message: '입력값을 확인해 주세요',
      errorCode: 'VALIDATION_FAILED',
      fields: [{ field: 'email', reason: 'required' }],
      traceId: 'abc-123',
    });

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
    expect(err.message).toBe('입력값을 확인해 주세요');
    expect(err.status).toBe(400);
    expect(err.errorCode).toBe('VALIDATION_FAILED');
    expect(err.fields).toEqual([{ field: 'email', reason: 'required' }]);
    expect(err.traceId).toBe('abc-123');
  });

  it('선택 필드는 undefined로 남는다', () => {
    const err = new ApiError({ status: 500, message: 'boom' });
    expect(err.errorCode).toBeUndefined();
    expect(err.fields).toBeUndefined();
    expect(err.traceId).toBeUndefined();
  });
});
