import { ApiError, type ApiResult } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import { NotificationSchema, type Notification } from '../schemas';

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

function parse(raw: unknown): Notification {
  const r = NotificationSchema.safeParse(raw);
  if (!r.success) {
    throw new Error(`Invalid Notification shape: ${r.error.message}`);
  }
  return r.data;
}

export const notificationApi = {
  async list(): Promise<Notification[]> {
    const env = await postEnvelope<unknown[]>(
      '/api/hr/notifications/list',
      {},
    );
    return (env.data ?? []).map(parse);
  },

  async read(id: number): Promise<void> {
    await postEnvelope<unknown>(`/api/hr/notifications/${id}/read`, {});
  },

  async readAll(): Promise<void> {
    await postEnvelope<unknown>('/api/hr/notifications/read-all', {});
  },
};
