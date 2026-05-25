import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { SnackbarProvider, useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, Outlet, useNavigate } from 'react-router';
import { ThemeToggle } from '../components';
import { AuthProvider, useAuth } from '../features/auth';

/**
 * RootLayout — AppBar + Container + Outlet + AuthProvider 합성.
 *
 * AuthProvider 는 RouterProvider 안쪽(이 RootLayout 안)에 배치해서
 * `useNavigate` 와 `useSnackbar` 를 직접 활용할 수 있다.
 */
export function RootLayout() {
  return (
    <SnackbarProvider
      maxSnack={3}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <RootShell />
    </SnackbarProvider>
  );
}

function RootShell() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation();

  const handleUnauthenticated = () => {
    // 명시적 로그아웃과 자동 만료를 모두 처리.
    // 현재 경로가 이미 로그인/회원가입이면 그대로 둔다.
    if (
      window.location.pathname !== '/login' &&
      window.location.pathname !== '/register'
    ) {
      enqueueSnackbar(t('auth.expired'), { variant: 'warning' });
      navigate('/login', { replace: true });
    }
  };

  return (
    <AuthProvider onUnauthenticated={handleUnauthenticated}>
      <Shell />
    </AuthProvider>
  );
}

function Shell() {
  const { t } = useTranslation();
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const handleLogout = async () => {
    await logout();
    enqueueSnackbar(t('auth.logout.success'), { variant: 'info' });
    navigate('/login', { replace: true });
  };

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
      <AppBar
        position="sticky"
        elevation={0}
        color="default"
        sx={{
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <Typography
            variant="h3"
            component={RouterLink}
            to="/"
            sx={{
              color: 'primary.main',
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            {t('app.title')}
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            sx={{ ml: 2, flexGrow: 1 }}
            component="nav"
          >
            <Button
              component={RouterLink}
              to="/"
              size="small"
              color="inherit"
            >
              {t('nav.home')}
            </Button>
            {!isAuthenticated && (
              <>
                <Button
                  component={RouterLink}
                  to="/login"
                  size="small"
                  color="inherit"
                >
                  {t('nav.login')}
                </Button>
                <Button
                  component={RouterLink}
                  to="/register"
                  size="small"
                  color="inherit"
                >
                  {t('nav.register')}
                </Button>
              </>
            )}
            {isAuthenticated &&
              (user?.role === 'hr_manager' ||
                user?.role === 'super_admin') && (
                <Button
                  component={RouterLink}
                  to="/admin/users"
                  size="small"
                  color="inherit"
                  data-testid="header-admin-link"
                >
                  {t('admin.menu.section')}
                </Button>
              )}
            <Button
              component={RouterLink}
              to="/healthz"
              size="small"
              color="inherit"
            >
              {t('nav.healthz')}
            </Button>
          </Stack>
          {isAuthenticated && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography
                variant="body2"
                color="text.secondary"
                data-testid="header-user"
              >
                {user?.name ?? ''}
              </Typography>
              <Button
                size="small"
                color="inherit"
                onClick={() => {
                  void handleLogout();
                }}
                data-testid="header-logout"
              >
                {t('auth.logout')}
              </Button>
            </Stack>
          )}
          <ThemeToggle />
        </Toolbar>
      </AppBar>
      <Container component="main" sx={{ py: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
