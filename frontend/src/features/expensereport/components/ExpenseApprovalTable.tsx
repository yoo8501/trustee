import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
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
import { useApproveExpense } from '../hooks/useApproveExpense';
import { usePendingExpenses } from '../hooks/usePendingExpenses';
import { useRejectExpense } from '../hooks/useRejectExpense';
import { formatCurrency } from '../lib/formatCurrency';
import type { ExpenseReport } from '../schemas';

/**
 * 지출결의서 결재 대기함 — Sprint 7.
 *
 * Sprint 6 ApprovalQueueTable 패턴 그대로. 컬럼: 신청자/날짜/금액/거래처/사유/첨부/액션.
 */
export function ExpenseApprovalTable() {
  const { t } = useTranslation();
  const pendingQ = usePendingExpenses();
  const approveMut = useApproveExpense();
  const rejectMut = useRejectExpense();

  const [rejectTarget, setRejectTarget] = useState<ExpenseReport | null>(null);
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
      { onSuccess: closeReject },
    );
  };

  if (pendingQ.isLoading) {
    return (
      <Typography
        variant="body2"
        color="text.secondary"
        data-testid="expense-approvals-loading"
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
        data-testid="expense-approvals-error"
      >
        {t('expense.approvals.loadError')}
      </Typography>
    );
  }
  const items = pendingQ.data?.items ?? [];
  if (items.length === 0) {
    return (
      <Typography
        variant="body2"
        color="text.disabled"
        data-testid="expense-approvals-empty"
      >
        {t('expense.approvals.empty')}
      </Typography>
    );
  }

  return (
    <>
      <TableContainer data-testid="expense-approvals-table">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('expense.approvals.col.requester')}</TableCell>
              <TableCell>{t('expense.approvals.col.paidAt')}</TableCell>
              <TableCell align="right">
                {t('expense.approvals.col.amount')}
              </TableCell>
              <TableCell>{t('expense.approvals.col.vendor')}</TableCell>
              <TableCell>{t('expense.approvals.col.purpose')}</TableCell>
              <TableCell>{t('expense.approvals.col.attachment')}</TableCell>
              <TableCell align="right">
                {t('expense.approvals.col.actions')}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((r) => (
              <TableRow
                key={r.id}
                hover
                data-testid={`expense-approvals-row-${r.id}`}
              >
                <TableCell>
                  {r.requesterName || `#${r.requesterId}`}
                </TableCell>
                <TableCell>{r.paidAt}</TableCell>
                <TableCell align="right">
                  {formatCurrency(r.amountWon)}
                </TableCell>
                <TableCell>{r.vendor}</TableCell>
                <TableCell>{r.purpose || '-'}</TableCell>
                <TableCell>
                  {r.attachmentUrl ? (
                    <Link
                      href={r.attachmentUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      data-testid={`expense-approvals-attachment-${r.id}`}
                    >
                      {t('expense.attachment.preview')}
                    </Link>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button
                      variant="contained"
                      size="small"
                      color="success"
                      disabled={approveMut.isPending}
                      onClick={() => approveMut.mutate({ id: r.id })}
                      data-testid={`expense-approvals-approve-${r.id}`}
                    >
                      {t('common.approve')}
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      color="error"
                      onClick={() => setRejectTarget(r)}
                      data-testid={`expense-approvals-reject-${r.id}`}
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
        <DialogTitle>{t('expense.approvals.reject.dialog.title')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            fullWidth
            label={t('expense.approvals.reject.dialog.reason')}
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
                ? t('expense.approvals.reject.reasonRequired')
                : ' '
            }
            data-testid="expense-approvals-reject-reason"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeReject}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmReject}
            disabled={rejectMut.isPending}
            data-testid="expense-approvals-reject-submit"
          >
            {t('expense.approvals.reject.dialog.submit')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
