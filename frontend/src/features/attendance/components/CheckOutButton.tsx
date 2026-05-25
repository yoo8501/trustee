import Button from '@mui/material/Button';
import { useTranslation } from 'react-i18next';
import { useCheckOut } from '../hooks';
import { formatTimeKST } from '../utils';

interface CheckOutButtonProps {
  hasCheckedIn: boolean;
  hasCheckedOut: boolean;
  checkOutAt: string | null;
}

/**
 * 퇴근 버튼.
 *
 * UX §3 에러 예방: 출근 안 했으면 비활성 (사유는 부모 카드의 inline hint).
 * UX §3: 이미 퇴근했으면 비활성 + 시각 표시.
 */
export function CheckOutButton({
  hasCheckedIn,
  hasCheckedOut,
  checkOutAt,
}: CheckOutButtonProps) {
  const { t } = useTranslation();
  const checkOut = useCheckOut();

  const disabled = !hasCheckedIn || hasCheckedOut || checkOut.isPending;
  const label =
    hasCheckedOut && checkOutAt
      ? t('attendance.checkout.done', { time: formatTimeKST(checkOutAt) })
      : t('attendance.checkout.label');

  return (
    <Button
      variant={hasCheckedOut ? 'outlined' : 'contained'}
      size="large"
      color="secondary"
      disabled={disabled}
      onClick={() => checkOut.mutate()}
      aria-label={t('attendance.checkout.aria')}
      data-testid="check-out-button"
      sx={{ minWidth: 140, height: 48 }}
    >
      {label}
    </Button>
  );
}
