import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { ExpenseApprovalTable } from '../../features/expensereport';

/**
 * /expense/approvals — 지출결의서 결재 대기함 (team_lead+) — Sprint 7.
 *
 * RoleGuard 가 라우트 트리에서 감싼다.
 */
export function ExpenseApprovalsPage() {
  const { t } = useTranslation();
  return (
    <Stack spacing={3} data-testid="expense-approvals-page">
      <Stack spacing={0.5}>
        <Typography variant="h1">{t('expense.approvals.title')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('expense.approvals.subtitle')}
        </Typography>
      </Stack>
      <ExpenseApprovalTable />
    </Stack>
  );
}
