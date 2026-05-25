// RED stub — Sprint 1 TDD
import { createContext, useContext, type ReactNode } from 'react';
import type { ThemeMode } from './theme';

interface ThemeModeContextValue {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export const THEME_STORAGE_KEY = 'docflow-theme';

export function detectInitialMode(): ThemeMode {
  return 'light';
}

interface AppThemeProviderProps {
  children: ReactNode;
  initialMode?: ThemeMode;
}

export function AppThemeProvider({ children }: AppThemeProviderProps) {
  // TODO(green): real provider w/ MUI theme + persistence
  return (
    <ThemeModeContext.Provider
      value={{ mode: 'light', toggle: () => {}, setMode: () => {} }}
    >
      {children}
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  if (ctx === null) {
    throw new Error('useThemeMode must be used inside <AppThemeProvider />');
  }
  return ctx;
}
