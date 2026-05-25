import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';

export function NotFoundRoute() {
  const { t } = useTranslation();
  return (
    <Stack spacing={2} alignItems="flex-start" data-testid="not-found">
      <Typography variant="h1">{t('route.notFound.title')}</Typography>
      <Typography variant="body1" color="text.secondary">
        {t('route.notFound.body')}
      </Typography>
      <Button component={RouterLink} to="/" variant="contained">
        {t('route.notFound.cta')}
      </Button>
    </Stack>
  );
}
