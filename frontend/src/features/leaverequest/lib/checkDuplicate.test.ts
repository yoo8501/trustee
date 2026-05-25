import { describe, expect, it } from 'vitest';
import type { LeaveRequest } from '../schemas';
import { checkDuplicate, collectExistingDates } from './checkDuplicate';

function row(over: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: 1,
    requesterId: 10,
    leaveTypeId: 1,
    leaveTypeName: '연차',
    startAt: '2026-05-26T00:00:00+09:00',
    endAt: '2026-05-26T08:00:00+09:00',
    hours: 8,
    reason: null,
    status: 'pending',
    approverId: 5,
    approverName: null,
    decidedAt: null,
    decisionComment: null,
    createdAt: '2026-05-25T10:00:00+09:00',
    ...over,
  };
}

describe('collectExistingDates', () => {
  it('pending/approved 만 포함', () => {
    const set = collectExistingDates([
      row({ id: 1, status: 'pending', startAt: '2026-05-26T00:00:00+09:00', endAt: '2026-05-26T08:00:00+09:00' }),
      row({ id: 2, status: 'approved', startAt: '2026-05-27T00:00:00+09:00', endAt: '2026-05-27T08:00:00+09:00' }),
      row({ id: 3, status: 'rejected', startAt: '2026-05-28T00:00:00+09:00', endAt: '2026-05-28T08:00:00+09:00' }),
      row({ id: 4, status: 'cancelled', startAt: '2026-05-29T00:00:00+09:00', endAt: '2026-05-29T08:00:00+09:00' }),
    ]);
    expect(set.has('2026-05-26')).toBe(true);
    expect(set.has('2026-05-27')).toBe(true);
    expect(set.has('2026-05-28')).toBe(false);
    expect(set.has('2026-05-29')).toBe(false);
  });

  it('여러 날에 걸친 휴가 → 모든 날짜 포함', () => {
    const set = collectExistingDates([
      row({
        startAt: '2026-05-26T00:00:00+09:00',
        endAt: '2026-05-28T08:00:00+09:00',
      }),
    ]);
    expect(set.size).toBe(3);
  });
});

describe('checkDuplicate', () => {
  it('기존 날짜와 정확히 겹치면 true', () => {
    const set = new Set(['2026-05-26']);
    expect(
      checkDuplicate(
        '2026-05-26T00:00:00+09:00',
        '2026-05-26T08:00:00+09:00',
        set,
      ),
    ).toBe(true);
  });

  it('범위 중 일부만 겹쳐도 true', () => {
    const set = new Set(['2026-05-27']);
    expect(
      checkDuplicate(
        '2026-05-26T00:00:00+09:00',
        '2026-05-28T00:00:00+09:00',
        set,
      ),
    ).toBe(true);
  });

  it('겹치지 않으면 false', () => {
    const set = new Set(['2026-05-26']);
    expect(
      checkDuplicate(
        '2026-05-27T00:00:00+09:00',
        '2026-05-27T08:00:00+09:00',
        set,
      ),
    ).toBe(false);
  });

  it('빈 입력은 false', () => {
    expect(checkDuplicate('', '', new Set())).toBe(false);
  });
});
