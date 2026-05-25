import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { detectInitialMode, THEME_STORAGE_KEY } from './storage';
import { createAppTheme, type ThemeMode } from './theme';
import {
  ThemeModeContext,
  type ThemeModeContextValue,
} from './useThemeMode';

interface AppThemeProviderProps {
  children: ReactNode;
  initialMode?: ThemeMode;
}

export function AppThemeProvider({
  children,
  initialMode,
}: AppThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(
    () => initialMode ?? detectInitialMode(),
  );

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = mode;
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      /* ignore quota / sandbox */
    }
  }, [mode]);

  const toggle = useCallback(() => {
    setModeState((m) => (m === 'light' ? 'dark' : 'light'));
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
  }, []);

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  const value = useMemo<ThemeModeContextValue>(
    () => ({ mode, toggle, setMode }),
    [mode, toggle, setMode],
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeModeContext.Provider>
  );
}
