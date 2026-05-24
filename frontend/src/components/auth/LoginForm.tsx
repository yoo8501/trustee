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
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { loginSchema, type LoginFormData } from '@/lib/validations/auth';
import { useLogin } from '@/hooks/useAuth';
import { AxiosError } from 'axios';

export default function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [apiError, setApiError] = useState('');
  const login = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
  });

  const onSubmit = (data: LoginFormData) => {
    setApiError('');
    login.mutate(data, {
      onError: (error) => {
        if (error instanceof AxiosError) {
          const code = error.response?.data?.error?.code;
          if (code === 'INVALID_CREDENTIALS') {
            setApiError('이메일 또는 비밀번호가 올바르지 않습니다');
          } else if (code === 'TOO_MANY_REQUESTS') {
            setApiError('잠시 후 다시 시도해주세요');
          } else {
            setApiError('로그인에 실패했습니다. 다시 시도해주세요');
          }
        }
      },
    });
  };

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {apiError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {apiError}
        </Alert>
      )}

      <TextField
        {...register('email')}
        label="이메일 주소"
        type="email"
        fullWidth
        autoComplete="email"
        autoFocus
        error={!!errors.email}
        helperText={errors.email?.message}
        disabled={login.isPending}
        sx={{ mb: 2.5 }}
      />

      <TextField
        {...register('password')}
        label="비밀번호"
        type={showPassword ? 'text' : 'password'}
        fullWidth
        autoComplete="current-password"
        error={!!errors.password}
        helperText={errors.password?.message}
        disabled={login.isPending}
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                  onClick={() => setShowPassword(!showPassword)}
                  edge="end"
                >
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
        sx={{ mb: 3 }}
      />

      <Button
        type="submit"
        fullWidth
        variant="contained"
        size="large"
        disabled={login.isPending}
        disableElevation
        sx={{ py: 1.5, borderRadius: 2 }}
      >
        {login.isPending ? <CircularProgress size={24} color="inherit" /> : '로그인'}
      </Button>
    </Box>
  );
}
