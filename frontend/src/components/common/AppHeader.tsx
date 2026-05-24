'use client';

import { useState } from 'react';
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  Box,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Menu as MenuIcon, Logout, Person } from '@mui/icons-material';
import { useMe, useLogout } from '@/hooks/useAuth';
import { DRAWER_WIDTH } from './AppSidebar';

interface AppHeaderProps {
  onMenuToggle: () => void;
}

export default function AppHeader({ onMenuToggle }: AppHeaderProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const { data: user } = useMe();
  const logout = useLogout();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));

  const handleMenuClose = () => setAnchorEl(null);

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        bgcolor: 'white',
        borderBottom: '1px solid',
        borderColor: 'divider',
        ...(isDesktop && {
          width: `calc(100% - ${DRAWER_WIDTH}px)`,
          ml: `${DRAWER_WIDTH}px`,
        }),
      }}
    >
      <Toolbar>
        {!isDesktop && (
          <IconButton
            edge="start"
            aria-label="메뉴"
            onClick={onMenuToggle}
            sx={{ mr: 1, color: 'text.primary' }}
          >
            <MenuIcon />
          </IconButton>
        )}

        <Typography
          variant="h6"
          noWrap
          sx={{ flexGrow: 1, color: 'text.primary', fontWeight: 600 }}
        >
          {!isDesktop && 'DocFlow'}
        </Typography>

        <Box>
          <IconButton
            onClick={(e) => setAnchorEl(e.currentTarget)}
            aria-label="사용자 메뉴"
            sx={{ gap: 1 }}
          >
            <Avatar
              sx={{
                width: 32,
                height: 32,
                bgcolor: 'primary.main',
                fontSize: '0.875rem',
              }}
            >
              {user?.name?.charAt(0) || '?'}
            </Avatar>
            {isDesktop && (
              <Typography variant="body2" color="text.primary">
                {user?.name}
              </Typography>
            )}
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="subtitle2">{user?.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {user?.email}
              </Typography>
            </Box>
            <Divider />
            <MenuItem
              onClick={() => {
                handleMenuClose();
                window.location.href = '/profile';
              }}
            >
              <Person sx={{ mr: 1.5, fontSize: 20 }} />
              내 정보
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => {
                handleMenuClose();
                logout.mutate();
              }}
            >
              <Logout sx={{ mr: 1.5, fontSize: 20 }} />
              로그아웃
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
