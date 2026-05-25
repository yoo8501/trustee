import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useTodayAttendance } from '../hooks';
import { AttendanceStatusBadge } from './AttendanceStatusBadge';
import { CheckInButton } from './CheckInButton';
import { CheckOutButton } from './CheckOutButton';
import { DashboardClock } from './DashboardClock';

/**
 * 대시보드 출퇴근 카드 — DESIGN.md §Card prominent (radius-2xl, 강조 padding).
 *
 * 상태 매트릭스:
 *  - loading: today fetch 진행 중 → spinner
 *  - 출근 전 (record null): 출근 활성, 퇴근 비활성 + "출근 체크 먼저" hint
 *  - 출근 중 (checkInAt 있고 checkOutAt 없음): 출근 완료 라벨 + 퇴근 활성 + working 배지
 *  - 퇴근 완료: 둘 다 비활성 + 퇴근 시각 라벨 + status 배지
 *  - auto_closed: 어제 퇴근 누락 경고 Alert (Sprint 8 알림 inbox 전 placeholder)
 *
 * UX §1: 옵티미스틱 — 상태 분기는 모두 cache (today) 기준.
 */
export function AttendanceCard() {
  const { t } = useTranslation();
  const { data: today, isLoading } = useTodayAttendance();

  const hasCheckedIn = today?.checkInAt != null;
  const hasCheckedOut = today?.checkOutAt != null;
  const isWorking = hasCheckedIn && !hasCheckedOut;

  return (
    <Card
      variant="outlined"
      data-testid="attendance-card"
      sx={{
        borderRadius: '16px', // radius-2xl
        p: { xs: 3, md: 4 },
        bgcolor: 'background.paper',
        borderColor: 'divider',
      }}
    >
      <Stack spacing={3}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent="space-between"
          spacing={2}
        >
          <DashboardClock />
          {today && (
            <AttendanceStatusBadge
              status={today.status}
              isWorking={isWorking}
            />
          )}
        </Stack>

        {isLoading ? (
          <Box
            sx={{ display: 'flex', justifyContent: 'center', py: 2 }}
            data-testid="attendance-card-loading"
          >
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            data-testid="attendance-actions"
          >
            <CheckInButton
              hasCheckedIn={hasCheckedIn}
              checkInAt={today?.checkInAt ?? null}
            />
            <CheckOutButton
              hasCheckedIn={hasCheckedIn}
              hasCheckedOut={hasCheckedOut}
              checkOutAt={today?.checkOutAt ?? null}
            />
          </Stack>
        )}

        {!isLoading && !hasCheckedIn && (
          <Typography
            variant="caption"
            color="text.secondary"
            data-testid="checkout-requirement-hint"
          >
            {t('attendance.checkout.requirementHint')}
          </Typography>
        )}

        {today?.status === 'auto_closed' && (
          <Alert
            severity="warning"
            data-testid="auto-closed-alert"
            sx={{ borderRadius: '12px' }}
          >
            {t('attendance.autoClosed.alert')}
          </Alert>
        )}
      </Stack>
    </Card>
  );
}
