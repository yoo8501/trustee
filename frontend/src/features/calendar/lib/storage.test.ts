import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { calendarStorage } from './storage';

describe('calendarStorage', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('save → load 왕복 — view + month 보존', () => {
    calendarStorage.save({ view: 'week', month: '2026-05' });
    expect(calendarStorage.load()).toEqual({ view: 'week', month: '2026-05' });
  });

  it('초기 상태 → null', () => {
    expect(calendarStorage.load()).toBeNull();
  });

  it('잘못된 view enum → null', () => {
    window.localStorage.setItem(
      'docflow-calendar-state',
      JSON.stringify({ view: 'year', month: '2026-05' }),
    );
    expect(calendarStorage.load()).toBeNull();
  });

  it('JSON 형식 깨짐 → null', () => {
    window.localStorage.setItem('docflow-calendar-state', '{not-json');
    expect(calendarStorage.load()).toBeNull();
  });

  it('month 누락 → null', () => {
    window.localStorage.setItem(
      'docflow-calendar-state',
      JSON.stringify({ view: 'month' }),
    );
    expect(calendarStorage.load()).toBeNull();
  });

  it('clear — load null', () => {
    calendarStorage.save({ view: 'month', month: '2026-05' });
    calendarStorage.clear();
    expect(calendarStorage.load()).toBeNull();
  });
});
