import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { CalendarView } from '../features/calendar';

/**
 * /calendar — 공유 캘린더.
 *
 * Sprint 8 — 휴가 + 공휴일 + 본인 출퇴근 한눈에.
 */
export function CalendarRoute() {
  const { t } = useTranslation();
  return (
    <Stack spacing={2} data-testid="calendar-page">
      <Typography variant="h1">{t('calendar.title')}</Typography>
      <CalendarView />
    </Stack>
  );
}
