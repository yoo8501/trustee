import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useTranslation } from 'react-i18next';
import type { CalendarViewMode } from '../schemas';

interface ViewSwitcherProps {
  value: CalendarViewMode;
  onChange: (next: CalendarViewMode) => void;
}

export function ViewSwitcher({ value, onChange }: ViewSwitcherProps) {
  const { t } = useTranslation();
  return (
    <ToggleButtonGroup
      data-testid="calendar-view-switcher"
      value={value}
      exclusive
      size="small"
      onChange={(_e, next) => {
        if (next !== null) onChange(next as CalendarViewMode);
      }}
    >
      <ToggleButton value="day" data-testid="calendar-view-day" aria-label={t('calendar.view.day')}>
        {t('calendar.view.day')}
      </ToggleButton>
      <ToggleButton value="week" data-testid="calendar-view-week" aria-label={t('calendar.view.week')}>
        {t('calendar.view.week')}
      </ToggleButton>
      <ToggleButton value="month" data-testid="calendar-view-month" aria-label={t('calendar.view.month')}>
        {t('calendar.view.month')}
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
