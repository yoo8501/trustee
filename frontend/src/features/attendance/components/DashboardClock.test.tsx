import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardClock } from './DashboardClock';

describe('DashboardClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-05-25 09:00:00 KST = 2026-05-25 00:00:00 UTC
    vi.setSystemTime(new Date('2026-05-25T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('대형 시계 — HH:mm:ss 형식, tabular-nums, 44px', () => {
    render(<DashboardClock />);
    const clock = screen.getByTestId('dashboard-clock');
    expect(clock).toBeInTheDocument();
    // KST 09:00:00
    expect(clock.textContent).toMatch(/^09:00:00$/);

    const style = window.getComputedStyle(clock);
    expect(style.fontVariantNumeric).toContain('tabular-nums');
    expect(style.fontSize).toBe('44px');
  });

  it('role=status 이지만 aria-live=off (매초 스크린리더 spam 방지)', () => {
    render(<DashboardClock />);
    const clock = screen.getByTestId('dashboard-clock');
    expect(clock).toHaveAttribute('role', 'status');
    expect(clock).toHaveAttribute('aria-live', 'off');
  });

  it('1초마다 업데이트된다', () => {
    render(<DashboardClock />);
    const clock = screen.getByTestId('dashboard-clock');
    expect(clock.textContent).toBe('09:00:00');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(clock.textContent).toBe('09:00:01');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(clock.textContent).toBe('09:00:03');
  });
});
