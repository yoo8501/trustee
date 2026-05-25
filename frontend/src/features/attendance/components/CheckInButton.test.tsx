import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import i18n from '../../../lib/i18n';
import { CheckInButton } from './CheckInButton';

function wrap() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={qc}>
          <SnackbarProvider>{children}</SnackbarProvider>
        </QueryClientProvider>
      </I18nextProvider>
    );
  };
}

describe('CheckInButton', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ko');
  });

  it('출근 전 — 활성 + 라벨 "출근하기"', () => {
    const Wrapper = wrap();
    render(
      <Wrapper>
        <CheckInButton hasCheckedIn={false} checkInAt={null} />
      </Wrapper>,
    );
    const btn = screen.getByTestId('check-in-button');
    expect(btn).toBeEnabled();
    expect(btn).toHaveTextContent('출근하기');
  });

  it('이미 출근 — 비활성 + 시각 표시', () => {
    const Wrapper = wrap();
    render(
      <Wrapper>
        <CheckInButton
          hasCheckedIn={true}
          checkInAt="2026-05-25T00:01:00Z" // 09:01 KST
        />
      </Wrapper>,
    );
    const btn = screen.getByTestId('check-in-button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/09:01/);
  });

  it('aria-label 보유', () => {
    const Wrapper = wrap();
    render(
      <Wrapper>
        <CheckInButton hasCheckedIn={false} checkInAt={null} />
      </Wrapper>,
    );
    expect(screen.getByTestId('check-in-button')).toHaveAttribute(
      'aria-label',
      '출근 체크',
    );
  });
});
