import { darkTokens, lightTokens, type ThemeTokens } from '../../../lib/theme/tokens';

/**
 * 휴가 종류 코드 → 색상 토큰 매핑.
 *
 * - DESIGN.md §색상 토큰 leave-*: 라이트/다크 모두 hue 유지, 밝기만 보정 (frontend/CLAUDE.md §3.10).
 * - 매핑되지 않는 코드는 `fallback` (theme.palette.text.secondary 등).
 *
 * `mode` 인자로 라이트/다크 두 모드 호출 가능 — 단위 테스트가 mode별 hue 동등성을 검증한다.
 */
const LEAVE_COLOR_MAP: Record<string, keyof ThemeTokens> = {
  annual: 'leaveAnnual',
  monthly_annual: 'leaveAnnual',
  half_day: 'leaveHalf',
  am_half: 'leaveHalf',
  pm_half: 'leaveHalf',
  quarter_day: 'leaveHalf',
  comp_leave: 'leaveComp',
  compensatory: 'leaveComp',
  public: 'leavePublic',
  special: 'leaveSpecial',
  sick: 'leaveSpecial',
};

export function leaveColor(
  code: string,
  mode: 'light' | 'dark',
  fallback?: string,
): string {
  const tokens = mode === 'dark' ? darkTokens : lightTokens;
  const key = LEAVE_COLOR_MAP[code];
  if (key) return tokens[key];
  return fallback ?? tokens.ink3;
}

export function holidayColor(mode: 'light' | 'dark'): string {
  return (mode === 'dark' ? darkTokens : lightTokens).holiday;
}
