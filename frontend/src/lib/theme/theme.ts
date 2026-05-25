// RED stub — Sprint 1 TDD
import { createTheme, type Theme } from '@mui/material/styles';
import { darkTokens, lightTokens, type ThemeTokens } from './tokens';

export type ThemeMode = 'light' | 'dark';

export function getTokens(_mode: ThemeMode): ThemeTokens {
  // TODO(green): branch on mode
  return lightTokens;
}

export function createAppTheme(_mode: ThemeMode): Theme {
  // TODO(green): wire palette mapping
  void darkTokens;
  return createTheme();
}
