import Container from '@mui/material/Container';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { RegisterForm } from '../features/auth';

export function RegisterRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const handleSuccess = (name: string) => {
    enqueueSnackbar(t('login.success', { name }), { variant: 'success' });
    navigate('/', { replace: true });
  };

  return (
    <Container maxWidth="xs" sx={{ py: 4 }}>
      <RegisterForm onSuccess={handleSuccess} />
    </Container>
  );
}
