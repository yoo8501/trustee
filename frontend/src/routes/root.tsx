import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, Outlet } from 'react-router';
import { ThemeToggle } from '../components';

export function RootLayout() {
  const { t } = useTranslation();

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
              to="/healthz"
              size="small"
              color="inherit"
            >
              {t('nav.healthz')}
            </Button>
          </Stack>
          <ThemeToggle />
        </Toolbar>
      </AppBar>
      <Container component="main" sx={{ py: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
