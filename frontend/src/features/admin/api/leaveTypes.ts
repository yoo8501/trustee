import { http } from '../../../lib/api';
import type { ApiResult } from '../../../lib/api';
import { ApiError } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import {
  AdjustLeaveBalanceSchema,
  LeaveTypeSchema,
  type AccrualPolicy,
  type AdjustLeaveBalanceInput,
  type LeaveType,
} from '../schemas';

/**
 * LeaveType / LeaveBalance Admin API client.
 *
 * BE 라우트:
 *   - POST /api/hr/leave-types/list           — 인증된 모든 사용자 (HR 화면도 같은 endpoint)
 *   - POST /api/hr/leave-types                — HR/super_admin only
 *   - POST /api/hr/leave-types/update         — HR/super_admin only
 *   - POST /api/hr/leave-types/delete         — HR/super_admin only
 *   - POST /api/hr/leave-balances/:user_id/adjust  — HR/super_admin only
 */

interface ListResponse<T> {
  items: T[];
  total: number;
}

function parseLeaveType(raw: unknown): LeaveType {
  const parsed = LeaveTypeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid LeaveType shape: ${parsed.error.message}`);
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

export interface CreateLeaveTypeRequest {
  code: string;
  name: string;
  defaultHours: number;
  accrualPolicy: AccrualPolicy;
  isPaid?: boolean;
  isActive?: boolean;
}

export interface UpdateLeaveTypeRequest {
  id: number;
  name?: string;
  defaultHours?: number;
  accrualPolicy?: AccrualPolicy;
  isPaid?: boolean;
  isActive?: boolean;
}

export interface AdjustResponse {
  adjustmentId: number;
  deltaHours: number;
  balance: {
    id: number;
    userId: number;
    leaveTypeId: number;
    leaveTypeCode?: string;
    leaveTypeName?: string;
    periodYear: number;
    grantedHours: number;
    usedHours: number;
    remainingHours: number;
    expiresAt?: string;
  };
}

export const leaveTypesApi = {
  async list(
    req: { page?: number; size?: number } = {},
  ): Promise<ListResponse<LeaveType>> {
    const env = await postEnvelope<unknown[]>(
      '/api/hr/leave-types/list',
      req,
    );
    const items = (env.data ?? []).map(parseLeaveType);
    return { items, total: env.total ?? items.length };
  },

  create(req: CreateLeaveTypeRequest): Promise<LeaveType> {
    return http
      .post<unknown>('/api/hr/leave-types', req)
      .then(parseLeaveType);
  },

  update(req: UpdateLeaveTypeRequest): Promise<LeaveType> {
    return http
      .post<unknown>('/api/hr/leave-types/update', req)
      .then(parseLeaveType);
  },

  delete(id: number): Promise<{ status: string }> {
    return http.post<{ status: string }>('/api/hr/leave-types/delete', { id });
  },
};

export const leaveBalancesApi = {
  /**
   * HR 강제 잔여 조정. 본 함수는 schema 검증을 한 번 더 수행하여
   * 컴포넌트 단에서 검증된 입력만 BE 로 보낸다.
   *
   * 검증 실패는 Promise reject 로 반환 (호출부에서 await/catch 일관 처리).
   */
  async adjust(input: AdjustLeaveBalanceInput): Promise<AdjustResponse> {
    const parsed = AdjustLeaveBalanceSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error('AdjustLeaveBalanceInput validation failed');
    }
    const { userId, leaveTypeId, periodYear, deltaHours, reason } = parsed.data;
    return http.post<AdjustResponse>(
      `/api/hr/leave-balances/${userId}/adjust`,
      { leaveTypeId, periodYear, deltaHours, reason },
    );
  },
};
