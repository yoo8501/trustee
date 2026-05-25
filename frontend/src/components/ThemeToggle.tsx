import DarkModeIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeIcon from '@mui/icons-material/LightModeOutlined';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../lib/theme';

export function ThemeToggle() {
  const { mode, toggle } = useThemeMode();
  const { t } = useTranslation();

  const nextLabelKey =
    mode === 'dark' ? 'theme.toggle.light' : 'theme.toggle.dark';
  const label = t(nextLabelKey);

  return (
    <Tooltip title={label}>
      <IconButton
        aria-label={label}
        data-testid="theme-toggle"
        onClick={toggle}
        size="medium"
        color="inherit"
      >
        {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
      </IconButton>
    </Tooltip>
  );
}
