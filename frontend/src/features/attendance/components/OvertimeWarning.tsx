import Alert from '@mui/material/Alert';
import { useTranslation } from 'react-i18next';

interface OvertimeWarningProps {
  weeklyMinutes: number;
}

/**
 * 주 52시간 경고 배너.
 *
 * - 48h ≤ x < 52h: warn(주황) — soft 경고
 * - 52h ≤ x      : danger(빨강) — 강한 경고
 *
 * 강제 차단 없음 — 알림만 띄우고 출근/퇴근은 그대로 가능.
 * (법적 책임은 회사/사용자 — UX §3 에러 예방 의도가 아니라 정보 제공).
 *
 * 색상은 MUI Alert severity 토큰만 사용 (DESIGN.md §색상 토큰).
 * data-severity attribute 는 테스트 식별용 (MUI 가 자동 부여).
 */
export function OvertimeWarning({ weeklyMinutes }: OvertimeWarningProps) {
  const { t } = useTranslation();
  const hours = weeklyMinutes / 60;

  if (hours < 48) return null;

  const severity = hours >= 52 ? 'error' : 'warning';
  const msgKey =
    severity === 'error'
      ? 'attendance.overtime.danger'
      : 'attendance.overtime.warn';

  return (
    <Alert
      severity={severity}
      data-testid="overtime-warning"
      data-severity={severity}
      sx={{ borderRadius: '12px' }}
    >
      {t(msgKey, { hours: hours.toFixed(1) })}
    </Alert>
  );
}
