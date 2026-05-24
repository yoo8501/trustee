'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Box,
  TextField,
  Button,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { changePasswordSchema, type ChangePasswordFormData } from '@/lib/validations/auth';
import { useChangePassword } from '@/hooks/useUsers';
import { AxiosError } from 'axios';

export default function ChangePasswordForm() {
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [apiError, setApiError] = useState('');
  const [success, setSuccess] = useState(false);
  const changePassword = useChangePassword();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    mode: 'onBlur',
  });

  const onSubmit = (data: ChangePasswordFormData) => {
    setApiError('');
    changePassword.mutate(data, {
      onSuccess: () => {
        setSuccess(true);
        reset();
      },
      onError: (error) => {
        if (error instanceof AxiosError) {
          const code = error.response?.data?.error?.code;
          if (code === 'INVALID_CURRENT_PASSWORD') {
            setApiError('현재 비밀번호가 올바르지 않습니다');
          } else if (code === 'SAME_PASSWORD') {
            setApiError('새 비밀번호가 현재 비밀번호와 동일합니다');
          } else {
            setApiError('비밀번호 변경에 실패했습니다');
          }
        }
      },
    });
  };

  return (
    <>
      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        {apiError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {apiError}
          </Alert>
        )}

        <TextField
          {...register('current_password')}
          label="현재 비밀번호"
          type={showCurrent ? 'text' : 'password'}
          fullWidth
          error={!!errors.current_password}
          helperText={errors.current_password?.message}
          disabled={changePassword.isPending}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showCurrent ? '비밀번호 숨기기' : '비밀번호 표시'}
                    onClick={() => setShowCurrent(!showCurrent)}
                    edge="end"
                  >
                    {showCurrent ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
          sx={{ mb: 2.5 }}
        />

        <TextField
          {...register('new_password')}
          label="새 비밀번호"
          type={showNew ? 'text' : 'password'}
          fullWidth
          error={!!errors.new_password}
          helperText={errors.new_password?.message || '8자 이상, 영문과 숫자를 포함해야 합니다'}
          disabled={changePassword.isPending}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showNew ? '비밀번호 숨기기' : '비밀번호 표시'}
                    onClick={() => setShowNew(!showNew)}
                    edge="end"
                  >
                    {showNew ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
          sx={{ mb: 3 }}
        />

        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            type="submit"
            variant="contained"
            disabled={changePassword.isPending}
            disableElevation
            sx={{ borderRadius: 2 }}
          >
            {changePassword.isPending ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              '비밀번호 변경'
            )}
          </Button>
        </Box>
      </Box>

      <Snackbar
        open={success}
        autoHideDuration={4000}
        onClose={() => setSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccess(false)}>
          비밀번호가 변경되었습니다
        </Alert>
      </Snackbar>
    </>
  );
}
