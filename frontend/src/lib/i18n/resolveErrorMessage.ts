import type { TFunction } from 'i18next';
import { ApiError } from '../api';

/**
 * context/error.md §4 — ErrorCode를 i18n 키로 매핑한다.
 * 1) error.errorCode가 있으면 `error.<code>` 키 우선
 * 2) defaultValue로 서버 message fallback (i18n 번역 fallback은 허용 — CLAUDE.md §3.5)
 * 3) 둘 다 없으면 `error.unknown`
 */
export function resolveErrorMessage(
  error: unknown,
  t: TFunction,
): string {
  if (error instanceof ApiError) {
    if (error.errorCode) {
      return t(`error.${error.errorCode}`, {
        defaultValue: error.message || t('error.unknown'),
      });
    }
    return error.message || t('error.unknown');
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return t('error.unknown');
}
