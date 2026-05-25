import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { UserSearchTable } from '../../features/admin';

export function AdminUsersPage() {
  const { t } = useTranslation();
  return (
    <Stack spacing={3} data-testid="admin-users-page">
      <Typography variant="h1">{t('admin.users.title')}</Typography>
      <UserSearchTable />
    </Stack>
  );
}
