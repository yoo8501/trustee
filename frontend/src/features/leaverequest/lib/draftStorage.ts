import type { CreateLeaveRequestInput } from '../schemas';

/**
 * 휴가 신청 폼 draft 저장소 (UX §2, §8).
 *
 * - 새로고침/실수 페이지 이동에도 입력값 복구.
 * - TTL 24h — 오래된 draft 는 자동 폐기 (오래된 일자/사유가 무심코 제출되는 사고 방지).
 * - 제출 성공 시 호출부에서 clear().
 *
 * SSR/jsdom localStorage 비활성 시 모두 no-op 으로 동작.
 */

const KEY = 'docflow.leave-request.draft';
const TTL_MS = 24 * 60 * 60 * 1000;

interface DraftWrapper {
  data: Partial<CreateLeaveRequestInput>;
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

export const draftStorage = {
  save(data: Partial<CreateLeaveRequestInput>): void {
    const s = safeStorage();
    if (!s) return;
    try {
      const wrapper: DraftWrapper = { data, savedAt: Date.now() };
      s.setItem(KEY, JSON.stringify(wrapper));
    } catch {
      // quota / 권한 — 무시
    }
  },

  load(now: number = Date.now()): Partial<CreateLeaveRequestInput> | null {
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
      // 무시
    }
  },
};

export const DRAFT_STORAGE_KEY = KEY;
export const DRAFT_TTL_MS = TTL_MS;
