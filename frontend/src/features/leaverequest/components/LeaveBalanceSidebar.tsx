import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import type { LeaveBalance } from '../schemas';

interface LeaveBalanceSidebarProps {
  balances: LeaveBalance[];
  /** 강조 표시할 휴가 종류 (현재 폼에서 선택된 종류). */
  highlightLeaveTypeId?: number | null;
}

/**
 * 휴가 잔여 사이드바 — DESIGN.md wireframe.
 *
 * sticky top 으로 폼 옆에 따라다닌다.
 * 잔여 0 ≤ 4시간 → warn 색상 (낮은 잔여 강조).
 */
export function LeaveBalanceSidebar({
  balances,
  highlightLeaveTypeId,
}: LeaveBalanceSidebarProps) {
  const { t } = useTranslation();
  return (
    <Card
      variant="outlined"
      data-testid="leave-balance-sidebar"
      sx={{
        borderRadius: 2,
        p: 2.5,
        position: { md: 'sticky' },
        top: { md: 24 },
        bgcolor: 'background.paper',
      }}
    >
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ letterSpacing: '0.05em', mb: 1.5, display: 'block' }}
      >
        {t('leave.balance.title')}
      </Typography>
      {balances.length === 0 ? (
        <Typography
          variant="body2"
          color="text.disabled"
          data-testid="leave-balance-empty"
        >
          {t('leave.balance.empty')}
        </Typography>
      ) : (
        <Stack divider={<Divider />} spacing={0}>
          {balances.map((b) => {
            const isLow = b.remainingHours <= 4;
            const isHighlight = b.leaveTypeId === highlightLeaveTypeId;
            return (
              <Stack
                key={b.id}
                direction="row"
                justifyContent="space-between"
                alignItems="baseline"
                sx={{
                  py: 1.25,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:last-of-type': { borderBottom: 'none' },
                }}
                data-testid={`leave-balance-row-${b.leaveTypeId}`}
              >
                <Typography
                  variant="body2"
                  color="text.secondary"
                  fontWeight={isHighlight ? 600 : 400}
                >
                  {b.leaveTypeName || `#${b.leaveTypeId}`}
                </Typography>
                <Stack alignItems="flex-end" spacing={0.25}>
                  <Typography
                    variant="body1"
                    fontWeight={600}
                    color={isLow ? 'warning.main' : 'text.primary'}
                    sx={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {t('leave.balance.remaining', {
                      hours: b.remainingHours.toFixed(1),
                    })}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.disabled"
                    sx={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {t('leave.balance.used', {
                      used: b.usedHours.toFixed(1),
                      granted: b.grantedHours.toFixed(1),
                    })}
                  </Typography>
                </Stack>
              </Stack>
            );
          })}
        </Stack>
      )}
    </Card>
  );
}
