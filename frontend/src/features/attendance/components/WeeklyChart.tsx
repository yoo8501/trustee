import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecordStats } from '../stats-types';

interface WeeklyChartProps {
  records: RecordStats[];
}

const CHART_HEIGHT = 200;
const BAR_GROUP_WIDTH = 56;
const BAR_WIDTH = 14;
const BAR_GAP = 4;
const MARGIN_TOP = 16;
const MARGIN_BOTTOM = 28;
const MARGIN_LEFT = 32;
const MARGIN_RIGHT = 16;

/**
 * 일별 actual / expected / overtime bar chart (SVG 자체 구현).
 *
 * 색상은 MUI theme palette 토큰만 사용 (DESIGN.md §색상 토큰):
 *  - actual:    primary.main (accent 인디고)
 *  - expected:  text.disabled (ink-3, 기준선 톤)
 *  - overtime:  warning.main (warn 주황)
 *
 * 다크 모드: theme.palette 가 알아서 darkTokens 로 매핑됨 (lib/theme/theme.ts).
 *
 * 가벼운 SVG (~3KB) — recharts 회피.
 * Y축 max 는 모든 bar 중 가장 큰 값에 1.1 padding.
 */
export function WeeklyChart({ records }: WeeklyChartProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const maxMinutes = useMemo(() => {
    if (records.length === 0) return 0;
    const m = records.reduce((acc, r) => {
      const local = Math.max(
        r.actualWorkMinutes,
        r.expectedMinutes,
        r.adjustedExpected,
        r.actualWorkMinutes + r.overtimeMinutes,
      );
      return Math.max(acc, local);
    }, 0);
    // 최소 480(=8h) 기준선 + 10% padding
    return Math.max(480, Math.ceil((m * 1.1) / 60) * 60);
  }, [records]);

  if (records.length === 0) {
    return (
      <Box
        data-testid="chart-empty"
        sx={{
          height: CHART_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.secondary',
          borderRadius: '12px',
          border: '1px dashed',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="body2">{t('attendance.empty')}</Typography>
      </Box>
    );
  }

  const width =
    MARGIN_LEFT + MARGIN_RIGHT + records.length * BAR_GROUP_WIDTH;
  const innerHeight = CHART_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
  const scale = (mins: number) =>
    maxMinutes === 0 ? 0 : (mins / maxMinutes) * innerHeight;

  const colors = {
    actual: theme.palette.primary.main,
    expected: theme.palette.text.disabled,
    overtime: theme.palette.warning.main,
    grid: theme.palette.divider,
    text: theme.palette.text.secondary,
  };

  // Y축 grid lines (0h, 4h, 8h, ... 끝)
  const stepHours = maxMinutes >= 600 ? 4 : 2;
  const yTicks: number[] = [];
  for (let h = 0; h * 60 <= maxMinutes; h += stepHours) yTicks.push(h * 60);

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        borderRadius: '12px',
        border: '1px solid',
        borderColor: 'divider',
        p: 2,
        overflowX: 'auto',
      }}
    >
      <svg
        data-testid="weekly-chart-svg"
        role="img"
        aria-label={t('attendance.chart.aria')}
        width={width}
        height={CHART_HEIGHT}
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        style={{ display: 'block' }}
      >
        {/* Y축 grid + labels */}
        {yTicks.map((tickMin) => {
          const y = MARGIN_TOP + innerHeight - scale(tickMin);
          return (
            <g key={tickMin}>
              <line
                x1={MARGIN_LEFT}
                x2={width - MARGIN_RIGHT}
                y1={y}
                y2={y}
                stroke={colors.grid}
                strokeWidth={1}
                strokeDasharray={tickMin === 0 ? '0' : '2 3'}
              />
              <text
                x={MARGIN_LEFT - 4}
                y={y + 4}
                fontSize="10"
                textAnchor="end"
                fill={colors.text}
              >
                {tickMin / 60}h
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {records.map((r, i) => {
          const xBase =
            MARGIN_LEFT + i * BAR_GROUP_WIDTH + (BAR_GROUP_WIDTH - 3 * BAR_WIDTH - 2 * BAR_GAP) / 2;
          const yBaseline = MARGIN_TOP + innerHeight;

          const actualH = scale(r.actualWorkMinutes);
          const expectedH = scale(r.adjustedExpected);
          const overtimeH = scale(r.overtimeMinutes);

          const xActual = xBase;
          const xExpected = xBase + BAR_WIDTH + BAR_GAP;
          const xOvertime = xBase + 2 * (BAR_WIDTH + BAR_GAP);

          return (
            <g key={r.date}>
              {/* expected (ghost) */}
              <rect
                data-testid={`chart-bar-expected-${r.date}`}
                x={xExpected}
                y={yBaseline - expectedH}
                width={BAR_WIDTH}
                height={Math.max(0, expectedH)}
                fill={colors.expected}
                opacity={0.5}
                rx={2}
              />
              {/* actual */}
              <rect
                data-testid={`chart-bar-actual-${r.date}`}
                x={xActual}
                y={yBaseline - actualH}
                width={BAR_WIDTH}
                height={Math.max(0, actualH)}
                fill={colors.actual}
                rx={2}
              />
              {/* overtime (있는 경우만) */}
              {r.overtimeMinutes > 0 && (
                <rect
                  data-testid={`chart-bar-overtime-${r.date}`}
                  x={xOvertime}
                  y={yBaseline - overtimeH}
                  width={BAR_WIDTH}
                  height={Math.max(0, overtimeH)}
                  fill={colors.overtime}
                  rx={2}
                />
              )}
              {/* X축 라벨 (M/D) */}
              <text
                x={xBase + (3 * BAR_WIDTH + 2 * BAR_GAP) / 2}
                y={CHART_HEIGHT - 8}
                fontSize="11"
                textAnchor="middle"
                fill={colors.text}
              >
                {r.date.slice(5).replace('-', '/')}
              </text>
            </g>
          );
        })}
      </svg>

      {/* 범례 */}
      <Stack
        direction="row"
        spacing={2}
        sx={{ mt: 1, flexWrap: 'wrap' }}
        aria-hidden
      >
        <Legend color={colors.actual} label={t('attendance.chart.actual')} />
        <Legend color={colors.expected} label={t('attendance.chart.expected')} />
        <Legend color={colors.overtime} label={t('attendance.chart.overtime')} />
      </Stack>
    </Box>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: '2px',
          bgcolor: color,
        }}
      />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}
