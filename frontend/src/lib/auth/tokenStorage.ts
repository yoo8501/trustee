/**
 * Token storage — localStorage 래퍼. multi-tab logout sync 를 위해
 * `storage` 이벤트도 함께 노출한다 (다른 탭에서 로그아웃하면 첫 탭의 다음 API 호출 시
 * 401 → 자연 리다이렉트 흐름이 작동).
 *
 * 키 이름은 도메인 prefix 를 붙여 다른 앱과 충돌하지 않게 한다.
 */
export const ACCESS_TOKEN_KEY = 'docflow-access-token';
export const REFRESH_TOKEN_KEY = 'docflow-refresh-token';

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota / sandbox — ignore */
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export interface TokenStorage {
  getAccess(): string | null;
  getRefresh(): string | null;
  set(access: string, refresh: string): void;
  clear(): void;
  /**
   * 다른 탭에서 access 토큰이 변경(추가/제거)되면 cb 가 호출된다.
   * cb(hasToken) — true 면 다른 탭에서 로그인됨, false 면 다른 탭에서 로그아웃됨.
   */
  onAccessChange(cb: (hasToken: boolean) => void): () => void;
}

export const tokenStorage: TokenStorage = {
  getAccess: () => safeGet(ACCESS_TOKEN_KEY),
  getRefresh: () => safeGet(REFRESH_TOKEN_KEY),
  set: (access, refresh) => {
    safeSet(ACCESS_TOKEN_KEY, access);
    safeSet(REFRESH_TOKEN_KEY, refresh);
  },
  clear: () => {
    safeRemove(ACCESS_TOKEN_KEY);
    safeRemove(REFRESH_TOKEN_KEY);
  },
  onAccessChange: (cb) => {
    if (typeof window === 'undefined') {
      return () => undefined;
    }
    const listener = (e: StorageEvent) => {
      if (e.key === ACCESS_TOKEN_KEY) {
        cb(e.newValue !== null);
      } else if (e.key === null) {
        // storage cleared from another context
        cb(false);
      }
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  },
};
