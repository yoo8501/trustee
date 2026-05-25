import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import type { PeriodSummary } from '../stats-types';

interface StatsSummaryProps {
  summary: PeriodSummary;
}

function fmtMinutesAsHours(min: number): string {
  if (min === 0) return '0h';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * 합계 카드 — 실근무 / 연장 / 출근일 / 출근율.
 *
 * DESIGN.md §Card default, 숫자는 tabular-nums 강제.
 */
export function StatsSummary({ summary }: StatsSummaryProps) {
  const { t } = useTranslation();

  const items = [
    {
      key: 'totalActual',
      label: t('attendance.stats.summary.totalActual'),
      value: fmtMinutesAsHours(summary.totalActualMinutes),
    },
    {
      key: 'overtime',
      label: t('attendance.stats.summary.overtime'),
      value: fmtMinutesAsHours(summary.totalOvertimeMinutes),
    },
    {
      key: 'daysPresent',
      label: t('attendance.stats.summary.daysPresent'),
      value: `${summary.daysPresent}일`,
    },
    {
      key: 'attendanceRate',
      label: t('attendance.stats.summary.attendanceRate'),
      value: `${Math.round(summary.attendanceRate * 100)}%`,
    },
  ];

  return (
    <Card
      variant="outlined"
      data-testid="stats-summary"
      sx={{
        borderRadius: '14px',
        bgcolor: 'background.paper',
        borderColor: 'divider',
        p: 2.5,
      }}
    >
      <Stack spacing={1.5}>
        {items.map((it) => (
          <Box
            key={it.key}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {it.label}
            </Typography>
            <Typography
              variant="body1"
              sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
              data-testid={`stats-summary-${it.key}`}
            >
              {it.value}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Card>
  );
}
