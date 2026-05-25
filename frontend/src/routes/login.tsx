import Container from '@mui/material/Container';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { LoginForm } from '../features/auth';

interface LocationState {
  from?: string;
}

export function LoginRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { enqueueSnackbar } = useSnackbar();

  const handleSuccess = (email: string) => {
    enqueueSnackbar(t('login.success', { name: email }), {
      variant: 'success',
    });
    const state = location.state as LocationState | undefined;
    navigate(state?.from ?? '/', { replace: true });
  };

  return (
    <Container maxWidth="xs" sx={{ py: 4 }}>
      <LoginForm onSuccess={handleSuccess} />
    </Container>
  );
}
