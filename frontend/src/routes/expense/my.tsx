import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { ExpenseCard, useMyExpenses } from '../../features/expensereport';

/**
 * /expense/my — 내 지출결의서 목록 (Sprint 7).
 *
 * 각 신청은 ExpenseCard 로 표시. pending 만 취소 버튼 (5초 Undo).
 */
export function ExpenseMyPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useMyExpenses();

  return (
    <Stack spacing={3} data-testid="expense-my-page">
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <Stack spacing={0.5}>
          <Typography variant="h1">{t('expense.my.title')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('expense.my.subtitle')}
          </Typography>
        </Stack>
        <Button
          component={RouterLink}
          to="/expense/new"
          variant="contained"
          data-testid="expense-my-new-button"
        >
          {t('expense.my.newButton')}
        </Button>
      </Stack>

      {isLoading && (
        <Typography
          variant="body2"
          color="text.secondary"
          data-testid="expense-my-loading"
        >
          {t('admin.users.loading')}
        </Typography>
      )}
      {isError && (
        <Typography
          variant="body2"
          color="error"
          data-testid="expense-my-error"
        >
          {t('expense.my.loadError')}
        </Typography>
      )}
      {!isLoading && !isError && (data?.items.length ?? 0) === 0 && (
        <Typography
          variant="body2"
          color="text.disabled"
          data-testid="expense-my-empty"
        >
          {t('expense.my.empty')}
        </Typography>
      )}

      <Stack spacing={1.5}>
        {(data?.items ?? []).map((r) => (
          <ExpenseCard key={r.id} expense={r} />
        ))}
      </Stack>
    </Stack>
  );
}
