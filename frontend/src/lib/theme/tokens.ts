// RED stub — Sprint 1 TDD
export const lightTokens = {
  bg: '#ffffff',
  surface: '#ffffff',
  line: '#000000',
  ink: '#000000',
  ink2: '#000000',
  ink3: '#000000',
  accent: '#000000',
  accentHover: '#000000',
  accentSoft: '#ffffff',
} as const;

export const darkTokens = {
  bg: '#000000',
  surface: '#000000',
  line: '#ffffff',
  ink: '#ffffff',
  ink2: '#ffffff',
  ink3: '#ffffff',
  accent: '#ffffff',
  accentHover: '#ffffff',
  accentSoft: '#000000',
} as const;

export type ThemeTokens = typeof lightTokens;
