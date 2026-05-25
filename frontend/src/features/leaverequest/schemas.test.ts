import { describe, expect, it } from 'vitest';
import {
  CreateDelegationSchema,
  CreateLeaveRequestSchema,
  DelegationSchema,
  LeaveBalanceSchema,
  LeaveRequestSchema,
  LeaveStatusSchema,
} from './schemas';

describe('LeaveStatusSchema', () => {
  it('정의된 status 4종 통과', () => {
    for (const s of ['pending', 'approved', 'rejected', 'cancelled']) {
      expect(LeaveStatusSchema.safeParse(s).success).toBe(true);
    }
  });
  it('unknown status 거부', () => {
    expect(LeaveStatusSchema.safeParse('draft').success).toBe(false);
  });
});

describe('LeaveRequestSchema', () => {
  it('정상 row 통과', () => {
    const out = LeaveRequestSchema.safeParse({
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
      approverName: '김민지',
      decidedAt: null,
      decisionComment: null,
      createdAt: '2026-05-25T10:00:00+09:00',
    });
    expect(out.success).toBe(true);
  });

  it('approver 가 null 인 경우 (대기 결재자 없음)', () => {
    const out = LeaveRequestSchema.safeParse({
      id: 1,
      requesterId: 10,
      leaveTypeId: 1,
      startAt: '2026-05-26T00:00:00+09:00',
      endAt: '2026-05-26T08:00:00+09:00',
      hours: 8,
      status: 'pending',
      approverId: null,
      createdAt: '2026-05-25T10:00:00+09:00',
    });
    expect(out.success).toBe(true);
  });

  it('hours 0 거부', () => {
    expect(
      LeaveRequestSchema.safeParse({
        id: 1,
        requesterId: 10,
        leaveTypeId: 1,
        startAt: '2026-05-26T00:00:00+09:00',
        endAt: '2026-05-26T08:00:00+09:00',
        hours: 0,
        status: 'pending',
        approverId: null,
        createdAt: '2026-05-25T10:00:00+09:00',
      }).success,
    ).toBe(false);
  });
});

describe('CreateLeaveRequestSchema', () => {
  const baseStart = '2026-05-26T00:00:00+09:00';
  const baseEnd = '2026-05-26T08:00:00+09:00';

  it('정상 입력 통과', () => {
    const out = CreateLeaveRequestSchema.safeParse({
      leaveTypeId: 1,
      startAt: baseStart,
      endAt: baseEnd,
      hours: 8,
    });
    expect(out.success).toBe(true);
  });

  it('reason 포함 통과', () => {
    expect(
      CreateLeaveRequestSchema.safeParse({
        leaveTypeId: 1,
        startAt: baseStart,
        endAt: baseEnd,
        hours: 8,
        reason: '가족 행사',
      }).success,
    ).toBe(true);
  });

  it('leaveTypeId 누락 거부', () => {
    expect(
      CreateLeaveRequestSchema.safeParse({
        startAt: baseStart,
        endAt: baseEnd,
        hours: 8,
      }).success,
    ).toBe(false);
  });

  it('hours 음수 거부', () => {
    expect(
      CreateLeaveRequestSchema.safeParse({
        leaveTypeId: 1,
        startAt: baseStart,
        endAt: baseEnd,
        hours: -1,
      }).success,
    ).toBe(false);
  });

  it('hours 161 (160 초과) 거부 — 최대 4주', () => {
    expect(
      CreateLeaveRequestSchema.safeParse({
        leaveTypeId: 1,
        startAt: baseStart,
        endAt: baseEnd,
        hours: 161,
      }).success,
    ).toBe(false);
  });

  it('endAt < startAt → beforeStart', () => {
    const out = CreateLeaveRequestSchema.safeParse({
      leaveTypeId: 1,
      startAt: baseEnd, // swapped
      endAt: baseStart,
      hours: 8,
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      expect(
        out.error.issues.find((i) => i.path[0] === 'endAt')?.message,
      ).toBe('beforeStart');
    }
  });
});

describe('LeaveBalanceSchema', () => {
  it('정상 row 통과', () => {
    const out = LeaveBalanceSchema.safeParse({
      id: 1,
      userId: 10,
      leaveTypeId: 1,
      leaveTypeCode: 'annual',
      leaveTypeName: '연차',
      periodYear: 2026,
      grantedHours: 120,
      usedHours: 16,
      remainingHours: 104,
    });
    expect(out.success).toBe(true);
  });

  it('expiresAt null 허용', () => {
    expect(
      LeaveBalanceSchema.safeParse({
        id: 1,
        userId: 10,
        leaveTypeId: 1,
        periodYear: 2026,
        grantedHours: 120,
        usedHours: 16,
        remainingHours: 104,
        expiresAt: null,
      }).success,
    ).toBe(true);
  });
});

describe('Delegation 스키마', () => {
  it('정상 Delegation row 통과', () => {
    expect(
      DelegationSchema.safeParse({
        id: 1,
        delegatorId: 5,
        delegateId: 10,
        validFrom: '2026-05-25T00:00:00+09:00',
        validTo: '2026-05-30T23:59:59+09:00',
      }).success,
    ).toBe(true);
  });

  it('CreateDelegation endAt < startAt → beforeStart', () => {
    const out = CreateDelegationSchema.safeParse({
      delegateId: 10,
      validFrom: '2026-05-30T00:00:00+09:00',
      validTo: '2026-05-25T00:00:00+09:00',
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      expect(
        out.error.issues.find((i) => i.path[0] === 'validTo')?.message,
      ).toBe('beforeStart');
    }
  });
});
