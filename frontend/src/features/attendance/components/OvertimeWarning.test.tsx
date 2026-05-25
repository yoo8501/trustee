import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import i18n from '../../../lib/i18n';
import { createAppTheme } from '../../../lib/theme';
import { OvertimeWarning } from './OvertimeWarning';

function render_(weeklyMinutes: number) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider theme={createAppTheme('light')}>
        <OvertimeWarning weeklyMinutes={weeklyMinutes} />
      </ThemeProvider>
    </I18nextProvider>,
  );
}

describe('OvertimeWarning', () => {
  it('47.9h 미만 → 아무것도 렌더되지 않음', () => {
    const { container } = render_(47 * 60 + 50); // 47:50
    expect(container.querySelector('[data-testid="overtime-warning"]')).toBeNull();
  });

  it('48h 도달 → warn 배너 표시 (warn severity)', () => {
    render_(48 * 60); // exactly 48h
    const alert = screen.getByTestId('overtime-warning');
    expect(alert).toBeInTheDocument();
    expect(alert.getAttribute('data-severity')).toBe('warning');
  });

  it('52h 도달 → danger 배너 표시 (error severity)', () => {
    render_(52 * 60); // exactly 52h
    const alert = screen.getByTestId('overtime-warning');
    expect(alert).toBeInTheDocument();
    expect(alert.getAttribute('data-severity')).toBe('error');
  });

  it('55h → danger', () => {
    render_(55 * 60);
    const alert = screen.getByTestId('overtime-warning');
    expect(alert.getAttribute('data-severity')).toBe('error');
  });

  it('48~52 사이 (예: 50h) → warn', () => {
    render_(50 * 60);
    const alert = screen.getByTestId('overtime-warning');
    expect(alert.getAttribute('data-severity')).toBe('warning');
  });
});
