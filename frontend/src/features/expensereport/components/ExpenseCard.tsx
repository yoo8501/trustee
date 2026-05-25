import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useUndoableMutation } from '../../../lib/undoable';
import { useCancelExpense } from '../hooks/useCancelExpense';
import { formatCurrency } from '../lib/formatCurrency';
import type { ExpenseReport } from '../schemas';
import { LeaveStatusChip } from '../../leaverequest';

interface ExpenseCardProps {
  expense: ExpenseReport;
}

function basename(url: string): string {
  const parts = url.split('/');
  return parts[parts.length - 1] || url;
}

/**
 * /expense/my 화면에서 각 지출결의서를 카드로 표시 — Sprint 7.
 *
 * - 상태 칩 (LeaveStatusChip 재사용 — 색상 매핑 동일)
 * - 첨부 썸네일: 이미지면 작은 이미지, 그 외는 파일명 + 다운로드 링크
 * - pending 상태에서만 취소 버튼 (5초 Undo)
 */
export function ExpenseCard({ expense }: ExpenseCardProps) {
  const { t } = useTranslation();
  const cancelMut = useCancelExpense();

  const undoable = useUndoableMutation({
    mutationFn: () => cancelMut.mutateAsync(expense.id),
    undoMessage: t('expense.cancel.undoMessage'),
    successMessage: t('expense.cancel.success'),
    errorMessage: t('expense.cancel.error'),
    delayMs: 5000,
  });

  const canCancel = expense.status === 'pending';
  const isImage = !!expense.attachmentMime?.startsWith('image/');

  return (
    <Card
      variant="outlined"
      data-testid={`expense-card-${expense.id}`}
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
              <Typography variant="h3" data-testid={`expense-card-amount-${expense.id}`}>
                {formatCurrency(expense.amountWon)}
              </Typography>
              <LeaveStatusChip status={expense.status} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {expense.vendor} · {expense.paidAt}
            </Typography>
            {expense.purpose && (
              <Typography variant="body2" color="text.secondary">
                {expense.purpose}
              </Typography>
            )}
            {expense.approverName && (
              <Typography variant="caption" color="text.disabled">
                {t('expense.create.approverHint', {
                  name: expense.approverName,
                })}
              </Typography>
            )}
          </Stack>

          <Stack direction="row" spacing={1.5} alignItems="center">
            {expense.attachmentUrl && expense.attachmentMime && (
              <Box
                data-testid={`expense-card-attachment-${expense.id}`}
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: 1,
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
                title={basename(expense.attachmentUrl)}
              >
                {isImage ? (
                  <Box
                    component="img"
                    src={expense.attachmentUrl}
                    alt={basename(expense.attachmentUrl)}
                    sx={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    PDF
                  </Typography>
                )}
              </Box>
            )}

            {canCancel && (
              <Button
                variant="outlined"
                color="error"
                size="small"
                onClick={() => undoable.trigger()}
                data-testid={`expense-card-cancel-${expense.id}`}
              >
                {t('expense.cancel.button')}
              </Button>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
