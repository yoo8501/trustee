import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendar } from '../hooks/useCalendar';
import {
  buildWeekDays,
  monthRange,
  shiftMonth,
  toIsoDate,
  yearMonthToFirst,
} from '../lib/monthGrid';
import { calendarStorage } from '../lib/storage';
import type { CalendarViewMode } from '../schemas';
import { AgendaList } from './AgendaList';
import { MonthView } from './MonthView';
import { ViewSwitcher } from './ViewSwitcher';

/**
 * 캘린더 메인 컨테이너.
 *
 * - 모바일 default: 주 (DESIGN.md §반응형)
 * - desktop default: 월
 * - 마지막 뷰 + 마지막 달은 localStorage (UX §8 자동 저장)
 * - 데이터: useCalendar — 현재 anchor 달의 ±7일 범위.
 */
export function CalendarView() {
  const { t } = useTranslation();
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));

  const [{ view, anchorMonth }, setState] = useState(() => {
    const persisted = calendarStorage.load();
    if (persisted !== null) {
      return { view: persisted.view, anchorMonth: persisted.month };
    }
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return {
      view: (isMobile ? 'week' : 'month') as CalendarViewMode,
      anchorMonth: ym,
    };
  });

  useEffect(() => {
    calendarStorage.save({ view, month: anchorMonth });
  }, [view, anchorMonth]);

  const range = useMemo(() => monthRange(anchorMonth), [anchorMonth]);
  const { data, isLoading, isError } = useCalendar(range);

  const leaves = data?.leaves ?? [];
  const holidays = data?.holidays ?? [];
  const attendances = data?.attendances ?? [];

  const anchorFirst = useMemo(() => yearMonthToFirst(anchorMonth), [anchorMonth]);

  const onPrev = () => {
    setState((s) => ({ ...s, anchorMonth: shiftMonth(s.anchorMonth, -1) }));
  };
  const onNext = () => {
    setState((s) => ({ ...s, anchorMonth: shiftMonth(s.anchorMonth, 1) }));
  };
  const onToday = () => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setState((s) => ({ ...s, anchorMonth: ym }));
  };
  const onView = (next: CalendarViewMode) =>
    setState((s) => ({ ...s, view: next }));

  return (
    <Stack spacing={2} data-testid="calendar-view">
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton
            onClick={onPrev}
            aria-label={t('calendar.prev', { defaultValue: '이전' })}
            data-testid="calendar-prev"
            size="small"
          >
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="h2" data-testid="calendar-title">
            {anchorFirst.getFullYear()}.{String(anchorFirst.getMonth() + 1).padStart(2, '0')}
          </Typography>
          <IconButton
            onClick={onNext}
            aria-label={t('calendar.next', { defaultValue: '다음' })}
            data-testid="calendar-next"
            size="small"
          >
            <ChevronRightIcon />
          </IconButton>
          <Button
            onClick={onToday}
            size="small"
            data-testid="calendar-today"
            sx={{ ml: 1 }}
          >
            {t('calendar.today', { defaultValue: '오늘' })}
          </Button>
        </Stack>
        <ViewSwitcher value={view} onChange={onView} />
      </Stack>

      {isLoading && (
        <Typography
          variant="body2"
          color="text.secondary"
          data-testid="calendar-loading"
        >
          {t('admin.users.loading')}
        </Typography>
      )}
      {isError && (
        <Typography
          variant="body2"
          color="error"
          data-testid="calendar-error"
        >
          {t('attendance.error')}
        </Typography>
      )}

      {!isLoading && !isError && view === 'month' && (
        <MonthView
          ym={anchorMonth}
          leaves={leaves}
          holidays={holidays}
          attendances={attendances}
        />
      )}
      {!isLoading && !isError && view === 'week' && (
        <Box>
          <AgendaList
            days={buildWeekDays(`${anchorMonth}-15`)}
            leaves={leaves}
            holidays={holidays}
            attendances={attendances}
          />
        </Box>
      )}
      {!isLoading && !isError && view === 'day' && (
        <Box>
          <AgendaList
            days={[toIsoDate(new Date())]}
            leaves={leaves}
            holidays={holidays}
            attendances={attendances}
          />
        </Box>
      )}
    </Stack>
  );
}
