import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { AttendanceCard } from '../features/attendance';
import { useAuth } from '../features/auth';

/**
 * Sprint 4 — 대시보드.
 *
 * Layout (DESIGN.md §반응형):
 *  - 데스크탑: 출퇴근 카드 위, 보조 정보 카드 아래 (현재는 자리만)
 *  - 모바일: 출퇴근 카드 sticky top, 보조 정보는 그 아래
 *
 * 골든 패스: 매일 1초만에 출근/퇴근 — 출퇴근 카드가 anchor.
 */
export function HomeRoute() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <Stack spacing={3} data-testid="home-root">
      {user && (
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="baseline"
          flexWrap="wrap"
        >
          <Typography variant="h1" data-testid="home-welcome">
            {t('route.home.greeting', { name: user.name })}
          </Typography>
          <Chip
            size="small"
            color="primary"
            variant="outlined"
            label={user.role}
            data-testid="home-role"
          />
        </Stack>
      )}
      <Typography variant="body1" color="text.secondary">
        {t('route.home.subtitle')}
      </Typography>

      {/* 모바일 sticky top, 데스크탑 자연 위치 */}
      <Box
        sx={{
          position: { xs: 'sticky', md: 'static' },
          top: { xs: 0, md: 'auto' },
          zIndex: { xs: 10, md: 'auto' },
          bgcolor: 'background.default',
          py: { xs: 1, md: 0 },
        }}
      >
        <AttendanceCard />
      </Box>

      {/* Sprint 5+ 에서 통계 / 휴가 잔여 / 알림 등 추가 카드가 들어갈 자리 */}
      <Card
        variant="outlined"
        sx={{
          borderRadius: '12px',
          p: 3,
          bgcolor: 'background.paper',
          borderColor: 'divider',
        }}
        data-testid="dashboard-placeholder"
      >
        <Typography variant="body2" color="text.secondary">
          {t('route.home.body')}
        </Typography>
      </Card>
    </Stack>
  );
}
