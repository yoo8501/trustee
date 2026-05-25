import { createTheme, type Theme } from '@mui/material/styles';
import { darkTokens, lightTokens, type ThemeTokens } from './tokens';

export type ThemeMode = 'light' | 'dark';

export function getTokens(mode: ThemeMode): ThemeTokens {
  return mode === 'dark' ? darkTokens : lightTokens;
}

export function createAppTheme(mode: ThemeMode): Theme {
  const tokens = getTokens(mode);

  return createTheme({
    palette: {
      mode,
      primary: {
        main: tokens.accent,
        dark: tokens.accentHover,
        light: tokens.accentSoft,
        contrastText: '#ffffff',
      },
      success: { main: tokens.ok, light: tokens.okSoft },
      warning: { main: tokens.warn, light: tokens.warnSoft },
      info: { main: tokens.info, light: tokens.infoSoft },
      error: { main: tokens.danger, light: tokens.dangerSoft },
      background: {
        default: tokens.bg,
        paper: tokens.surface,
      },
      text: {
        primary: tokens.ink,
        secondary: tokens.ink2,
        disabled: tokens.ink3,
      },
      divider: tokens.line,
    },
    typography: {
      fontFamily:
        'Pretendard, -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
      h1: { fontSize: '1.625rem', fontWeight: 700, letterSpacing: '-0.02em' },
      h2: { fontSize: '1.375rem', fontWeight: 700, letterSpacing: '-0.02em' },
      h3: { fontSize: '1.125rem', fontWeight: 700 },
      body1: { fontSize: '0.875rem' },
      body2: { fontSize: '0.8125rem' },
      caption: { fontSize: '0.75rem' },
    },
    shape: { borderRadius: 8 },
  });
}
