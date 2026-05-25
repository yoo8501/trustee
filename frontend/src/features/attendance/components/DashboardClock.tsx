import Box from '@mui/material/Box';
import { useEffect, useState } from 'react';

/**
 * 대시보드 대형 시계 — 매일 사용 골든 패스의 시각적 anchor.
 *
 * DESIGN.md §Typography text-display 44px / 700 / tabular-nums.
 * 매초 업데이트하지만 `aria-live` 는 off — 스크린리더 spam 방지.
 *
 * KST 강제 표시 (CLAUDE.md §3.7 — DB UTC 저장, 표현은 KST).
 */
export function DashboardClock() {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const time = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);

  return (
    <Box
      role="status"
      aria-live="off"
      data-testid="dashboard-clock"
      sx={{
        fontSize: '44px',
        fontWeight: 700,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        color: 'text.primary',
        letterSpacing: '-0.01em',
      }}
    >
      {time}
    </Box>
  );
}
