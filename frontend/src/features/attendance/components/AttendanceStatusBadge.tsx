import Chip from '@mui/material/Chip';
import { useTranslation } from 'react-i18next';
import type { AttendanceStatus } from '../types';

interface AttendanceStatusBadgeProps {
  status: AttendanceStatus | null | undefined;
  /** 출근 했지만 퇴근 안 한 상태(`출근 중`) 강조용 — status 무시하고 working chip 표시 */
  isWorking?: boolean;
}

/**
 * 출퇴근 상태 배지.
 * - radius-pill (DESIGN.md §Border radius scale)
 * - 색상 의미는 DESIGN.md §일관성 (warn=주황, ok=녹색 등)
 *
 * isWorking=true 인 경우 (오늘 출근만 됨) "출근 중" 으로 표시.
 * 그 외 status enum 별 라벨.
 */
export function AttendanceStatusBadge({
  status,
  isWorking,
}: AttendanceStatusBadgeProps) {
  const { t } = useTranslation();

  if (isWorking) {
    return (
      <Chip
        label={t('attendance.status.working')}
        size="small"
        color="success"
        variant="filled"
        data-testid="attendance-status-badge"
        sx={{ borderRadius: '999px', fontWeight: 600 }}
      />
    );
  }

  if (status == null) return null;

  const colorByStatus: Record<
    AttendanceStatus,
    'default' | 'success' | 'warning' | 'error' | 'info'
  > = {
    normal: 'success',
    late: 'warning',
    early_leave: 'warning',
    absent: 'error',
    auto_closed: 'warning',
  };

  return (
    <Chip
      label={t(`attendance.status.${status}`)}
      size="small"
      color={colorByStatus[status]}
      variant="outlined"
      data-testid="attendance-status-badge"
      sx={{ borderRadius: '999px', fontWeight: 600 }}
    />
  );
}
