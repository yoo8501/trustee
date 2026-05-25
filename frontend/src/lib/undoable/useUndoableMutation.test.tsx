import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { useUndoableMutation } from './useUndoableMutation';

function Harness({
  mutationFn,
  delayMs,
  onSuccess,
  onError,
}: {
  mutationFn: () => Promise<unknown>;
  delayMs: number;
  onSuccess?: (data: unknown) => void;
  onError?: (err: unknown) => void;
}) {
  const { trigger } = useUndoableMutation({
    mutationFn,
    undoMessage: '취소 — 5초 안 되돌리기',
    successMessage: '취소 완료',
    delayMs,
    onSuccess,
    onError,
  });
  return (
    <button type="button" data-testid="trigger" onClick={trigger}>
      trigger
    </button>
  );
}

function renderHarness(props: Parameters<typeof Harness>[0]) {
  return render(
    <I18nextProvider i18n={i18n}>
      <SnackbarProvider maxSnack={3}>
        <Harness {...props} />
      </SnackbarProvider>
    </I18nextProvider>,
  );
}

describe('useUndoableMutation', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await i18n.changeLanguage('ko');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('trigger 후 delayMs 안에 Undo 클릭 → mutation 호출 안 됨', async () => {
    const fn = vi.fn(() => Promise.resolve('ok'));
    const onSuccess = vi.fn();
    renderHarness({ mutationFn: fn, delayMs: 5000, onSuccess });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByTestId('trigger'));

    // snackbar 노출
    await waitFor(() =>
      expect(screen.getByText('취소 — 5초 안 되돌리기')).toBeInTheDocument(),
    );

    // Undo 클릭
    const undo = screen.getByTestId('undoable-undo-button');
    await user.click(undo);

    // 5초 이상 흘러도 mutation 호출 안 됨
    vi.advanceTimersByTime(6000);
    await Promise.resolve();
    expect(fn).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('trigger 후 delayMs 경과 → mutation 호출 + success toast', async () => {
    const fn = vi.fn(() => Promise.resolve('ok'));
    const onSuccess = vi.fn();
    renderHarness({ mutationFn: fn, delayMs: 1000, onSuccess });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByTestId('trigger'));

    // 1초 안엔 호출 안 됨
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();

    // 1초 이후 호출
    vi.advanceTimersByTime(700);
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it('mutation 실패 → onError 호출 + error toast', async () => {
    const err = new Error('fail');
    const fn = vi.fn(() => Promise.reject(err));
    const onError = vi.fn();
    renderHarness({ mutationFn: fn, delayMs: 500, onError });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByTestId('trigger'));

    vi.advanceTimersByTime(700);
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(err));
  });
});
