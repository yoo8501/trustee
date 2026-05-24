'use client';

import { Typography, Box } from '@mui/material';
import { useMe } from '@/hooks/useAuth';

export default function DashboardPage() {
  const { data: user } = useMe();

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} sx={{ mb: 1 }}>
        대시보드
      </Typography>
      <Typography variant="body2" color="text.secondary">
        안녕하세요, {user?.name}님. DocFlow에 오신 것을 환영합니다.
      </Typography>
    </Box>
  );
}
