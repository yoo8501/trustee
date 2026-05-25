import { http } from '../../../lib/api';
import type { ApiResult } from '../../../lib/api';
import { ApiError } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import {
  LeaveBalanceSchema,
  LeaveRequestSchema,
  type CreateLeaveRequestInput,
  type LeaveBalance,
  type LeaveRequest,
} from '../schemas';

/**
 * LeaveRequest API client.
 *
 * BE 라우트:
 *   - POST /api/hr/leave-requests              — 신청 (등록)
 *   - POST /api/hr/leave-requests/me/list      — 내 신청 목록
 *   - POST /api/hr/leave-requests/pending/list — 결재 대기 목록 (team_lead+)
 *   - POST /api/hr/leave-requests/:id/approve  — 승인
 *   - POST /api/hr/leave-requests/:id/reject   — 반려 (reason 필수)
 *   - POST /api/hr/leave-requests/:id/cancel   — 본인 취소 (pending only)
 *   - POST /api/hr/leave-balances/me/list      — 내 잔여 목록 (Sprint 3 도메인이지만 본 sprint UI 가 호출)
 *
 * 모든 호출은 `lib/api/http.ts` 의 공통 client 경유 (CLAUDE.md §3.2). 단, 목록은
 * envelope.total 까지 읽기 위해 `postEnvelope` helper 사용.
 */

interface ListResponse<T> {
  items: T[];
  total: number;
}

function parseLeaveRequest(raw: unknown): LeaveRequest {
  const parsed = LeaveRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid LeaveRequest shape: ${parsed.error.message}`);
  }
  return parsed.data;
}

function parseLeaveBalance(raw: unknown): LeaveBalance {
  const parsed = LeaveBalanceSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid LeaveBalance shape: ${parsed.error.message}`);
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

export interface RejectRequest {
  reason: string;
}

export const leaveRequestApi = {
  create(input: CreateLeaveRequestInput): Promise<LeaveRequest> {
    return http
      .post<unknown>('/api/hr/leave-requests', input)
      .then(parseLeaveRequest);
  },

  async listMine(
    req: { page?: number; size?: number } = {},
  ): Promise<ListResponse<LeaveRequest>> {
    const env = await postEnvelope<unknown[]>(
      '/api/hr/leave-requests/me/list',
      req,
    );
    const items = (env.data ?? []).map(parseLeaveRequest);
    return { items, total: env.total ?? items.length };
  },

  async listPending(
    req: { page?: number; size?: number } = {},
  ): Promise<ListResponse<LeaveRequest>> {
    const env = await postEnvelope<unknown[]>(
      '/api/hr/leave-requests/pending/list',
      req,
    );
    const items = (env.data ?? []).map(parseLeaveRequest);
    return { items, total: env.total ?? items.length };
  },

  approve(id: number, comment?: string): Promise<LeaveRequest> {
    return http
      .post<unknown>(`/api/hr/leave-requests/${id}/approve`, { comment })
      .then(parseLeaveRequest);
  },

  reject(id: number, reason: string): Promise<LeaveRequest> {
    return http
      .post<unknown>(`/api/hr/leave-requests/${id}/reject`, { reason })
      .then(parseLeaveRequest);
  },

  cancel(id: number): Promise<LeaveRequest> {
    return http
      .post<unknown>(`/api/hr/leave-requests/${id}/cancel`)
      .then(parseLeaveRequest);
  },

  async listMyBalances(): Promise<LeaveBalance[]> {
    const env = await postEnvelope<unknown[]>(
      '/api/hr/leave-balances/me/list',
      {},
    );
    return (env.data ?? []).map(parseLeaveBalance);
  },
};
