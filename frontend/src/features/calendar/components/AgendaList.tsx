import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../../../lib/theme/useThemeMode';
import { holidayColor } from '../lib/leaveColor';
import { intersectsDate } from '../lib/monthGrid';
import type {
  CalendarAttendance,
  CalendarHoliday,
  CalendarLeave,
} from '../schemas';
import { CalendarEvent } from './CalendarEvent';

interface AgendaListProps {
  /** YYYY-MM-DD 들 — 보여줄 날들 (주는 7개, 일은 1개) */
  days: string[];
  leaves: CalendarLeave[];
  holidays: CalendarHoliday[];
  attendances: CalendarAttendance[];
}

/**
 * 주/일 뷰는 단순 agenda list 로 fallback (Sprint 8 시간 제약 — 월 뷰 우선).
 *
 * 각 날짜 줄에 이름 · 공휴일 · 휴가 chip · 본인 출퇴근.
 */
export function AgendaList({
  days,
  leaves,
  holidays,
  attendances,
}: AgendaListProps) {
  const { t } = useTranslation();
  const { mode } = useThemeMode();
  const holidayByDate = new Map<string, CalendarHoliday>();
  holidays.forEach((h) => holidayByDate.set(h.date, h));
  const attendanceByDate = new Map<string, CalendarAttendance>();
  attendances.forEach((a) => attendanceByDate.set(a.workDate, a));

  return (
    <Stack
      spacing={1.5}
      data-testid="calendar-agenda-list"
    >
      {days.map((iso) => {
        const dayLeaves = leaves.filter((l) =>
          intersectsDate(l.startAt, l.endAt, iso),
        );
        const holiday = holidayByDate.get(iso) ?? null;
        const attendance = attendanceByDate.get(iso) ?? null;
        return (
          <Box
            key={iso}
            data-testid={`calendar-agenda-${iso}`}
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              p: 1.5,
              bgcolor: 'background.paper',
            }}
          >
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mb: 1 }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color: holiday !== null ? holidayColor(mode) : 'text.primary',
                }}
              >
                {iso}
              </Typography>
              {attendance !== null && (
                <Typography variant="caption" color="success.main">
                  {t('calendar.event.attendance', { defaultValue: '내 출퇴근' })}
                  {attendance.checkInAt
                    ? ` · ${attendance.checkInAt.slice(11, 16)}`
                    : ''}
                  {attendance.checkOutAt
                    ? ` ~ ${attendance.checkOutAt.slice(11, 16)}`
                    : ''}
                </Typography>
              )}
            </Stack>
            {holiday !== null && (
              <Typography
                variant="caption"
                sx={{
                  color: holidayColor(mode),
                  fontWeight: 600,
                  display: 'block',
                  mb: 0.5,
                }}
                data-testid={`calendar-holiday-${iso}`}
              >
                {holiday.name}
              </Typography>
            )}
            {dayLeaves.length === 0 && holiday === null && (
              <Typography variant="caption" color="text.disabled">
                {t('calendar.empty', { defaultValue: '일정 없음' })}
              </Typography>
            )}
            <Stack spacing={0.5}>
              {dayLeaves.map((l) => (
                <CalendarEvent key={`${iso}-${l.id}`} leave={l} />
              ))}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}

