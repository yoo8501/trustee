import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as httpMsw, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiResult } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import i18n from '../../../lib/i18n';
import { server } from '../../../test/msw-server';
import { ApprovalQueueTable } from './ApprovalQueueTable';

function envelope<T>(data: T, total: number | null = null): ApiResult<T> {
  return { success: true, data, message: 'ok', details: null, total };
}

const PENDING = [
  {
    id: 11,
    requesterId: 20,
    requesterName: '박사원',
    leaveTypeId: 1,
    leaveTypeName: '연차',
    startAt: '2026-05-27T09:00:00+09:00',
    endAt: '2026-05-27T18:00:00+09:00',
    hours: 8,
    reason: '가족 행사',
    status: 'pending',
    approverId: 5,
    approverName: '김민지',
    decidedAt: null,
    decisionComment: null,
    createdAt: '2026-05-25T10:00:00+09:00',
  },
];

function renderTable() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <SnackbarProvider maxSnack={3}>
          <ApprovalQueueTable />
        </SnackbarProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('ApprovalQueueTable', () => {
  beforeEach(async () => {
    tokenStorage.set('access-1', 'refresh-1');
    await i18n.changeLanguage('ko');
  });
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
  });

  it('빈 목록 → empty 메시지', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-requests/pending/list',
        () => HttpResponse.json(envelope<unknown[]>([], 0)),
      ),
    );
    renderTable();
    await waitFor(() =>
      expect(screen.getByTestId('approvals-empty')).toBeInTheDocument(),
    );
  });

  it('승인 버튼 클릭 → approve API 호출', async () => {
    let approveCalls = 0;
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-requests/pending/list',
        () =>
          HttpResponse.json(envelope<unknown[]>(PENDING, PENDING.length)),
      ),
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-requests/11/approve',
        () => {
          approveCalls += 1;
          return HttpResponse.json(
            envelope({ ...PENDING[0], status: 'approved' }),
          );
        },
      ),
    );
    const user = userEvent.setup();
    renderTable();

    await waitFor(() =>
      expect(screen.getByTestId('approvals-row-11')).toBeInTheDocument(),
    );

    await user.click(screen.getByTestId('approvals-approve-11'));

    await waitFor(() => expect(approveCalls).toBe(1));
  });

  it('반려 클릭 → dialog → 빈 사유 → 에러, 사유 입력 → reject API 호출', async () => {
    let rejectCalls = 0;
    let lastReason = '';
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-requests/pending/list',
        () =>
          HttpResponse.json(envelope<unknown[]>(PENDING, PENDING.length)),
      ),
      httpMsw.post(
        'http://localhost:3000/api/hr/leave-requests/11/reject',
        async ({ request }) => {
          rejectCalls += 1;
          const body = (await request.json()) as { reason: string };
          lastReason = body.reason;
          return HttpResponse.json(
            envelope({ ...PENDING[0], status: 'rejected' }),
          );
        },
      ),
    );
    const user = userEvent.setup();
    renderTable();

    await waitFor(() =>
      expect(screen.getByTestId('approvals-row-11')).toBeInTheDocument(),
    );

    await user.click(screen.getByTestId('approvals-reject-11'));
    await waitFor(() =>
      expect(screen.getByTestId('approvals-reject-reason')).toBeInTheDocument(),
    );

    // 빈 사유로 제출 → 에러
    await user.click(screen.getByTestId('approvals-reject-submit'));
    expect(rejectCalls).toBe(0);
    await waitFor(() =>
      expect(
        screen.getByText('반려 사유를 입력해 주세요'),
      ).toBeInTheDocument(),
    );

    // 사유 입력 후 제출
    const reasonInput = screen
      .getByTestId('approvals-reject-reason')
      .querySelector('textarea') as HTMLTextAreaElement;
    await user.type(reasonInput, '인력 부족');
    await user.click(screen.getByTestId('approvals-reject-submit'));

    await waitFor(() => expect(rejectCalls).toBe(1));
    expect(lastReason).toBe('인력 부족');
  });
});
