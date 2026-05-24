'use client';

import { Box, Paper, Typography, Divider } from '@mui/material';
import Link from 'next/link';
import LoginForm from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Paper
        elevation={2}
        sx={{
          p: 4,
          maxWidth: 440,
          width: '100%',
          borderRadius: 3,
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography
            variant="h4"
            fontWeight={700}
            color="primary"
            sx={{ mb: 1 }}
          >
            DocFlow
          </Typography>
          <Typography variant="body2" color="text.secondary">
            문서관리시스템에 로그인
          </Typography>
        </Box>

        <LoginForm />

        <Divider sx={{ my: 3 }} />

        <Typography variant="body2" color="text.secondary" textAlign="center">
          계정이 없으신가요?{' '}
          <Link
            href="/register"
            style={{ color: '#1565C0', textDecoration: 'none', fontWeight: 500 }}
          >
            회원가입
          </Link>
        </Typography>
      </Paper>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ position: 'fixed', bottom: 24 }}
      >
        &copy; 2026 DocFlow. All rights reserved.
      </Typography>
    </Box>
  );
}
