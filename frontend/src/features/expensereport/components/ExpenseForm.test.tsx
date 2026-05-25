import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as httpMsw, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiResult } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import i18n from '../../../lib/i18n';
import { server } from '../../../test/msw-server';
import { expenseDraftStorage } from '../lib/draftStorage';
import { ExpenseForm } from './ExpenseForm';

function envelope<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}

function renderForm() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    qc,
    ...render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={qc}>
          <SnackbarProvider maxSnack={3}>
            <MemoryRouter initialEntries={['/expense/new']}>
              <Routes>
                <Route path="/expense/new" element={<ExpenseForm />} />
                <Route
                  path="/expense/my"
                  element={<div data-testid="expense-my-stub">my</div>}
                />
              </Routes>
            </MemoryRouter>
          </SnackbarProvider>
        </QueryClientProvider>
      </I18nextProvider>,
    ),
  };
}

function setupCreate(handler?: (body: unknown) => Response) {
  server.use(
    httpMsw.post(
      'http://localhost:3000/api/hr/expense-reports',
      async ({ request }) => {
        const body = await request.json();
        if (handler) return handler(body);
        const b = body as {
          amountWon: number;
          vendor: string;
          purpose: string;
          paidAt: string;
        };
        return HttpResponse.json(
          envelope({
            id: 999,
            requesterId: 10,
            requesterName: '홍길동',
            amountWon: b.amountWon,
            vendor: b.vendor,
            purpose: b.purpose,
            paidAt: b.paidAt,
            attachmentUrl: null,
            attachmentMime: null,
            status: 'pending',
            approverId: 5,
            approverName: '김민지',
            decidedAt: null,
            decisionComment: null,
            createdAt: '2026-05-25T10:00:00+09:00',
          }),
        );
      },
    ),
  );
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByTestId('expense-form-amount').querySelector('input')!,
    '12000',
  );
  await user.type(
    screen.getByTestId('expense-form-vendor').querySelector('input')!,
    '식당',
  );
  await user.type(
    screen.getByTestId('expense-form-purpose').querySelector('textarea')!,
    '점심 식대',
  );
}

describe('ExpenseForm', () => {
  beforeEach(async () => {
    tokenStorage.set('access-1', 'refresh-1');
    window.localStorage.removeItem('docflow.expense-report.draft');
    await i18n.changeLanguage('ko');
  });
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
    window.localStorage.removeItem('docflow.expense-report.draft');
  });

  it('금액 입력 시 자동 콤마 포맷 적용', async () => {
    setupCreate();
    const user = userEvent.setup();
    renderForm();

    const amount = screen
      .getByTestId('expense-form-amount')
      .querySelector('input') as HTMLInputElement;
    await user.type(amount, '12345');
    expect(amount.value).toBe('12,345');
  });

  it('필수 입력 미충족 → submit 비활성 + inline 사유', async () => {
    setupCreate();
    renderForm();

    const submit = screen.getByTestId('expense-form-submit');
    expect(submit).toBeDisabled();
    expect(
      screen.getByTestId('expense-form-blocked-reason'),
    ).toBeInTheDocument();
  });

  it('purpose placeholder 노출', async () => {
    setupCreate();
    renderForm();
    const purpose = screen
      .getByTestId('expense-form-purpose')
      .querySelector('textarea') as HTMLTextAreaElement;
    expect(purpose.placeholder).toMatch(/거래처 미팅 식대/);
  });

  it('필수 모두 입력 → submit 활성', async () => {
    setupCreate();
    const user = userEvent.setup();
    renderForm();
    await fillRequired(user);
    await waitFor(() =>
      expect(screen.getByTestId('expense-form-submit')).toBeEnabled(),
    );
  });

  it('Cmd+Enter 로 폼 제출 + 성공 후 draft 클리어 + /expense/my 이동', async () => {
    setupCreate();
    const user = userEvent.setup();
    renderForm();
    await fillRequired(user);
    await waitFor(() =>
      expect(screen.getByTestId('expense-form-submit')).toBeEnabled(),
    );

    const purpose = screen
      .getByTestId('expense-form-purpose')
      .querySelector('textarea') as HTMLTextAreaElement;
    purpose.focus();
    await user.keyboard('{Meta>}{Enter}{/Meta}');

    await waitFor(() =>
      expect(screen.getByTestId('expense-my-stub')).toBeInTheDocument(),
    );
    expect(expenseDraftStorage.load()).toBeNull();
  });

  it('draft 24h 복구 — load 된 값으로 폼 채워짐', async () => {
    expenseDraftStorage.save({
      amountWon: 33000,
      vendor: '카페',
      purpose: '회의 음료',
      paidAt: '2026-05-20',
    });
    setupCreate();
    renderForm();

    await waitFor(() => {
      const amount = screen
        .getByTestId('expense-form-amount')
        .querySelector('input') as HTMLInputElement;
      expect(amount.value).toBe('33,000');
    });
  });
});
