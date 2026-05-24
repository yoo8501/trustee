'use client';

import { useState } from 'react';
import { Box, Toolbar, useMediaQuery, useTheme } from '@mui/material';
import AuthGuard from '@/components/auth/AuthGuard';
import AppHeader from '@/components/common/AppHeader';
import AppSidebar, { DRAWER_WIDTH } from '@/components/common/AppSidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));

  return (
    <AuthGuard>
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <AppHeader onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            ...(isDesktop && { ml: `${DRAWER_WIDTH}px` }),
          }}
        >
          <Toolbar />
          {children}
        </Box>
      </Box>
    </AuthGuard>
  );
}
