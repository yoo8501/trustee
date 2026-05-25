import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http as httpMsw, HttpResponse } from 'msw';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import i18n from '../lib/i18n';
import { AppThemeProvider } from '../lib/theme';
import { server } from '../test/msw-server';
import { HealthzRoute } from './healthz';

function renderHealthz() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AppThemeProvider initialMode="light">
          <MemoryRouter initialEntries={['/healthz']}>
            <Routes>
              <Route path="/healthz" element={<HealthzRoute />} />
            </Routes>
          </MemoryRouter>
        </AppThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('HealthzRoute', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ko');
  });
  afterEach(() => server.resetHandlers());

  it('GET /api/health 성공 시 "정상" 표시', async () => {
    server.use(
      httpMsw.get('/api/health', () =>
        HttpResponse.json({
          success: true,
          data: { status: 'ok' },
          message: 'ok',
          details: null,
          total: null,
        }),
      ),
    );

    renderHealthz();

    expect(await screen.findByTestId('healthz-ok')).toBeInTheDocument();
    expect(screen.getByText('정상')).toBeInTheDocument();
    expect(screen.getByText(/status: ok/)).toBeInTheDocument();
  });

  it('GET /api/health 실패 시 에러 배너 + 재시도 버튼', async () => {
    server.use(
      httpMsw.get('/api/health', () =>
        HttpResponse.json(
          {
            success: false,
            data: null,
            message: 'down',
            details: { errorCode: 'INTERNAL_ERROR' },
            total: null,
          },
          { status: 500 },
        ),
      ),
    );

    renderHealthz();

    await waitFor(() =>
      expect(screen.getByTestId('healthz-error')).toBeInTheDocument(),
    );
    expect(screen.getByText('서버 응답이 없어요')).toBeInTheDocument();
    expect(screen.getByText('서버 오류가 발생했어요')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '다시 시도' }),
    ).toBeInTheDocument();
  });
});
