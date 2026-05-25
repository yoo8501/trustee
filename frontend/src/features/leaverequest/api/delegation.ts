import { http } from '../../../lib/api';
import type { ApiResult } from '../../../lib/api';
import { ApiError } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import {
  DelegationSchema,
  type CreateDelegationInput,
  type Delegation,
} from '../schemas';

/**
 * Delegation API client (Sprint 6).
 *
 * P1 에서는 본인이 본인의 위임만 CRUD. P2 에서 매니저가 부하 직원의 위임을 설정하는 기능 추가 예정.
 *
 * BE 라우트:
 *   - POST /api/hr/delegations/me/list — 내 활성 위임 목록
 *   - POST /api/hr/delegations         — 신규 위임 (delegator = self)
 *   - POST /api/hr/delegations/:id/delete — 위임 해제
 */

function parseDelegation(raw: unknown): Delegation {
  const parsed = DelegationSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid Delegation shape: ${parsed.error.message}`);
  }
  return parsed.data;
}

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

export const delegationApi = {
  async listMine(): Promise<Delegation[]> {
    const env = await postEnvelope<unknown[]>(
      '/api/hr/delegations/me/list',
      {},
    );
    return (env.data ?? []).map(parseDelegation);
  },

  create(input: CreateDelegationInput): Promise<Delegation> {
    return http
      .post<unknown>('/api/hr/delegations', input)
      .then(parseDelegation);
  },

  delete(id: number): Promise<{ status: string }> {
    return http.post<{ status: string }>(
      `/api/hr/delegations/${id}/delete`,
      {},
    );
  },
};
