import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../features/auth';

export function HomeRoute() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <Stack spacing={2} data-testid="home-root">
      <Typography variant="h1">{t('route.home.title')}</Typography>
      {user && (
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Typography variant="body1" data-testid="home-welcome">
            {t('route.home.welcome', { name: user.name })}
          </Typography>
          <Chip
            size="small"
            color="primary"
            variant="outlined"
            label={user.role}
            data-testid="home-role"
          />
        </Stack>
      )}
      <Typography variant="body1" color="text.secondary">
        {t('route.home.body')}
      </Typography>
    </Stack>
  );
}
