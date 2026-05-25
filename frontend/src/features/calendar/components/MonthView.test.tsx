import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, beforeEach } from 'vitest';
import i18n from '../../../lib/i18n';
import { AppThemeProvider } from '../../../lib/theme';
import type {
  CalendarAttendance,
  CalendarHoliday,
  CalendarLeave,
} from '../schemas';
import { MonthView } from './MonthView';

function renderMonth(
  ym: string,
  args: {
    leaves?: CalendarLeave[];
    holidays?: CalendarHoliday[];
    attendances?: CalendarAttendance[];
    today?: Date;
  } = {},
) {
  return render(
    <I18nextProvider i18n={i18n}>
      <AppThemeProvider initialMode="light">
        <MonthView
          ym={ym}
          leaves={args.leaves ?? []}
          holidays={args.holidays ?? []}
          attendances={args.attendances ?? []}
          today={args.today ?? new Date(2026, 4, 25)}
        />
      </AppThemeProvider>
    </I18nextProvider>,
  );
}

describe('MonthView', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ko');
  });

  it('42 셀 + 5/1 ~ 5/31 모두 inMonth', () => {
    renderMonth('2026-05');
    expect(screen.getByTestId('calendar-cell-2026-05-01')).toHaveAttribute(
      'data-in-month',
      'true',
    );
    expect(screen.getByTestId('calendar-cell-2026-05-31')).toHaveAttribute(
      'data-in-month',
      'true',
    );
    expect(screen.getByTestId('calendar-cell-2026-04-30')).toHaveAttribute(
      'data-in-month',
      'false',
    );
  });

  it('오늘 셀 강조 (data-today=true)', () => {
    renderMonth('2026-05');
    expect(screen.getByTestId('calendar-cell-2026-05-25')).toHaveAttribute(
      'data-today',
      'true',
    );
  });

  it('휴가 — 색상 + 텍스트 라벨 둘 다 (색맹 대응)', () => {
    renderMonth('2026-05', {
      leaves: [
        {
          id: 1,
          requesterId: 10,
          requesterName: '홍길동',
          leaveTypeCode: 'annual',
          leaveTypeName: '연차',
          startAt: '2026-05-25T00:00:00+09:00',
          endAt: '2026-05-25T23:59:59+09:00',
          status: 'approved',
          reason: null,
        },
      ],
    });
    const event = screen.getByTestId('calendar-event-1');
    expect(event).toBeInTheDocument();
    expect(event).toHaveTextContent('연차');
    expect(event).toHaveTextContent('홍길동');
  });

  it('공휴일 — 이름 표시 + holiday data-attr', () => {
    renderMonth('2026-05', {
      holidays: [{ date: '2026-05-25', name: '부처님오신날 대체공휴일' }],
    });
    expect(
      screen.getByTestId('calendar-holiday-2026-05-25'),
    ).toHaveTextContent('부처님오신날 대체공휴일');
    expect(screen.getByTestId('calendar-cell-2026-05-25')).toHaveAttribute(
      'data-holiday',
      'true',
    );
  });

  it('출퇴근 — 내 attendance dot 노출', () => {
    renderMonth('2026-05', {
      attendances: [
        {
          workDate: '2026-05-25',
          checkInAt: '2026-05-25T09:00:00+09:00',
          checkOutAt: null,
          status: 'working',
        },
      ],
    });
    expect(
      screen.getByTestId('calendar-attendance-2026-05-25'),
    ).toBeInTheDocument();
  });

  it('범위 휴가 — 5/24~5/26 모든 날 노출 (multi-day)', () => {
    renderMonth('2026-05', {
      leaves: [
        {
          id: 7,
          requesterId: 10,
          requesterName: '김민지',
          leaveTypeCode: 'special',
          leaveTypeName: '경조사',
          startAt: '2026-05-24T00:00:00+09:00',
          endAt: '2026-05-26T23:59:59+09:00',
          status: 'approved',
          reason: null,
        },
      ],
    });
    const evs = screen.getAllByTestId('calendar-event-7');
    expect(evs.length).toBeGreaterThanOrEqual(3);
  });
});
