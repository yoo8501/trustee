import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import i18n from '../../../lib/i18n';
import { createAppTheme } from '../../../lib/theme';
import type { RecordStats } from '../stats-types';
import { WeeklyChart } from './WeeklyChart';

const records: RecordStats[] = [
  {
    date: '2026-05-25',
    checkInAt: '2026-05-25T00:01:00Z',
    checkOutAt: '2026-05-25T09:30:00Z',
    actualWorkMinutes: 510,
    expectedMinutes: 480,
    adjustedExpected: 480,
    overtimeMinutes: 30,
    status: 'normal',
    leaveHours: 0,
  },
  {
    date: '2026-05-26',
    checkInAt: '2026-05-26T00:05:00Z',
    checkOutAt: '2026-05-26T09:00:00Z',
    actualWorkMinutes: 480,
    expectedMinutes: 480,
    adjustedExpected: 240, // 반차 4시간
    overtimeMinutes: 240,
    status: 'normal',
    leaveHours: 4,
  },
];

function render_(data: RecordStats[]) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider theme={createAppTheme('light')}>
        <WeeklyChart records={data} />
      </ThemeProvider>
    </I18nextProvider>,
  );
}

describe('WeeklyChart', () => {
  it('records 0개 → 빈 메시지', () => {
    render_([]);
    expect(screen.getByTestId('chart-empty')).toBeInTheDocument();
  });

  it('records 가 있으면 SVG 가 렌더된다', () => {
    render_(records);
    const svg = screen.getByTestId('weekly-chart-svg');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg).toHaveAttribute('aria-label');
  });

  it('각 record 마다 actual + expected bar 가 그려진다', () => {
    render_(records);
    // 한 record 당 actual bar + expected bar 가 있어야 함
    const actuals = screen.getAllByTestId(/chart-bar-actual-/);
    const expecteds = screen.getAllByTestId(/chart-bar-expected-/);
    expect(actuals).toHaveLength(records.length);
    expect(expecteds).toHaveLength(records.length);
  });

  it('overtime > 0 인 record 는 overtime bar 가 추가로 렌더된다', () => {
    render_(records);
    const overtimes = screen.getAllByTestId(/chart-bar-overtime-/);
    // 두 record 모두 overtime > 0 → 2개
    expect(overtimes).toHaveLength(2);
  });
});
