import { describe, expect, it } from 'vitest';
import { nextBusinessDay, nextBusinessDayRange } from './nextBusinessDay';

describe('nextBusinessDay', () => {
  it('월요일 → 화요일', () => {
    // 2026-05-25 (월)
    const from = new Date(2026, 4, 25, 12, 0, 0);
    const next = nextBusinessDay(from);
    expect(next.getDay()).toBe(2); // 화
    expect(next.getDate()).toBe(26);
  });

  it('금요일 → 월요일 (주말 skip)', () => {
    // 2026-05-29 (금)
    const from = new Date(2026, 4, 29, 12, 0, 0);
    const next = nextBusinessDay(from);
    expect(next.getDay()).toBe(1); // 월
    expect(next.getDate()).toBe(1);
    expect(next.getMonth()).toBe(5); // 6월
  });

  it('토요일 → 월요일', () => {
    // 2026-05-30 (토)
    const from = new Date(2026, 4, 30, 12, 0, 0);
    const next = nextBusinessDay(from);
    expect(next.getDay()).toBe(1); // 월
  });

  it('일요일 → 월요일', () => {
    // 2026-05-31 (일)
    const from = new Date(2026, 4, 31, 12, 0, 0);
    const next = nextBusinessDay(from);
    expect(next.getDay()).toBe(1); // 월
  });

  it('공휴일 skip — 월요일 다음날이 공휴일이면 그 다음', () => {
    // 2026-05-25 (월) → 26(화) 가 공휴일이라면 27(수)
    const from = new Date(2026, 4, 25, 12, 0, 0);
    const next = nextBusinessDay(from, ['2026-05-26']);
    expect(next.getDate()).toBe(27);
  });

  it('연속 공휴일 skip — 월화수 모두 공휴일이면 목요일', () => {
    // 2026-05-25 (월) → 26,27,28 공휴일 → 29(금)
    const from = new Date(2026, 4, 25, 12, 0, 0);
    const next = nextBusinessDay(from, [
      '2026-05-26',
      '2026-05-27',
      '2026-05-28',
    ]);
    expect(next.getDate()).toBe(29);
  });

  it('Date 객체 형태의 공휴일도 인식', () => {
    const from = new Date(2026, 4, 25, 12, 0, 0);
    const holiday = new Date(2026, 4, 26);
    const next = nextBusinessDay(from, [holiday]);
    expect(next.getDate()).toBe(27);
  });

  it('반환되는 시각은 09:00 으로 정규화', () => {
    const from = new Date(2026, 4, 25, 15, 30, 12);
    const next = nextBusinessDay(from);
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
    expect(next.getSeconds()).toBe(0);
  });
});

describe('nextBusinessDayRange', () => {
  it('start 09:00, end 18:00 ISO string 반환', () => {
    const from = new Date(2026, 4, 25, 12, 0, 0);
    const { startAt, endAt } = nextBusinessDayRange(from);
    const start = new Date(startAt);
    const end = new Date(endAt);
    expect(start.getHours()).toBe(9);
    expect(end.getHours()).toBe(18);
    // 같은 날짜
    expect(start.getDate()).toBe(end.getDate());
  });
});
