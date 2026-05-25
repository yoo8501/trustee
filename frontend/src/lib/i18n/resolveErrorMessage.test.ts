import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import i18n from './index';
import { resolveErrorMessage } from './resolveErrorMessage';

const t = i18n.getFixedT('ko');

describe('resolveErrorMessage', () => {
  it('ApiError.errorCode가 있으면 error.<code> 키로 번역한다', () => {
    const msg = resolveErrorMessage(
      new ApiError({
        status: 400,
        message: 'raw server msg',
        errorCode: 'VALIDATION_FAILED',
      }),
      t,
    );
    expect(msg).toBe('입력값을 확인해 주세요');
  });

  it('번역 키가 없으면 서버 message로 fallback한다', () => {
    const msg = resolveErrorMessage(
      new ApiError({
        status: 418,
        message: 'I am a teapot',
        errorCode: 'TEAPOT_UNDEFINED_CODE',
      }),
      t,
    );
    expect(msg).toBe('I am a teapot');
  });

  it('일반 Error는 message를 그대로 노출한다', () => {
    const msg = resolveErrorMessage(new Error('boom'), t);
    expect(msg).toBe('boom');
  });

  it('알 수 없는 입력은 error.unknown 키로 fallback한다', () => {
    const msg = resolveErrorMessage(undefined, t);
    expect(msg).toBe('알 수 없는 오류가 발생했어요');
  });
});
