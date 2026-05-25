import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as httpMsw, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiResult } from '../../../lib/api';
import i18n from '../../../lib/i18n';
import { server } from '../../../test/msw-server';
import { LeaveBalanceAdjustDialog } from './LeaveBalanceAdjustDialog';

function ok<T>(d: T, total?: number): ApiResult<T> {
  return {
    success: true,
    data: d,
    message: 'ok',
    details: null,
    total: total ?? null,
  };
}

const sampleUser = {
  id: 1,
  email: 'a@b.com',
  name: '홍길동',
  status: 'active',
  role: 'general',
  teamId: null,
  managerId: null,
  hireDate: '2026-01-01',
};
const sampleLT = {
  id: 1,
  code: 'annual',
  name: '연차',
  defaultHours: 8,
  accrualPolicy: { type: 'fixed' },
  isPaid: true,
  isActive: true,
};

function renderDialog(props: { open: boolean; onClose: () => void }) {
  // shared list endpoints
  server.use(
    httpMsw.post('http://localhost:3000/api/users/list', () =>
      HttpResponse.json(ok([sampleUser], 1)),
    ),
    httpMsw.post('http://localhost:3000/api/hr/leave-types/list', () =>
      HttpResponse.json(ok([sampleLT], 1)),
    ),
  );
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <SnackbarProvider>
          <LeaveBalanceAdjustDialog {...props} />
        </SnackbarProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('LeaveBalanceAdjustDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ko');
  });
  afterEach(() => server.resetHandlers());

  it('초기 상태 — 제출 버튼 disabled (reason 빈칸)', async () => {
    renderDialog({ open: true, onClose: vi.fn() });
    await waitFor(() => {
      expect(screen.getByTestId('adjust-submit')).toBeDisabled();
    });
  });

  it('reason / user / type / delta 모두 채우면 enabled', async () => {
    const onClose = vi.fn();
    renderDialog({ open: true, onClose });
    const user = userEvent.setup();

    // wait for autocomplete to load users
    await waitFor(() => {
      expect(screen.getByTestId('adjust-user')).toBeInTheDocument();
    });

    // user select via autocomplete
    const userInput = screen.getByTestId('adjust-user');
    await user.click(userInput);
    await user.type(userInput, '홍');
    const option = await screen.findByText(/홍길동/);
    await user.click(option);

    // leave type — MUI Select 의 hidden input 은 클릭 불가. combobox role 사용.
    const ltCombobox = screen.getByRole('combobox', {
      name: /휴가 종류/,
    });
    await user.click(ltCombobox);
    const ltOption = await screen.findByRole('option', {
      name: /연차 \(annual\)/,
    });
    await user.click(ltOption);

    // delta
    const delta = screen.getByTestId('adjust-delta');
    await user.clear(delta);
    await user.type(delta, '8');

    // reason
    const reason = screen.getByTestId('adjust-reason');
    await user.type(reason, '특별 휴가');

    await waitFor(() =>
      expect(screen.getByTestId('adjust-submit')).toBeEnabled(),
    );
  });

  it('제출 → BE 호출 → onClose', async () => {
    const onClose = vi.fn();
    let received: { reason: string } | null = null;
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-balances/1/adjust',
        async ({ request }) => {
          received = (await request.json()) as { reason: string };
          return HttpResponse.json(
            ok({
              adjustmentId: 1,
              deltaHours: 8,
              balance: {
                id: 1,
                userId: 1,
                leaveTypeId: 1,
                periodYear: 2026,
                grantedHours: 8,
                usedHours: 0,
                remainingHours: 8,
              },
            }),
          );
        },
      ),
    );

    renderDialog({ open: true, onClose });
    const user = userEvent.setup();

    await waitFor(() => screen.getByTestId('adjust-user'));
    const userInput = screen.getByTestId('adjust-user');
    await user.click(userInput);
    await user.type(userInput, '홍');
    await user.click(await screen.findByText(/홍길동/));

    const ltCombobox = screen.getByRole('combobox', {
      name: /휴가 종류/,
    });
    await user.click(ltCombobox);
    await user.click(
      await screen.findByRole('option', { name: /연차 \(annual\)/ }),
    );

    const delta = screen.getByTestId('adjust-delta');
    await user.clear(delta);
    await user.type(delta, '8');
    await user.type(screen.getByTestId('adjust-reason'), '특별 휴가');

    await waitFor(() =>
      expect(screen.getByTestId('adjust-submit')).toBeEnabled(),
    );
    await user.click(screen.getByTestId('adjust-submit'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(received).not.toBeNull();
    expect(received!.reason).toBe('특별 휴가');
  });
});
