import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../lib/i18n';
import { AppThemeProvider, THEME_STORAGE_KEY } from '../lib/theme';
import { ThemeToggle } from './ThemeToggle';

function renderToggle(initialMode: 'light' | 'dark' = 'light') {
  return render(
    <I18nextProvider i18n={i18n}>
      <AppThemeProvider initialMode={initialMode}>
        <ThemeToggle />
      </AppThemeProvider>
    </I18nextProvider>,
  );
}

describe('ThemeToggle', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    await i18n.changeLanguage('ko');
  });

  it('초기 라이트 모드에서 다크 전환 라벨을 노출한다', () => {
    renderToggle('light');
    expect(
      screen.getByRole('button', { name: '다크 모드로 전환' }),
    ).toBeInTheDocument();
  });

  it('클릭 시 mode를 토글하고 html data-theme + localStorage를 갱신한다', async () => {
    const user = userEvent.setup();
    renderToggle('light');

    expect(document.documentElement.dataset.theme).toBe('light');

    await user.click(
      screen.getByRole('button', { name: '다크 모드로 전환' }),
    );

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(
      screen.getByRole('button', { name: '라이트 모드로 전환' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: '라이트 모드로 전환' }),
    );

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });
});
