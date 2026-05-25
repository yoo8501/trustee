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
import { LoginSchema, type LoginInput } from '../schemas';

interface LoginFormProps {
  /** 성공 시 호출 (toast 발화 등). */
  onSuccess?: (email: string) => void;
}

/**
 * 로그인 폼. RHF + Zod resolver.
 * - 폼 검증 실패 시 submit 버튼 비활성화 + inline 사유 표시 (UX §3 에러 예방).
 * - Cmd/Ctrl+Enter 제출 (UX §6 키보드).
 * - INVALID_CREDENTIALS / USER_TERMINATED 등 BE 에러는 상단 banner.
 */
export function LoginForm({ onSuccess }: LoginFormProps) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isValid, submitCount },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    mode: 'onChange',
    defaultValues: { email: '', password: '' },
  });

  const fieldHelp = (err: FieldError | undefined, field: 'email' | 'password') =>
    err
      ? t(`error.field.${field}.${err.message ?? 'required'}`, {
          defaultValue: t('error.unknown'),
        })
      : ' ';

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values);
      onSuccess?.(values.email);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.errorCode === 'VALIDATION_FAILED' && e.fields) {
          e.fields.forEach(({ field, reason }) => {
            if (field === 'email' || field === 'password') {
              setError(field, {
                type: reason,
                message: reason,
              });
            }
          });
          return;
        }
        // 폼 전체 에러는 root 에 — banner 로 표시
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
      data-testid="login-form"
      aria-label={t('login.title')}
    >
      <Typography variant="h1">{t('login.title')}</Typography>

      {showServerBanner && (
        <Alert severity="error" data-testid="login-error">
          {t(`error.${rootCode}`, {
            defaultValue: t('error.unknown'),
          })}
        </Alert>
      )}

      <TextField
        type="email"
        label={t('login.email')}
        autoComplete="email"
        autoFocus
        required
        fullWidth
        error={!!errors.email}
        helperText={fieldHelp(errors.email, 'email')}
        slotProps={{
          htmlInput: { 'aria-invalid': !!errors.email },
        }}
        {...register('email')}
      />

      <TextField
        type="password"
        label={t('login.password')}
        autoComplete="current-password"
        required
        fullWidth
        error={!!errors.password}
        helperText={fieldHelp(errors.password, 'password')}
        slotProps={{
          htmlInput: { 'aria-invalid': !!errors.password },
        }}
        {...register('password')}
      />

      <Stack direction="row" spacing={1.5} alignItems="center">
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={disabled}
          data-testid="login-submit"
        >
          {t('login.submit')}
        </Button>
        {!isValid && submitCount > 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            data-testid="login-disabled-reason"
          >
            {disabledReason}
          </Typography>
        )}
      </Stack>

      <Typography variant="body2">
        <Link component={RouterLink} to="/register">
          {t('login.toRegister')}
        </Link>
      </Typography>
    </Stack>
  );
}
