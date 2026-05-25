import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useThemeMode } from '../../../lib/theme/useThemeMode';
import { leaveColor } from '../lib/leaveColor';
import type { CalendarLeave } from '../schemas';

interface CalendarEventProps {
  leave: CalendarLeave;
}

/**
 * 캘린더 셀 안의 휴가 chip.
 *
 * 접근성: 색상 + 텍스트 라벨 동시 표시 (DESIGN.md §접근성 — 색맹 대응).
 * 결재 상태:
 *  - approved: 색상 채움
 *  - pending: 색상 outline + 점선 → 색에 의존하지 않고도 구분 가능
 *  - rejected/cancelled: 회색 + 취소선 (본인만 보임)
 */
export function CalendarEvent({ leave }: CalendarEventProps) {
  const { mode } = useThemeMode();
  const baseColor = leaveColor(leave.leaveTypeCode, mode);

  const isPending = leave.status === 'pending';
  const isCancelled =
    leave.status === 'cancelled' || leave.status === 'rejected';

  return (
    <Tooltip
      title={
        leave.reason
          ? `${leave.requesterName} · ${leave.leaveTypeName} — ${leave.reason}`
          : `${leave.requesterName} · ${leave.leaveTypeName}`
      }
      arrow
    >
      <Box
        data-testid={`calendar-event-${leave.id}`}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          borderRadius: '4px',
          px: 0.75,
          py: 0.25,
          bgcolor: isPending || isCancelled ? 'transparent' : baseColor,
          border: isPending
            ? `1px dashed ${baseColor}`
            : isCancelled
              ? '1px solid'
              : '0',
          borderColor: isCancelled ? 'divider' : undefined,
          color: isPending || isCancelled ? 'text.primary' : '#0f172a',
          minHeight: 18,
          overflow: 'hidden',
          cursor: 'default',
        }}
      >
        <Typography
          variant="caption"
          component="span"
          sx={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            textDecoration: isCancelled ? 'line-through' : 'none',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {leave.leaveTypeName} · {leave.requesterName}
        </Typography>
      </Box>
    </Tooltip>
  );
}
