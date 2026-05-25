import { http } from '../../../lib/api';
import type { ApiResult } from '../../../lib/api';
import { ApiError } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import { TeamSchema, type Team } from '../../admin/schemas';

/**
 * Teams API client.
 *
 * 라우트:
 *   - POST /api/teams/list           — 인증된 모든 사용자
 *   - GET  /api/teams/:id            — 단건
 *   - POST /api/teams                — HR/super_admin only
 *   - POST /api/teams/update         — HR/super_admin only
 *   - POST /api/teams/delete         — HR/super_admin only
 */

interface ListResponse<T> {
  items: T[];
  total: number;
}

function parseTeam(raw: unknown): Team {
  const parsed = TeamSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid Team shape: ${parsed.error.message}`);
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

export interface CreateTeamRequest {
  name: string;
  parentTeamId?: number | null;
  teamLeadId?: number | null;
  hrManagerId?: number | null;
}

export interface UpdateTeamRequest {
  id: number;
  name?: string;
  parentSet?: boolean;
  parentTeamId?: number | null;
  leadSet?: boolean;
  teamLeadId?: number | null;
  hrSet?: boolean;
  hrManagerId?: number | null;
}

export const teamsApi = {
  async list(
    req: { page?: number; size?: number } = {},
  ): Promise<ListResponse<Team>> {
    const env = await postEnvelope<unknown[]>('/api/teams/list', {
      ...req,
      size: req.size ?? 100,
    });
    const items = (env.data ?? []).map(parseTeam);
    return { items, total: env.total ?? items.length };
  },

  create(req: CreateTeamRequest): Promise<Team> {
    return http.post<unknown>('/api/teams', req).then(parseTeam);
  },

  update(req: UpdateTeamRequest): Promise<Team> {
    return http
      .post<unknown>('/api/teams/update', req)
      .then(parseTeam);
  },

  delete(id: number): Promise<{ status: string }> {
    return http.post<{ status: string }>('/api/teams/delete', { id });
  },
};
