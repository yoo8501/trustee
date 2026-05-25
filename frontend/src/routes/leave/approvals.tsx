import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { ApprovalQueueTable } from '../../features/leaverequest';

/**
 * /leave/approvals — 결재 대기함 (team_lead+).
 *
 * RoleGuard 가 라우트 트리에서 감싼다.
 */
export function LeaveApprovalsPage() {
  const { t } = useTranslation();
  return (
    <Stack spacing={3} data-testid="leave-approvals-page">
      <Stack spacing={0.5}>
        <Typography variant="h1">{t('leave.approvals.title')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('leave.approvals.subtitle')}
        </Typography>
      </Stack>
      <ApprovalQueueTable />
    </Stack>
  );
}
