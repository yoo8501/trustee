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
import { registerSchema, type RegisterFormData } from '@/lib/validations/auth';
import { useRegister } from '@/hooks/useAuth';
import { AxiosError } from 'axios';

export default function RegisterForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [apiError, setApiError] = useState('');
  const registerMutation = useRegister();

  const {
    register: registerField,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
  });

  const onSubmit = (data: RegisterFormData) => {
    setApiError('');
    registerMutation.mutate(data, {
      onError: (error) => {
        if (error instanceof AxiosError) {
          const code = error.response?.data?.error?.code;
          if (code === 'EMAIL_ALREADY_EXISTS') {
            setApiError('이미 사용 중인 이메일입니다');
          } else {
            setApiError('회원가입에 실패했습니다. 다시 시도해주세요');
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
        {...registerField('tenant_name')}
        label="회사명"
        fullWidth
        autoFocus
        error={!!errors.tenant_name}
        helperText={errors.tenant_name?.message}
        disabled={registerMutation.isPending}
        sx={{ mb: 2.5 }}
      />

      <TextField
        {...registerField('name')}
        label="이름"
        fullWidth
        error={!!errors.name}
        helperText={errors.name?.message}
        disabled={registerMutation.isPending}
        sx={{ mb: 2.5 }}
      />

      <TextField
        {...registerField('email')}
        label="이메일 주소"
        type="email"
        fullWidth
        autoComplete="email"
        error={!!errors.email}
        helperText={errors.email?.message}
        disabled={registerMutation.isPending}
        sx={{ mb: 2.5 }}
      />

      <TextField
        {...registerField('password')}
        label="비밀번호"
        type={showPassword ? 'text' : 'password'}
        fullWidth
        autoComplete="new-password"
        error={!!errors.password}
        helperText={errors.password?.message || '8자 이상, 영문과 숫자를 포함해야 합니다'}
        disabled={registerMutation.isPending}
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
        disabled={registerMutation.isPending}
        disableElevation
        sx={{ py: 1.5, borderRadius: 2 }}
      >
        {registerMutation.isPending ? <CircularProgress size={24} color="inherit" /> : '회원가입'}
      </Button>
    </Box>
  );
}
