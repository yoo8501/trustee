import { http } from '../../../lib/api';
import type { ApiResult } from '../../../lib/api';
import { ApiError } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import {
  AttachmentUploadSchema,
  ExpenseReportSchema,
  type AttachmentUpload,
  type CreateExpenseInput,
  type ExpenseReport,
} from '../schemas';

/**
 * ExpenseReport API client — Sprint 7.
 *
 * BE 라우트:
 *   - POST /api/hr/expense-reports              — 신청 (등록)
 *   - POST /api/hr/expense-reports/me/list      — 내 신청 목록
 *   - POST /api/hr/expense-reports/pending/list — 결재 대기 목록 (team_lead+)
 *   - POST /api/hr/expense-reports/:id/approve  — 승인
 *   - POST /api/hr/expense-reports/:id/reject   — 반려 (reason 필수)
 *   - POST /api/hr/expense-reports/:id/cancel   — 본인 취소 (pending only)
 *   - POST /api/hr/expense-reports/attachment   — 첨부 업로드 (multipart/form-data)
 *
 * 모든 호출은 `lib/api/http.ts` 의 공통 client 경유 (CLAUDE.md §3.2). 단, 목록은
 * envelope.total 까지 읽기 위해 `postEnvelope` helper, 첨부 업로드는 multipart
 * 이므로 fetch 직접 + 동일한 error handling 로직 재구성.
 */

interface ListResponse<T> {
  items: T[];
  total: number;
}

function parseExpense(raw: unknown): ExpenseReport {
  const parsed = ExpenseReportSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid ExpenseReport shape: ${parsed.error.message}`);
  }
  return parsed.data;
}

function parseAttachment(raw: unknown): AttachmentUpload {
  const parsed = AttachmentUploadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid AttachmentUpload shape: ${parsed.error.message}`);
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

async function uploadMultipart<T>(url: string, file: File): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const access = tokenStorage.getAccess();
  if (access) headers.Authorization = `Bearer ${access}`;

  const form = new FormData();
  form.append('file', file, file.name);

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: form,
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
  if (!envelope.success || envelope.data === null) {
    throw new ApiError({
      status: res.status,
      message: envelope.message ?? '',
      errorCode: envelope.details?.errorCode,
      fields: envelope.details?.fields,
      traceId: envelope.details?.traceId,
    });
  }
  return envelope.data;
}

export const expenseReportApi = {
  create(input: CreateExpenseInput): Promise<ExpenseReport> {
    return http
      .post<unknown>('/api/hr/expense-reports', input)
      .then(parseExpense);
  },

  async listMine(
    req: { page?: number; size?: number } = {},
  ): Promise<ListResponse<ExpenseReport>> {
    const env = await postEnvelope<unknown[]>(
      '/api/hr/expense-reports/me/list',
      req,
    );
    const items = (env.data ?? []).map(parseExpense);
    return { items, total: env.total ?? items.length };
  },

  async listPending(
    req: { page?: number; size?: number } = {},
  ): Promise<ListResponse<ExpenseReport>> {
    const env = await postEnvelope<unknown[]>(
      '/api/hr/expense-reports/pending/list',
      req,
    );
    const items = (env.data ?? []).map(parseExpense);
    return { items, total: env.total ?? items.length };
  },

  approve(id: number, comment?: string): Promise<ExpenseReport> {
    return http
      .post<unknown>(`/api/hr/expense-reports/${id}/approve`, { comment })
      .then(parseExpense);
  },

  reject(id: number, reason: string): Promise<ExpenseReport> {
    return http
      .post<unknown>(`/api/hr/expense-reports/${id}/reject`, { reason })
      .then(parseExpense);
  },

  cancel(id: number): Promise<ExpenseReport> {
    return http
      .post<unknown>(`/api/hr/expense-reports/${id}/cancel`)
      .then(parseExpense);
  },

  async uploadAttachment(file: File): Promise<AttachmentUpload> {
    const raw = await uploadMultipart<unknown>(
      '/api/hr/expense-reports/attachment',
      file,
    );
    return parseAttachment(raw);
  },
};
