import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as httpMsw, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../lib/api';
import { tokenStorage } from '../../../lib/auth';
import i18n from '../../../lib/i18n';
import { server } from '../../../test/msw-server';
import { AttachmentUploader } from './AttachmentUploader';

function envelope<T>(d: T): ApiResult<T> {
  return { success: true, data: d, message: 'ok', details: null, total: null };
}

function renderUploader(
  initial: { url?: string; mime?: string } = {},
  onChange: (
    info: { url: string; mime: string; filename: string } | null,
  ) => void = vi.fn(),
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    qc,
    onChange,
    ...render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={qc}>
          <SnackbarProvider maxSnack={3}>
            <AttachmentUploader
              attachmentUrl={initial.url}
              attachmentMime={initial.mime}
              onChange={onChange}
            />
          </SnackbarProvider>
        </QueryClientProvider>
      </I18nextProvider>,
    ),
  };
}

describe('AttachmentUploader', () => {
  beforeEach(async () => {
    tokenStorage.set('access-1', 'refresh-1');
    await i18n.changeLanguage('ko');
  });
  afterEach(() => {
    server.resetHandlers();
    tokenStorage.clear();
  });

  it('drop-zone + 안내 텍스트 노출', () => {
    renderUploader();
    expect(screen.getByTestId('attachment-dropzone')).toBeInTheDocument();
    expect(screen.getByText(/파일을 끌어다/)).toBeInTheDocument();
  });

  it('파일 선택 → 업로드 성공 시 onChange(url, mime)', async () => {
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/expense-reports/attachment',
        () =>
          HttpResponse.json(
            envelope({
              attachmentUrl: '/uploads/r.pdf',
              attachmentMime: 'application/pdf',
              sizeBytes: 5000,
            }),
          ),
      ),
    );

    const onChange = vi.fn();
    renderUploader({}, onChange);

    const file = new File(['x'], 'r.pdf', { type: 'application/pdf' });
    const input = screen.getByTestId('attachment-input') as HTMLInputElement;
    const user = userEvent.setup();
    await user.upload(input, file);

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith({
      url: '/uploads/r.pdf',
      mime: 'application/pdf',
      filename: 'r.pdf',
    });
  });

  it('10MB 초과 파일 → 차단 + 업로드 호출 안 됨', async () => {
    let calls = 0;
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/expense-reports/attachment',
        () => {
          calls++;
          return HttpResponse.json(envelope({}));
        },
      ),
    );
    const onChange = vi.fn();
    renderUploader({}, onChange);

    // 10MB + 1 바이트
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf', {
      type: 'application/pdf',
    });
    const input = screen.getByTestId('attachment-input') as HTMLInputElement;
    const user = userEvent.setup();
    await user.upload(input, big);

    await waitFor(() =>
      expect(screen.getByText(/초과/)).toBeInTheDocument(),
    );
    expect(calls).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('허용되지 않은 mime → 차단', async () => {
    let calls = 0;
    server.use(
      httpMsw.post(
        'http://localhost:3000/api/hr/expense-reports/attachment',
        () => {
          calls++;
          return HttpResponse.json(envelope({}));
        },
      ),
    );
    const onChange = vi.fn();
    renderUploader({}, onChange);

    const text = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    const input = screen.getByTestId('attachment-input') as HTMLInputElement;
    const user = userEvent.setup();
    await user.upload(input, text);

    await waitFor(() =>
      expect(
        screen.getByText(/이미지 또는 PDF/),
      ).toBeInTheDocument(),
    );
    expect(calls).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('미리보기 — PDF 표시 + 다운로드 링크', () => {
    renderUploader({
      url: '/uploads/r.pdf',
      mime: 'application/pdf',
    });
    expect(
      screen.getByTestId('attachment-preview-file'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('attachment-preview-download'),
    ).toBeInTheDocument();
  });

  it('미리보기 — 이미지', () => {
    renderUploader({
      url: '/uploads/r.png',
      mime: 'image/png',
    });
    expect(
      screen.getByTestId('attachment-preview-image'),
    ).toBeInTheDocument();
  });

  it('삭제 클릭 → onChange(null)', async () => {
    const onChange = vi.fn();
    renderUploader(
      { url: '/uploads/r.pdf', mime: 'application/pdf' },
      onChange,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('attachment-remove'));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
