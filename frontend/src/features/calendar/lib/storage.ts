import type { CalendarViewMode } from '../schemas';

const STORAGE_KEY = 'docflow-calendar-state';

export interface CalendarPersistedState {
  view: CalendarViewMode;
  /** YYYY-MM 형태. 마지막으로 보던 달의 첫 일자 anchor. */
  month: string;
}

/**
 * localStorage 기반 캘린더 상태 영속화 (UX §8 자동 저장 / 기억).
 *
 * - SSR 또는 storage 비활성 환경 대비: 모든 메서드는 try/catch.
 * - 형식이 깨진 값은 무시하고 null 반환 (호출 측이 default 처리).
 */
export const calendarStorage = {
  load(): CalendarPersistedState | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return null;
      const parsed = JSON.parse(raw) as Partial<CalendarPersistedState>;
      if (
        parsed.view !== 'month' &&
        parsed.view !== 'week' &&
        parsed.view !== 'day'
      ) {
        return null;
      }
      if (typeof parsed.month !== 'string' || parsed.month.length === 0) {
        return null;
      }
      return { view: parsed.view, month: parsed.month };
    } catch {
      return null;
    }
  },

  save(state: CalendarPersistedState): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota / disabled
    }
  },

  clear(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },
};
