import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import i18n from '../../../lib/i18n';
import { createAppTheme } from '../../../lib/theme';
import type { RecordStats } from '../stats-types';
import { RecordsTable } from './RecordsTable';

const sample: RecordStats[] = [
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
];

function render_(props: Parameters<typeof RecordsTable>[0]) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider theme={createAppTheme('light')}>
        <RecordsTable {...props} />
      </ThemeProvider>
    </I18nextProvider>,
  );
}

describe('RecordsTable — 5 상태 처리', () => {
  it('Loading → skeleton 표시', () => {
    render_({ records: [], isLoading: true, isError: false });
    expect(screen.getByTestId('records-table-loading')).toBeInTheDocument();
  });

  it('Error → 에러 메시지 + retry 버튼', () => {
    const onRetry = vi.fn();
    render_({
      records: [],
      isLoading: false,
      isError: true,
      onRetry,
    });
    expect(screen.getByTestId('records-table-error')).toBeInTheDocument();
  });

  it('Empty → 안내 메시지', () => {
    render_({ records: [], isLoading: false, isError: false });
    expect(screen.getByTestId('records-table-empty')).toBeInTheDocument();
  });

  it('Success → 데이터 행 렌더', () => {
    render_({ records: sample, isLoading: false, isError: false });
    expect(screen.getByTestId('records-table-row-2026-05-25')).toBeInTheDocument();
  });

  it('Partial → 일부 데이터 + partial 표시 (예: checkOutAt null)', () => {
    const partial: RecordStats[] = [
      {
        ...sample[0],
        checkOutAt: null, // 퇴근 미완 → partial 케이스
        actualWorkMinutes: 0,
        overtimeMinutes: 0,
      },
    ];
    render_({ records: partial, isLoading: false, isError: false });
    // 행은 있어야 함
    expect(screen.getByTestId('records-table-row-2026-05-25')).toBeInTheDocument();
    // 퇴근 시각 셀에 partial placeholder (em-dash)
    const cell = screen.getByTestId('records-table-row-2026-05-25-checkOut');
    expect(cell.textContent).toContain('—');
  });
});
