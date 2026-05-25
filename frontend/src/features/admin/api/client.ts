import { http } from '../../../lib/api';
import type { ApiResult } from '../../../lib/api';
import { ApiError } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import {
  AdminUserSchema,
  AttendanceAuditRowSchema,
  type AdminUser,
  type AttendanceAuditRow,
  type Role,
} from '../schemas';

/**
 * Admin API client.
 *
 * 본 모듈은 모든 호출을 `lib/api/http.ts` 의 공통 client 경유 (CLAUDE.md §3.2).
 * 단, 목록(list) 응답은 `envelope.total` 까지 읽어야 페이지네이션 계산이 가능하므로
 * envelope 자체를 받아 처리하는 별도 helper(`postEnvelope`) 를 사용한다.
 *
 * 라우팅 매핑:
 *   - POST /api/users/list       — HR/super_admin
 *   - POST /api/users/update     — super_admin (role/status 변경)
 *   - POST /api/users/terminate  — super_admin
 *   - POST /api/hr/audit/attendance/list — HR/super_admin
 */

interface ListResponse<T> {
  items: T[];
  total: number;
}

function parseUser(raw: unknown): AdminUser {
  const parsed = AdminUserSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid AdminUser shape: ${parsed.error.message}`);
  }
  return parsed.data;
}

function parseAuditRow(raw: unknown): AttendanceAuditRow {
  const parsed = AttendanceAuditRowSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid AttendanceAuditRow shape: ${parsed.error.message}`);
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

export interface UserListRequest {
  page?: number;
  size?: number;
}

export interface UserUpdateRequest {
  id: number;
  name?: string;
  role?: Role;
  status?: 'active' | 'inactive' | 'terminated';
  teamIdSet?: boolean;
  teamId?: number | null;
  managerIdSet?: boolean;
  managerId?: number | null;
}

export interface TerminateRequest {
  userId: number;
  reason?: string;
}

export interface TerminateResponse {
  id: number;
  status: string;
  tokenVersion: number;
}

export interface AttendanceAuditListRequest {
  userId?: number;
  from?: string; // YYYY-MM-DD
  to?: string;
  source?: string;
  clientIp?: string;
  page?: number;
  size?: number;
}

export const adminApi = {
  async listUsers(
    req: UserListRequest = {},
  ): Promise<ListResponse<AdminUser>> {
    const env = await postEnvelope<unknown[]>('/api/users/list', req);
    const items = (env.data ?? []).map(parseUser);
    return { items, total: env.total ?? items.length };
  },

  updateUser(req: UserUpdateRequest): Promise<AdminUser> {
    return http
      .post<unknown>('/api/users/update', req)
      .then(parseUser);
  },

  terminateUser(req: TerminateRequest): Promise<TerminateResponse> {
    return http.post<TerminateResponse>('/api/users/terminate', req);
  },

  async listAttendanceAudit(
    req: AttendanceAuditListRequest = {},
  ): Promise<ListResponse<AttendanceAuditRow>> {
    const env = await postEnvelope<unknown[]>(
      '/api/hr/audit/attendance/list',
      req,
    );
    const items = (env.data ?? []).map(parseAuditRow);
    return { items, total: env.total ?? items.length };
  },
};
