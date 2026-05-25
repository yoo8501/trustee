import type { CreateExpenseInput } from '../schemas';

/**
 * 지출결의서 신청 폼 draft 저장소 — Sprint 7 (UX §2, §8).
 *
 * - LeaveRequest draftStorage 패턴 그대로. 다른 key 로 분리.
 * - TTL 24h.
 * - 제출 성공 시 호출부에서 clear().
 */

const KEY = 'docflow.expense-report.draft';
const TTL_MS = 24 * 60 * 60 * 1000;

interface DraftWrapper {
  data: Partial<CreateExpenseInput>;
  savedAt: number;
}

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const expenseDraftStorage = {
  save(data: Partial<CreateExpenseInput>): void {
    const s = safeStorage();
    if (!s) return;
    try {
      const wrapper: DraftWrapper = { data, savedAt: Date.now() };
      s.setItem(KEY, JSON.stringify(wrapper));
    } catch {
      // ignore quota / permission
    }
  },

  load(now: number = Date.now()): Partial<CreateExpenseInput> | null {
    const s = safeStorage();
    if (!s) return null;
    const raw = s.getItem(KEY);
    if (raw === null || raw === '') return null;
    try {
      const wrapper = JSON.parse(raw) as DraftWrapper;
      if (
        typeof wrapper !== 'object' ||
        wrapper === null ||
        typeof wrapper.savedAt !== 'number'
      ) {
        s.removeItem(KEY);
        return null;
      }
      if (now - wrapper.savedAt > TTL_MS) {
        s.removeItem(KEY);
        return null;
      }
      return wrapper.data;
    } catch {
      s.removeItem(KEY);
      return null;
    }
  },

  clear(): void {
    const s = safeStorage();
    if (!s) return;
    try {
      s.removeItem(KEY);
    } catch {
      // ignore
    }
  },
};

export const EXPENSE_DRAFT_STORAGE_KEY = KEY;
export const EXPENSE_DRAFT_TTL_MS = TTL_MS;
