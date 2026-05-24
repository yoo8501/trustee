'use client';

import { Box, Paper, Typography, Divider } from '@mui/material';
import Link from 'next/link';
import RegisterForm from '@/components/auth/RegisterForm';

export default function RegisterPage() {
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
            새 계정 만들기
          </Typography>
        </Box>

        <RegisterForm />

        <Divider sx={{ my: 3 }} />

        <Typography variant="body2" color="text.secondary" textAlign="center">
          이미 계정이 있으신가요?{' '}
          <Link
            href="/login"
            style={{ color: '#1565C0', textDecoration: 'none', fontWeight: 500 }}
          >
            로그인
          </Link>
        </Typography>
      </Paper>
    </Box>
  );
}
