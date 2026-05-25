import { useQuery } from '@tanstack/react-query';
import { calendarApi, type CalendarListRequest } from '../api';
import type { CalendarResponse } from '../schemas';

export const calendarKeys = {
  all: ['calendar'] as const,
  list: (req: CalendarListRequest) =>
    [...calendarKeys.all, 'list', req] as const,
};

/**
 * 캘린더 조회 — leaves + holidays + attendances 한 번에.
 *
 * staleTime 30s — 휴가가 자주 바뀌지 않으므로 같은 달 반복 진입 시 캐시 사용.
 */
export function useCalendar(
  req: CalendarListRequest,
  opts: { enabled?: boolean } = {},
) {
  return useQuery<CalendarResponse>({
    queryKey: calendarKeys.list(req),
    queryFn: () => calendarApi.list(req),
    enabled: opts.enabled ?? true,
    staleTime: 30_000,
    retry: 1,
  });
}
