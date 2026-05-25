import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useUndoableMutation } from '../../../lib/undoable';
import { useCancel } from '../hooks/useCancel';
import type { LeaveRequest } from '../schemas';
import { LeaveStatusChip } from './LeaveStatusChip';

function formatKSTDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface LeaveRequestCardProps {
  request: LeaveRequest;
}

/**
 * /leave/my 화면에서 각 신청을 카드로 표시.
 *
 * pending 상태일 때만 취소 버튼 노출. 취소는 5초 Undo 패턴.
 */
export function LeaveRequestCard({ request }: LeaveRequestCardProps) {
  const { t } = useTranslation();
  const cancelMut = useCancel();

  const undoable = useUndoableMutation({
    mutationFn: () => cancelMut.mutateAsync(request.id),
    undoMessage: t('leave.cancel.undoMessage'),
    successMessage: t('leave.cancel.success'),
    errorMessage: t('leave.cancel.error'),
    delayMs: 5000,
  });

  const canCancel = request.status === 'pending';

  return (
    <Card
      variant="outlined"
      data-testid={`leave-request-card-${request.id}`}
      sx={{ borderRadius: 2 }}
    >
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          spacing={1.5}
        >
          <Stack spacing={0.5} sx={{ flexGrow: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h3">
                {request.leaveTypeName || `#${request.leaveTypeId}`}
              </Typography>
              <LeaveStatusChip status={request.status} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {formatKSTDateTime(request.startAt)} ~{' '}
              {formatKSTDateTime(request.endAt)} (
              {t('leave.create.totalHours', { hours: request.hours.toFixed(1) })}
              )
            </Typography>
            {request.reason && (
              <Typography variant="body2" color="text.secondary">
                {request.reason}
              </Typography>
            )}
            {request.approverName && (
              <Typography variant="caption" color="text.disabled">
                {t('leave.create.approverHint', { name: request.approverName })}
              </Typography>
            )}
          </Stack>

          {canCancel && (
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={() => undoable.trigger()}
              data-testid={`leave-request-cancel-${request.id}`}
            >
              {t('leave.cancel.button')}
            </Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
