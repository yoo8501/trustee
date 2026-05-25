import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApprove } from '../hooks/useApprove';
import { usePendingApprovals } from '../hooks/usePendingApprovals';
import { useReject } from '../hooks/useReject';
import type { LeaveRequest } from '../schemas';

function formatKSTDateOnly(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 결재 대기함 테이블.
 *
 * 승인은 즉시 호출, 반려는 dialog 로 reason 입력 (필수).
 */
export function ApprovalQueueTable() {
  const { t } = useTranslation();
  const pendingQ = usePendingApprovals();
  const approveMut = useApprove();
  const rejectMut = useReject();

  const [rejectTarget, setRejectTarget] = useState<LeaveRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectReasonError, setRejectReasonError] = useState(false);

  const closeReject = () => {
    setRejectTarget(null);
    setRejectReason('');
    setRejectReasonError(false);
  };

  const handleConfirmReject = () => {
    if (!rejectTarget) return;
    const trimmed = rejectReason.trim();
    if (trimmed.length === 0) {
      setRejectReasonError(true);
      return;
    }
    rejectMut.mutate(
      { id: rejectTarget.id, reason: trimmed },
      {
        onSuccess: closeReject,
      },
    );
  };

  if (pendingQ.isLoading) {
    return (
      <Typography
        variant="body2"
        color="text.secondary"
        data-testid="approvals-loading"
      >
        {t('admin.users.loading')}
      </Typography>
    );
  }
  if (pendingQ.isError) {
    return (
      <Typography
        variant="body2"
        color="error"
        data-testid="approvals-error"
      >
        {t('leave.approvals.loadError')}
      </Typography>
    );
  }
  const items = pendingQ.data?.items ?? [];
  if (items.length === 0) {
    return (
      <Typography
        variant="body2"
        color="text.disabled"
        data-testid="approvals-empty"
      >
        {t('leave.approvals.empty')}
      </Typography>
    );
  }

  return (
    <>
      <TableContainer data-testid="approvals-table">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('leave.approvals.col.requester')}</TableCell>
              <TableCell>{t('leave.approvals.col.type')}</TableCell>
              <TableCell>{t('leave.approvals.col.period')}</TableCell>
              <TableCell align="right">
                {t('leave.approvals.col.hours')}
              </TableCell>
              <TableCell>{t('leave.approvals.col.reason')}</TableCell>
              <TableCell align="right">
                {t('leave.approvals.col.actions')}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((r) => (
              <TableRow
                key={r.id}
                hover
                data-testid={`approvals-row-${r.id}`}
              >
                <TableCell>{r.requesterName ?? `#${r.requesterId}`}</TableCell>
                <TableCell>
                  {r.leaveTypeName || `#${r.leaveTypeId}`}
                </TableCell>
                <TableCell>
                  {formatKSTDateOnly(r.startAt)} ~ {formatKSTDateOnly(r.endAt)}
                </TableCell>
                <TableCell align="right">{r.hours.toFixed(1)}</TableCell>
                <TableCell>{r.reason ?? '-'}</TableCell>
                <TableCell align="right">
                  <Stack
                    direction="row"
                    spacing={1}
                    justifyContent="flex-end"
                  >
                    <Button
                      variant="contained"
                      size="small"
                      color="success"
                      disabled={approveMut.isPending}
                      onClick={() => approveMut.mutate({ id: r.id })}
                      data-testid={`approvals-approve-${r.id}`}
                    >
                      {t('common.approve')}
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      color="error"
                      onClick={() => setRejectTarget(r)}
                      data-testid={`approvals-reject-${r.id}`}
                    >
                      {t('common.reject')}
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!rejectTarget} onClose={closeReject} fullWidth maxWidth="sm">
        <DialogTitle>{t('leave.approvals.reject.dialog.title')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            fullWidth
            label={t('leave.approvals.reject.dialog.reason')}
            multiline
            minRows={2}
            value={rejectReason}
            onChange={(e) => {
              setRejectReason(e.target.value);
              if (rejectReasonError && e.target.value.trim().length > 0) {
                setRejectReasonError(false);
              }
            }}
            error={rejectReasonError}
            helperText={
              rejectReasonError
                ? t('leave.approvals.reject.reasonRequired')
                : ' '
            }
            data-testid="approvals-reject-reason"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeReject}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmReject}
            disabled={rejectMut.isPending}
            data-testid="approvals-reject-submit"
          >
            {t('leave.approvals.reject.dialog.submit')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
