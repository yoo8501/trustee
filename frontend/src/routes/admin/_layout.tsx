import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, Outlet } from 'react-router';
import { AdminGuard } from '../../components/AdminGuard';

interface MenuItem {
  to: string;
  labelKey: string;
}

const ITEMS: MenuItem[] = [
  { to: '/admin/users', labelKey: 'admin.menu.users' },
  { to: '/admin/teams', labelKey: 'admin.menu.teams' },
  { to: '/admin/leave-types', labelKey: 'admin.menu.leaveTypes' },
  { to: '/admin/audit/attendance', labelKey: 'admin.menu.audit' },
];

/**
 * Admin Layout — AdminGuard + 좌측 (또는 상단) admin 메뉴.
 *
 * 좌측 네비를 데스크탑에서 표시. 모바일에서는 상단 가로 스크롤 메뉴로.
 */
export function AdminLayout() {
  const { t } = useTranslation();
  return (
    <AdminGuard>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '200px 1fr' },
          gap: 3,
        }}
        data-testid="admin-layout"
      >
        <Box
          component="nav"
          aria-label={t('admin.menu.section')}
          sx={{
            borderRight: { md: '1px solid' },
            borderColor: { md: 'divider' },
            pr: { md: 2 },
          }}
        >
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ pl: 1 }}
          >
            {t('admin.menu.section')}
          </Typography>
          <Stack
            direction={{ xs: 'row', md: 'column' }}
            spacing={0.5}
            sx={{
              mt: 1,
              overflowX: { xs: 'auto', md: 'visible' },
            }}
          >
            {ITEMS.map((it) => (
              <Box
                key={it.to}
                component={RouterLink}
                to={it.to}
                data-testid={`admin-nav-${it.to.split('/').pop()}`}
                sx={{
                  px: 1.5,
                  py: 1,
                  borderRadius: 1,
                  color: 'text.primary',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                {t(it.labelKey)}
              </Box>
            ))}
          </Stack>
        </Box>
        <Box>
          <Outlet />
        </Box>
      </Box>
    </AdminGuard>
  );
}
