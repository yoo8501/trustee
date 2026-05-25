import { ApiError, type ApiResult } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import {
  CalendarResponseSchema,
  type CalendarResponse,
} from '../schemas';

/**
 * Calendar API client (Sprint 8).
 *
 * BE 라우트 (plan.md §캘린더 가시성):
 *   POST /api/hr/calendar/list  body: { from, to, scope? }
 *     - data: { leaves[], holidays[], attendances[] }
 *     - 휴가 사유는 권한 없으면 null 마스킹
 *     - from~to 최대 3개월 — 초과 시 400 + errorCode=DATE_RANGE_TOO_LARGE
 *
 * `lib/api/http.ts` 의 post 헬퍼를 쓰면 envelope 파싱은 되지만 BE 가 ApiResult shape
 * 그대로 돌려주므로 `postEnvelope` 형식의 직접 호출이 안전 (leaverequest client 와 동일 패턴).
 */

async function postEnvelope<T>(
  url: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const access = tokenStorage.getAccess();
  if (access) headers.Authorization = `Bearer ${access}`;

  const res = await fetch(url, {
    method: 'POST',
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
  return envelope;
}

export interface CalendarListRequest {
  from: string; // ISO date or datetime
  to: string;
  scope?: 'me' | 'team' | 'all';
}

export const calendarApi = {
  async list(req: CalendarListRequest): Promise<CalendarResponse> {
    const env = await postEnvelope<unknown>('/api/hr/calendar/list', req);
    if (env.data === null) {
      throw new ApiError({
        status: 500,
        message: 'calendar data is null',
        errorCode: 'INVALID_RESPONSE',
      });
    }
    const parsed = CalendarResponseSchema.safeParse(env.data);
    if (!parsed.success) {
      throw new ApiError({
        status: 500,
        message: `invalid calendar shape: ${parsed.error.message}`,
        errorCode: 'INVALID_RESPONSE',
      });
    }
    return parsed.data;
  },
};
