import Button from '@mui/material/Button';
import { useTranslation } from 'react-i18next';
import { useCheckIn } from '../hooks';
import { formatTimeKST } from '../utils';

interface CheckInButtonProps {
  hasCheckedIn: boolean;
  checkInAt: string | null;
}

/**
 * 출근 버튼 — 오늘 한 번만 활성. 이미 출근했으면 outlined + 시각 표시.
 *
 * UX §6 키보드: MUI Button 은 기본적으로 Enter/Space 동작.
 * UX §3 에러 예방: 같은 날 두 번째 클릭은 UI 에서 비활성 (서버 UNIQUE 백업).
 */
export function CheckInButton({ hasCheckedIn, checkInAt }: CheckInButtonProps) {
  const { t } = useTranslation();
  const checkIn = useCheckIn();

  const disabled = hasCheckedIn || checkIn.isPending;
  const label =
    hasCheckedIn && checkInAt
      ? t('attendance.checkin.done', { time: formatTimeKST(checkInAt) })
      : t('attendance.checkin.label');

  return (
    <Button
      variant={hasCheckedIn ? 'outlined' : 'contained'}
      size="large"
      color="primary"
      disabled={disabled}
      onClick={() => checkIn.mutate()}
      aria-label={t('attendance.checkin.aria')}
      data-testid="check-in-button"
      sx={{ minWidth: 140, height: 48 }}
    >
      {label}
    </Button>
  );
}
