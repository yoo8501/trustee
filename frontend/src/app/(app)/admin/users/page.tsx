'use client';

import { Box, Paper, Typography } from '@mui/material';
import AuthGuard from '@/components/auth/AuthGuard';
import UserList from '@/components/users/UserList';

export default function AdminUsersPage() {
  return (
    <AuthGuard adminOnly>
      <Box>
        <Typography variant="h5" fontWeight={600} sx={{ mb: 0.5 }}>
          사용자 관리
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          시스템 사용자를 관리합니다
        </Typography>

        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <UserList />
        </Paper>
      </Box>
    </AuthGuard>
  );
}
