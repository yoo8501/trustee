import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { FieldError } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { ApiError } from '../../../lib/api';
import { useAuth } from '../context';
import { RegisterSchema, type RegisterInput } from '../schemas';

interface RegisterFormProps {
  onSuccess?: (name: string) => void;
}

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const { t } = useTranslation();
  const { register: registerAccount } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isValid, submitCount },
  } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
    mode: 'onChange',
    defaultValues: { name: '', email: '', password: '' },
  });

  const fieldHelp = (
    err: FieldError | undefined,
    field: 'name' | 'email' | 'password',
  ) =>
    err
      ? t(`error.field.${field}.${err.message ?? 'required'}`, {
          defaultValue: t('error.unknown'),
        })
      : ' ';

  const onSubmit = handleSubmit(async (values) => {
    try {
      await registerAccount(values);
      onSuccess?.(values.name);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.errorCode === 'EMAIL_DUPLICATE') {
          setError('email', { type: 'duplicate', message: 'duplicate' });
          return;
        }
        if (e.errorCode === 'VALIDATION_FAILED' && e.fields) {
          e.fields.forEach(({ field, reason }) => {
            if (
              field === 'email' ||
              field === 'password' ||
              field === 'name'
            ) {
              setError(field, { type: reason, message: reason });
            }
          });
          return;
        }
        setError('root.serverError', {
          type: e.errorCode ?? 'unknown',
          message: e.errorCode ?? 'unknown',
        });
        return;
      }
      setError('root.serverError', {
        type: 'unknown',
        message: 'unknown',
      });
    }
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void onSubmit(e);
    }
  };

  const rootCode = errors.root?.serverError?.type;
  const showServerBanner = !!rootCode && submitCount > 0;

  const disabled = isSubmitting || !isValid;
  const disabledReason = !isValid
    ? t('login.disabled.invalid', {
        defaultValue: '입력값을 확인해 주세요',
      })
    : '';

  return (
    <Stack
      component="form"
      onSubmit={onSubmit}
      onKeyDown={handleKeyDown}
      spacing={2}
      noValidate
      data-testid="register-form"
      aria-label={t('register.title')}
    >
      <Typography variant="h1">{t('register.title')}</Typography>

      {showServerBanner && (
        <Alert severity="error" data-testid="register-error">
          {t(`error.${rootCode}`, {
            defaultValue: t('error.unknown'),
          })}
        </Alert>
      )}

      <TextField
        label={t('register.name')}
        autoComplete="name"
        autoFocus
        required
        fullWidth
        error={!!errors.name}
        helperText={fieldHelp(errors.name, 'name')}
        slotProps={{ htmlInput: { 'aria-invalid': !!errors.name } }}
        {...register('name')}
      />

      <TextField
        type="email"
        label={t('login.email')}
        autoComplete="email"
        required
        fullWidth
        error={!!errors.email}
        helperText={fieldHelp(errors.email, 'email')}
        slotProps={{ htmlInput: { 'aria-invalid': !!errors.email } }}
        {...register('email')}
      />

      <TextField
        type="password"
        label={t('login.password')}
        autoComplete="new-password"
        required
        fullWidth
        error={!!errors.password}
        helperText={fieldHelp(errors.password, 'password')}
        slotProps={{ htmlInput: { 'aria-invalid': !!errors.password } }}
        {...register('password')}
      />

      <Stack direction="row" spacing={1.5} alignItems="center">
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={disabled}
          data-testid="register-submit"
        >
          {t('register.submit')}
        </Button>
        {!isValid && submitCount > 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            data-testid="register-disabled-reason"
          >
            {disabledReason}
          </Typography>
        )}
      </Stack>

      <Typography variant="body2">
        <Link component={RouterLink} to="/login">
          {t('register.toLogin')}
        </Link>
      </Typography>
    </Stack>
  );
}
