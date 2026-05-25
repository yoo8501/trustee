import Chip from '@mui/material/Chip';
import { useTranslation } from 'react-i18next';
import type { LeaveStatus } from '../schemas';

/**
 * 휴가 상태 칩 — DESIGN.md 색상 토큰 사용 (MUI palette 매핑).
 *
 * 매핑 (UX §7 결과 명확화):
 *  - pending   → warning (주황)
 *  - approved  → success (녹색)
 *  - rejected  → error   (빨강)
 *  - cancelled → default (회색)
 */

const STATUS_COLORS: Record<
  LeaveStatus,
  'warning' | 'success' | 'error' | 'default'
> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  cancelled: 'default',
};

interface LeaveStatusChipProps {
  status: LeaveStatus;
  /** 작은 사이즈 표시 (기본 small) — 다른 사이즈가 필요하면 override. */
  size?: 'small' | 'medium';
}

export function LeaveStatusChip({
  status,
  size = 'small',
}: LeaveStatusChipProps) {
  const { t } = useTranslation();
  return (
    <Chip
      label={t(`leave.status.${status}`)}
      color={STATUS_COLORS[status]}
      size={size}
      data-testid={`leave-status-chip-${status}`}
      sx={{
        fontWeight: 600,
        borderRadius: 1,
      }}
    />
  );
}
