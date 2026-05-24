'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, CircularProgress } from '@mui/material';
import { useMe } from '@/hooks/useAuth';

interface AuthGuardProps {
  children: React.ReactNode;
  adminOnly?: boolean;
}

export default function AuthGuard({ children, adminOnly = false }: AuthGuardProps) {
  const router = useRouter();
  const { data: user, isLoading, isError } = useMe();

  useEffect(() => {
    if (!isLoading && isError) {
      router.push('/login');
    }
    if (!isLoading && user && adminOnly && user.role !== 'admin') {
      router.push('/');
    }
  }, [isLoading, isError, user, adminOnly, router]);

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (isError || (adminOnly && user?.role !== 'admin')) {
    return null;
  }

  return <>{children}</>;
}
