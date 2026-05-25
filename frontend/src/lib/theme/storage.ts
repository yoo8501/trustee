import type { ThemeMode } from './theme';

export const THEME_STORAGE_KEY = 'docflow-theme';

/**
 * 초기 테마 모드 결정 순서:
 *   1) localStorage(`docflow-theme`)에 저장된 값
 *   2) prefers-color-scheme media query
 *   3) light fallback
 * SSR / sandbox 환경에서 안전하게 동작한다.
 */
export function detectInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage 미사용 환경 */
  }
  try {
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
  } catch {
    /* matchMedia 미사용 */
  }
  return 'light';
}
