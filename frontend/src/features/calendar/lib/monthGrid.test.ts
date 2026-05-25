import { describe, expect, it } from 'vitest';
import {
  buildMonthGrid,
  intersectsDate,
  monthRange,
  shiftMonth,
  toIsoDate,
} from './monthGrid';

describe('buildMonthGrid', () => {
  it('2026-05 — 42 셀, 일요일 시작', () => {
    const cells = buildMonthGrid('2026-05', new Date(2026, 4, 25));
    expect(cells).toHaveLength(42);
    expect(cells[0].weekday).toBe(0);
  });

  it('2026-05 — 5/1 (금요일) 이 inMonth + day=1', () => {
    const cells = buildMonthGrid('2026-05', new Date(2026, 4, 25));
    const may1 = cells.find((c) => c.iso === '2026-05-01');
    expect(may1).toBeDefined();
    expect(may1!.inMonth).toBe(true);
    expect(may1!.day).toBe(1);
  });

  it('today 강조', () => {
    const cells = buildMonthGrid('2026-05', new Date(2026, 4, 25));
    const today = cells.find((c) => c.iso === '2026-05-25');
    expect(today!.isToday).toBe(true);
  });

  it('30일이 모두 inMonth (5월은 31일)', () => {
    const cells = buildMonthGrid('2026-05', new Date(2026, 4, 25));
    const inMonth = cells.filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(31);
  });
});

describe('shiftMonth', () => {
  it('+1 → 다음달', () => {
    expect(shiftMonth('2026-05', 1)).toBe('2026-06');
  });
  it('-1 → 이전달', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
  it('+12 → 다음해 같은 달', () => {
    expect(shiftMonth('2026-05', 12)).toBe('2027-05');
  });
});

describe('monthRange', () => {
  it('2026-05 — from 4월말, to 6월초', () => {
    const { from, to } = monthRange('2026-05');
    expect(from < '2026-05-01').toBe(true);
    expect(to > '2026-05-31').toBe(true);
  });
});

describe('intersectsDate', () => {
  it('단일 일자 일치', () => {
    expect(
      intersectsDate(
        '2026-05-25T00:00:00+09:00',
        '2026-05-25T23:59:59+09:00',
        '2026-05-25',
      ),
    ).toBe(true);
  });
  it('범위 가운데 — true', () => {
    expect(
      intersectsDate(
        '2026-05-20T00:00:00+09:00',
        '2026-05-27T23:59:59+09:00',
        '2026-05-25',
      ),
    ).toBe(true);
  });
  it('범위 밖 — false', () => {
    expect(
      intersectsDate(
        '2026-05-20T00:00:00+09:00',
        '2026-05-23T23:59:59+09:00',
        '2026-05-25',
      ),
    ).toBe(false);
  });
});

describe('toIsoDate', () => {
  it('YYYY-MM-DD 형식', () => {
    expect(toIsoDate(new Date(2026, 0, 3))).toBe('2026-01-03');
  });
});
