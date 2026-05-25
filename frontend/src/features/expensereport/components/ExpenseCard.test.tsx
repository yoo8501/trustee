import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tokenStorage } from '../../../lib/auth';
import i18n from '../../../lib/i18n';
import { server } from '../../../test/msw-server';
import type { ExpenseReport } from '../schemas';
import { ExpenseCard } from './ExpenseCard';

const pending: ExpenseReport = {
  id: 7,
  requesterId: 10,
  requesterName: '홍길동',
  amountWon: 12000,
  vendor: '식당',
  purpose: '점심 식대',
  paidAt: '2026-05-25',
  attachmentUrl: '/uploads/receipt.png',
  attachmentMime: 'image/png',
  status: 'pending',
  approverId: 5,
  approverName: '김민지',
  decidedAt: null,
  decisionComment: null,
  createdAt: '2026-05-25T10:00:00+09:00',
};

function renderCard(req: ExpenseReport) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    qc,
    ...render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={qc}>
          <SnackbarProvider maxSnack={3}>
            <ExpenseCard expense={req} />
          </SnackbarProvider>
        </QueryClientProvider>
      </I18nextProvider>,
    ),
  };
}

describe('ExpenseCard', () => {
  beforeEach(async () => {
    tokenStorage.set('access-1', 'refresh-1');
    await i18n.changeLanguage('ko');
  });
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
  });

  it('pending → 금액(원)/거래처/사유/상태칩/취소버튼/이미지썸네일 표시', () => {
    renderCard(pending);
    expect(screen.getByText('12,000원')).toBeInTheDocument();
    expect(screen.getByText('식당 · 2026-05-25')).toBeInTheDocument();
    expect(
      screen.getByTestId('leave-status-chip-pending'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('expense-card-cancel-7')).toBeInTheDocument();
    expect(
      screen.getByTestId('expense-card-attachment-7'),
    ).toBeInTheDocument();
  });

  it('PDF 첨부 → PDF 라벨 표시', () => {
    renderCard({
      ...pending,
      attachmentUrl: '/uploads/r.pdf',
      attachmentMime: 'application/pdf',
    });
    expect(screen.getByText('PDF')).toBeInTheDocument();
  });

  it('approved → 취소 버튼 없음', () => {
    renderCard({ ...pending, status: 'approved' });
    expect(screen.queryByTestId('expense-card-cancel-7')).toBeNull();
  });

  it('첨부 없음 → 썸네일 박스 없음', () => {
    renderCard({
      ...pending,
      attachmentUrl: null,
      attachmentMime: null,
    });
    expect(screen.queryByTestId('expense-card-attachment-7')).toBeNull();
  });

  it('rejected 상태 칩', () => {
    renderCard({ ...pending, status: 'rejected' });
    expect(
      screen.getByTestId('leave-status-chip-rejected'),
    ).toBeInTheDocument();
  });

  it('cancelled 상태 칩', () => {
    renderCard({ ...pending, status: 'cancelled' });
    expect(
      screen.getByTestId('leave-status-chip-cancelled'),
    ).toBeInTheDocument();
  });
});
