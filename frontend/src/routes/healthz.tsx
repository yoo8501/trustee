import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { http } from '../lib/api';
import { resolveErrorMessage } from '../lib/i18n';

interface HealthResponse {
  status: string;
}

export function HealthzRoute() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['health'],
    queryFn: () => http.get<HealthResponse>('/api/health'),
    retry: false,
  });

  return (
    <Stack spacing={3} data-testid="healthz-root">
      <Typography variant="h1">{t('route.healthz.title')}</Typography>

      {query.isPending && (
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          data-testid="healthz-loading"
        >
          <CircularProgress size={20} />
          <Typography variant="body1" color="text.secondary">
            {t('healthz.loading')}
          </Typography>
        </Stack>
      )}

      {query.isError && (
        <Alert
          severity="error"
          data-testid="healthz-error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => query.refetch()}
            >
              {t('healthz.retry')}
            </Button>
          }
        >
          <Box>
            <Typography fontWeight={600}>{t('healthz.error')}</Typography>
            <Typography variant="body2">
              {resolveErrorMessage(query.error, t)}
            </Typography>
          </Box>
        </Alert>
      )}

      {query.isSuccess && (
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          data-testid="healthz-ok"
        >
          <Chip color="success" label={t('healthz.ok')} />
          <Typography variant="body2" color="text.secondary">
            status: {query.data.status}
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}
