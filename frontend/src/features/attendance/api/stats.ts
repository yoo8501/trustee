import { http } from '../../../lib/api';
import {
  StatsResponseSchema,
  type StatsQuery,
  type StatsResponse,
} from '../stats-types';

/**
 * Sprint 5 통계 API client.
 *
 * - me: 본인 통계 (모든 직원)
 * - team(teamId): 팀 통계 (team_lead+, 자기 팀만 — BE Scoped Querier 강제)
 * - all: 전사 통계 (HR/super_admin only)
 *
 * 모든 호출은 lib/api/http.ts 경유 (CLAUDE.md §3.2).
 * 응답 envelope 은 http 가 처리하고, payload 만 Zod 로 parse.
 */
function parseResponse(raw: unknown): StatsResponse {
  const parsed = StatsResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid StatsResponse shape: ${parsed.error.message}`);
  }
  return parsed.data;
}

export const statsApi = {
  async me(query: StatsQuery): Promise<StatsResponse> {
    const raw = await http.post<unknown>(
      '/api/hr/attendance/me/stats',
      query,
    );
    return parseResponse(raw);
  },

  async team(teamId: number, query: StatsQuery): Promise<StatsResponse> {
    const raw = await http.post<unknown>(
      `/api/hr/attendance/team/${teamId}/stats`,
      query,
    );
    return parseResponse(raw);
  },

  async all(query: StatsQuery): Promise<StatsResponse> {
    const raw = await http.post<unknown>(
      '/api/hr/attendance/all/stats',
      query,
    );
    return parseResponse(raw);
  },
};
