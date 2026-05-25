import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../../lib/i18n';
import { LeaveStatusChip } from './LeaveStatusChip';

function renderChip(status: 'pending' | 'approved' | 'rejected' | 'cancelled') {
  return render(
    <I18nextProvider i18n={i18n}>
      <LeaveStatusChip status={status} />
    </I18nextProvider>,
  );
}

describe('LeaveStatusChip', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ko');
  });

  it('pending → 결재 대기 라벨 + warning 색상', () => {
    renderChip('pending');
    expect(screen.getByText('결재 대기')).toBeInTheDocument();
    const chip = screen.getByTestId('leave-status-chip-pending');
    expect(chip.className).toMatch(/colorWarning/);
  });

  it('approved → 승인 + success', () => {
    renderChip('approved');
    expect(screen.getByText('승인')).toBeInTheDocument();
    const chip = screen.getByTestId('leave-status-chip-approved');
    expect(chip.className).toMatch(/colorSuccess/);
  });

  it('rejected → 반려 + error', () => {
    renderChip('rejected');
    expect(screen.getByText('반려')).toBeInTheDocument();
    const chip = screen.getByTestId('leave-status-chip-rejected');
    expect(chip.className).toMatch(/colorError/);
  });

  it('cancelled → 취소 + default', () => {
    renderChip('cancelled');
    expect(screen.getByText('취소')).toBeInTheDocument();
    const chip = screen.getByTestId('leave-status-chip-cancelled');
    expect(chip.className).toMatch(/colorDefault/);
  });
});
