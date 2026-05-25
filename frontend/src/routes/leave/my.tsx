import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import {
  LeaveRequestCard,
  useMyLeaveRequests,
} from '../../features/leaverequest';

/**
 * /leave/my — 내 휴가 목록.
 *
 * 각 신청은 LeaveRequestCard 로 표시. pending 만 취소 버튼 (5초 Undo).
 */
export function LeaveMyPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useMyLeaveRequests();

  return (
    <Stack spacing={3} data-testid="leave-my-page">
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <Stack spacing={0.5}>
          <Typography variant="h1">{t('leave.my.title')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('leave.my.subtitle')}
          </Typography>
        </Stack>
        <Button
          component={RouterLink}
          to="/leave/new"
          variant="contained"
          data-testid="leave-my-new-button"
        >
          {t('leave.my.newButton')}
        </Button>
      </Stack>

      {isLoading && (
        <Typography
          variant="body2"
          color="text.secondary"
          data-testid="leave-my-loading"
        >
          {t('admin.users.loading')}
        </Typography>
      )}
      {isError && (
        <Typography
          variant="body2"
          color="error"
          data-testid="leave-my-error"
        >
          {t('leave.my.loadError')}
        </Typography>
      )}
      {!isLoading && !isError && (data?.items.length ?? 0) === 0 && (
        <Typography
          variant="body2"
          color="text.disabled"
          data-testid="leave-my-empty"
        >
          {t('leave.my.empty')}
        </Typography>
      )}

      <Stack spacing={1.5}>
        {(data?.items ?? []).map((r) => (
          <LeaveRequestCard key={r.id} request={r} />
        ))}
      </Stack>
    </Stack>
  );
}
