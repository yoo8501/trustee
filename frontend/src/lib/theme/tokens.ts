/**
 * 디자인 시스템 토큰 (DESIGN.md §색상 토큰).
 *
 * 라이트 팔레트는 DESIGN.md `:root`를 그대로 가져왔다.
 * 다크 팔레트는 hue를 유지하고 밝기/saturation만 보정한 짝.
 * — 휴가 종류 색상은 두 모드 모두 동일 hue (사용자 학습 누적, frontend/CLAUDE.md §3.10).
 */
export interface ThemeTokens {
  bg: string;
  surface: string;
  line: string;
  ink: string;
  ink2: string;
  ink3: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  ok: string;
  okSoft: string;
  warn: string;
  warnSoft: string;
  info: string;
  infoSoft: string;
  danger: string;
  dangerSoft: string;
  leaveAnnual: string;
  leaveHalf: string;
  leaveComp: string;
  leavePublic: string;
  leaveSpecial: string;
  holiday: string;
}

export const lightTokens: ThemeTokens = {
  bg: '#f8fafc',
  surface: '#ffffff',
  line: '#e2e8f0',
  ink: '#0f172a',
  ink2: '#334155',
  ink3: '#64748b',
  accent: '#4f46e5',
  accentHover: '#4338ca',
  accentSoft: '#eef2ff',
  ok: '#16a34a',
  okSoft: '#ecfdf5',
  warn: '#ea580c',
  warnSoft: '#fff7ed',
  info: '#0284c7',
  infoSoft: '#f0f9ff',
  danger: '#dc2626',
  dangerSoft: '#fef2f2',
  leaveAnnual: '#818cf8',
  leaveHalf: '#c4b5fd',
  leaveComp: '#6ee7b7',
  leavePublic: '#fda4af',
  leaveSpecial: '#fcd34d',
  holiday: '#fda4af',
};

export const darkTokens: ThemeTokens = {
  bg: '#0b1220',
  surface: '#111827',
  line: '#1f2937',
  ink: '#f1f5f9',
  ink2: '#cbd5e1',
  ink3: '#94a3b8',
  accent: '#818cf8',
  accentHover: '#6366f1',
  accentSoft: '#1e1b4b',
  ok: '#4ade80',
  okSoft: '#052e16',
  warn: '#fb923c',
  warnSoft: '#431407',
  info: '#38bdf8',
  infoSoft: '#082f49',
  danger: '#f87171',
  dangerSoft: '#450a0a',
  leaveAnnual: '#a5b4fc',
  leaveHalf: '#ddd6fe',
  leaveComp: '#86efac',
  leavePublic: '#fda4af',
  leaveSpecial: '#fde68a',
  holiday: '#fda4af',
};
