import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { resolveErrorMessage } from '../../../lib/i18n';
import type { ApiError } from '../../../lib/api';
import type { RecordStats } from '../stats-types';
import { formatTimeKST } from '../utils';
import { AttendanceStatusBadge } from './AttendanceStatusBadge';

interface RecordsTableProps {
  records: RecordStats[];
  isLoading: boolean;
  isError: boolean;
  error?: ApiError | null;
  onRetry?: () => void;
}

const EMDASH = '—';

function formatMinutes(min: number): string {
  if (min <= 0) return `0h`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * 일별 통계 테이블 (5 상태 처리).
 *
 *  - Loading: Skeleton rows
 *  - Error: Alert + retry
 *  - Empty: 안내 + 다음 행동 hint
 *  - Success: 전체 행 렌더
 *  - Partial: 행은 있지만 checkOutAt null 등 누락은 em-dash placeholder
 *
 * DESIGN.md §인터랙션 상태 — 모든 상태에 일관된 카피.
 */
export function RecordsTable({
  records,
  isLoading,
  isError,
  error,
  onRetry,
}: RecordsTableProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Box data-testid="records-table-loading" sx={{ p: 2 }}>
        <Stack spacing={1}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={36} />
          ))}
        </Stack>
      </Box>
    );
  }

  if (isError) {
    return (
      <Alert
        severity="error"
        data-testid="records-table-error"
        action={
          onRetry ? (
            <Button color="inherit" size="small" onClick={onRetry}>
              {t('common.confirm')}
            </Button>
          ) : undefined
        }
        sx={{ borderRadius: '12px' }}
      >
        {error
          ? resolveErrorMessage(error, t)
          : t('attendance.error')}
      </Alert>
    );
  }

  if (records.length === 0) {
    return (
      <Box
        data-testid="records-table-empty"
        sx={{
          p: 4,
          textAlign: 'center',
          color: 'text.secondary',
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: '12px',
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="body2">{t('attendance.empty')}</Typography>
      </Box>
    );
  }

  return (
    <TableContainer
      data-testid="records-table"
      sx={{
        borderRadius: '12px',
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t('attendance.records.date')}</TableCell>
            <TableCell>{t('attendance.records.checkIn')}</TableCell>
            <TableCell>{t('attendance.records.checkOut')}</TableCell>
            <TableCell align="right">{t('attendance.records.actual')}</TableCell>
            <TableCell align="right">
              {t('attendance.records.adjusted')}
            </TableCell>
            <TableCell align="right">
              {t('attendance.records.overtime')}
            </TableCell>
            <TableCell>{t('attendance.records.status')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {records.map((r) => (
            <TableRow
              key={r.date}
              data-testid={`records-table-row-${r.date}`}
              hover
            >
              <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {r.date}
              </TableCell>
              <TableCell
                data-testid={`records-table-row-${r.date}-checkIn`}
                sx={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {r.checkInAt ? formatTimeKST(r.checkInAt) : EMDASH}
              </TableCell>
              <TableCell
                data-testid={`records-table-row-${r.date}-checkOut`}
                sx={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {r.checkOutAt ? formatTimeKST(r.checkOutAt) : EMDASH}
              </TableCell>
              <TableCell
                align="right"
                sx={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatMinutes(r.actualWorkMinutes)}
              </TableCell>
              <TableCell
                align="right"
                data-testid={`records-table-row-${r.date}-adjustedExpected`}
                sx={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatMinutes(r.adjustedExpected)}
                {r.leaveHours > 0 && (
                  <Typography
                    component="span"
                    variant="caption"
                    color="info.main"
                    sx={{ ml: 0.5 }}
                  >
                    (-{r.leaveHours}h)
                  </Typography>
                )}
              </TableCell>
              <TableCell
                align="right"
                sx={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatMinutes(r.overtimeMinutes)}
              </TableCell>
              <TableCell>
                <AttendanceStatusBadge status={r.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
