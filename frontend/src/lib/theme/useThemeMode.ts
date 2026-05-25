import { createContext, useContext } from 'react';
import type { ThemeMode } from './theme';

export interface ThemeModeContextValue {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

export const ThemeModeContext = createContext<ThemeModeContextValue | null>(
  null,
);

export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  if (ctx === null) {
    throw new Error('useThemeMode must be used inside <AppThemeProvider />');
  }
  return ctx;
}
