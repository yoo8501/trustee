import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  OvertimeWarning,
  PeriodTabs,
  RecordsTable,
  StatsSummary,
  WeeklyChart,
  todayKST,
  useMyStats,
  type StatsPeriod,
} from '../features/attendance';

const STORAGE_KEY = 'docflow.attendance.period';

function readStoredPeriod(): StatsPeriod {
  if (typeof window === 'undefined') return 'week';
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === 'day' || v === 'week' || v === 'month') return v;
  return 'week';
}

/**
 * Sprint 5 — 본인 근태 통계 페이지.
 *
 * 레이아웃 (DESIGN.md §반응형):
 *  - 데스크탑 ≥1024px (md+): 차트 (8/12) + 합계/경고 (4/12) 2-column
 *  - 모바일 <768px: 1-column (차트 위 / 합계 아래 / 테이블 그 아래)
 *
 * 5 상태:
 *  - Loading: RecordsTable skeleton + 차트는 자리만 (empty 메시지 X)
 *  - Empty: records 0 → RecordsTable empty + 차트도 empty
 *  - Error: RecordsTable error + retry
 *  - Success: 전체 렌더
 *  - Partial: checkOutAt null 등 누락은 RecordsTable 에서 em-dash 처리
 *
 * 48/52h 경고는 weeklyTotalMinutes 기반 (week 탭에서 의미 가장 큼,
 * day/month 에선 BE 가 해당 주 누적을 함께 내려준다).
 */
export function AttendanceRoute() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<StatsPeriod>(() => readStoredPeriod());
  const [date] = useState<string>(() => todayKST());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, period);
    } catch {
      // localStorage 비활성 환경 — 무시
    }
  }, [period]);

  const stats = useMyStats({ period, date });
  const records = stats.data?.records ?? [];
  const summary = stats.data?.summary;

  return (
    <Stack spacing={3} data-testid="attendance-page">
      <Typography variant="h1">{t('attendance.stats.title')}</Typography>

      <PeriodTabs value={period} onChange={setPeriod} />

      {summary && (
        <OvertimeWarning weeklyMinutes={summary.weeklyTotalMinutes} />
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' },
          gap: 3,
        }}
      >
        <Box>
          <WeeklyChart records={records} />
        </Box>
        <Box>
          {summary ? (
            <StatsSummary summary={summary} />
          ) : (
            <Box
              sx={{
                height: 200,
                borderRadius: '14px',
                border: '1px dashed',
                borderColor: 'divider',
              }}
            />
          )}
        </Box>
      </Box>

      <RecordsTable
        records={records}
        isLoading={stats.isLoading}
        isError={stats.isError}
        error={stats.error}
        onRetry={() => {
          void stats.refetch();
        }}
      />
    </Stack>
  );
}
