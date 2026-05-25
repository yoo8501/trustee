import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../../../lib/theme/useThemeMode';
import {
  buildMonthGrid,
  intersectsDate,
  type MonthCell,
} from '../lib/monthGrid';
import { holidayColor } from '../lib/leaveColor';
import type {
  CalendarAttendance,
  CalendarHoliday,
  CalendarLeave,
} from '../schemas';
import { CalendarEvent } from './CalendarEvent';

interface MonthViewProps {
  ym: string; // YYYY-MM
  leaves: CalendarLeave[];
  holidays: CalendarHoliday[];
  attendances: CalendarAttendance[];
  today?: Date;
}

const WEEKDAY_KEYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

function MonthCellView({
  cell,
  leaves,
  holiday,
  attendance,
  mode,
}: {
  cell: MonthCell;
  leaves: CalendarLeave[];
  holiday: CalendarHoliday | null;
  attendance: CalendarAttendance | null;
  mode: 'light' | 'dark';
}) {
  const { t } = useTranslation();
  const isSunday = cell.weekday === 0;
  const isSaturday = cell.weekday === 6;
  const isHoliday = holiday !== null;
  const dayColor = isHoliday || isSunday ? holidayColor(mode) : isSaturday ? 'info.main' : undefined;

  return (
    <Box
      data-testid={`calendar-cell-${cell.iso}`}
      data-in-month={cell.inMonth ? 'true' : 'false'}
      data-today={cell.isToday ? 'true' : 'false'}
      data-holiday={isHoliday ? 'true' : 'false'}
      sx={{
        borderRight: '1px solid',
        borderBottom: '1px solid',
        borderColor: 'divider',
        minHeight: { xs: 80, sm: 96, md: 112 },
        p: 0.5,
        bgcolor: cell.isToday
          ? 'action.selected'
          : cell.inMonth
            ? 'background.paper'
            : 'background.default',
        opacity: cell.inMonth ? 1 : 0.55,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.25,
        overflow: 'hidden',
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        spacing={0.5}
      >
        <Typography
          variant="caption"
          component="span"
          sx={{
            fontWeight: cell.isToday ? 700 : 500,
            color: dayColor,
          }}
        >
          {cell.day}
        </Typography>
        {attendance !== null && (
          <Box
            data-testid={`calendar-attendance-${cell.iso}`}
            aria-label={t('calendar.event.attendance', {
              defaultValue: '내 출퇴근',
            })}
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: 'success.main',
            }}
          />
        )}
      </Stack>
      {isHoliday && (
        <Typography
          variant="caption"
          data-testid={`calendar-holiday-${cell.iso}`}
          sx={{
            color: holidayColor(mode),
            fontSize: '0.6875rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {holiday.name}
        </Typography>
      )}
      <Stack spacing={0.25}>
        {leaves.map((l) => (
          <CalendarEvent key={l.id} leave={l} />
        ))}
      </Stack>
    </Box>
  );
}

/**
 * 월간 뷰. 7-col × 6-row grid. 라이브러리 의존성 없이 직접 그린다 — bundle 절약.
 *
 * 한국 캘린더 관례 일요일 시작 / 토요일 끝.
 */
export function MonthView({
  ym,
  leaves,
  holidays,
  attendances,
  today,
}: MonthViewProps) {
  const { t } = useTranslation();
  const { mode } = useThemeMode();
  const cells = buildMonthGrid(ym, today ?? new Date());

  const holidayByDate = new Map<string, CalendarHoliday>();
  holidays.forEach((h) => holidayByDate.set(h.date, h));

  const attendanceByDate = new Map<string, CalendarAttendance>();
  attendances.forEach((a) => attendanceByDate.set(a.workDate, a));

  function leavesFor(iso: string): CalendarLeave[] {
    return leaves.filter((l) => intersectsDate(l.startAt, l.endAt, iso));
  }

  return (
    <Box data-testid="calendar-month-view" role="grid" aria-label={t('calendar.view.month')}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          borderTop: '1px solid',
          borderLeft: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        {WEEKDAY_KEYS_KO.map((k, i) => (
          <Box
            key={k}
            role="columnheader"
            sx={{
              borderRight: '1px solid',
              borderBottom: '1px solid',
              borderColor: 'divider',
              px: 1,
              py: 0.75,
              textAlign: 'center',
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color:
                  i === 0
                    ? holidayColor(mode)
                    : i === 6
                      ? 'info.main'
                      : 'text.secondary',
                fontWeight: 600,
              }}
            >
              {k}
            </Typography>
          </Box>
        ))}
        {cells.map((c) => (
          <MonthCellView
            key={c.iso}
            cell={c}
            leaves={leavesFor(c.iso)}
            holiday={holidayByDate.get(c.iso) ?? null}
            attendance={attendanceByDate.get(c.iso) ?? null}
            mode={mode}
          />
        ))}
      </Box>
    </Box>
  );
}
