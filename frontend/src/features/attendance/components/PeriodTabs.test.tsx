import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import i18n from '../../../lib/i18n';
import { PeriodTabs } from './PeriodTabs';

function render_(value: 'day' | 'week' | 'month', onChange = vi.fn()) {
  return render(
    <I18nextProvider i18n={i18n}>
      <PeriodTabs value={value} onChange={onChange} />
    </I18nextProvider>,
  );
}

describe('PeriodTabs', () => {
  it('세 탭이 모두 렌더된다', () => {
    render_('week');
    expect(screen.getByTestId('period-tab-day')).toBeInTheDocument();
    expect(screen.getByTestId('period-tab-week')).toBeInTheDocument();
    expect(screen.getByTestId('period-tab-month')).toBeInTheDocument();
  });

  it('value=week 일 때 week 탭이 선택된다', () => {
    render_('week');
    const tab = screen.getByTestId('period-tab-week');
    expect(tab).toHaveAttribute('aria-selected', 'true');
  });

  it('다른 탭 클릭 시 onChange(value) 호출', async () => {
    const onChange = vi.fn();
    render_('week', onChange);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('period-tab-month'));
    expect(onChange).toHaveBeenCalledWith('month');
  });
});
