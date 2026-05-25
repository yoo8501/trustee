import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { TeamTreeView, useUsersList } from '../../features/admin';

export function AdminTeamsPage() {
  const { t } = useTranslation();
  const { data } = useUsersList({ size: 500 });
  return (
    <Stack spacing={3} data-testid="admin-teams-page">
      <Typography variant="h1">{t('admin.teams.title')}</Typography>
      <TeamTreeView users={data?.items ?? []} />
    </Stack>
  );
}
