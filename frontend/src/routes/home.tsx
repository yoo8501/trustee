import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

export function HomeRoute() {
  const { t } = useTranslation();
  return (
    <Stack spacing={2}>
      <Typography variant="h1">{t('route.home.title')}</Typography>
      <Typography variant="body1" color="text.secondary">
        {t('route.home.body')}
      </Typography>
    </Stack>
  );
}
