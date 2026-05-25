import { describe, expect, it } from 'vitest';
import {
  AccrualPolicySchema,
  AdjustLeaveBalanceSchema,
  AdminUserSchema,
  AttendanceAuditRowSchema,
  LeaveTypeSchema,
  RoleSchema,
  TeamSchema,
  UserStatusSchema,
} from './schemas';

describe('RoleSchema / UserStatusSchema', () => {
  it('정의된 role 5종은 통과', () => {
    for (const r of [
      'general',
      'team_lead',
      'dept_head',
      'hr_manager',
      'super_admin',
    ]) {
      expect(RoleSchema.safeParse(r).success).toBe(true);
    }
  });
  it('unknown role 거부', () => {
    expect(RoleSchema.safeParse('owner').success).toBe(false);
  });
  it('UserStatus 3종 통과', () => {
    for (const s of ['active', 'inactive', 'terminated']) {
      expect(UserStatusSchema.safeParse(s).success).toBe(true);
    }
    expect(UserStatusSchema.safeParse('deleted').success).toBe(false);
  });
});

describe('AdminUserSchema', () => {
  it('정상 row 통과 (teamId null 허용)', () => {
    const out = AdminUserSchema.safeParse({
      id: 1,
      email: 'a@b.com',
      name: '홍길동',
      status: 'active',
      role: 'general',
      teamId: null,
      managerId: null,
      hireDate: '2026-01-01',
    });
    expect(out.success).toBe(true);
  });
  it('id 음수 거부', () => {
    expect(
      AdminUserSchema.safeParse({
        id: -1,
        email: 'a@b.com',
        name: 'x',
        status: 'active',
        role: 'general',
        teamId: null,
        managerId: null,
        hireDate: '2026-01-01',
      }).success,
    ).toBe(false);
  });
});

describe('TeamSchema', () => {
  it('parent/lead/hr nullable 허용', () => {
    expect(
      TeamSchema.safeParse({
        id: 1,
        name: 'HR',
        parentTeamId: null,
        teamLeadId: null,
        hrManagerId: null,
      }).success,
    ).toBe(true);
  });
});

describe('AccrualPolicySchema', () => {
  it('annual_hire_anniversary 기본 정책 통과', () => {
    const out = AccrualPolicySchema.safeParse({
      type: 'annual_hire_anniversary',
      base_days: 15,
      tenure_bonus_per_2y: 1,
      tenure_cap_days: 25,
    });
    expect(out.success).toBe(true);
  });
  it('annual + base_days 누락 → base_days reason=required', () => {
    const out = AccrualPolicySchema.safeParse({
      type: 'annual_hire_anniversary',
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      const issue = out.error.issues.find((i) => i.path[0] === 'base_days');
      expect(issue?.message).toBe('required');
    }
  });
  it('annual + cap < base → cap_lt_base', () => {
    const out = AccrualPolicySchema.safeParse({
      type: 'annual_hire_anniversary',
      base_days: 15,
      tenure_cap_days: 10,
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      expect(
        out.error.issues.find((i) => i.path[0] === 'tenure_cap_days')
          ?.message,
      ).toBe('cap_lt_base');
    }
  });
  it('monthly_lt_one_year + base_days 누락 → required', () => {
    const out = AccrualPolicySchema.safeParse({
      type: 'monthly_lt_one_year',
    });
    expect(out.success).toBe(false);
  });
  it('fixed 는 base_days 없어도 통과', () => {
    const out = AccrualPolicySchema.safeParse({ type: 'fixed' });
    expect(out.success).toBe(true);
  });
  it('unknown type 거부', () => {
    const out = AccrualPolicySchema.safeParse({ type: 'random' });
    expect(out.success).toBe(false);
  });
  it('음수 필드 거부', () => {
    const out = AccrualPolicySchema.safeParse({
      type: 'fixed',
      base_days: -1,
    });
    expect(out.success).toBe(false);
  });
});

describe('LeaveTypeSchema', () => {
  it('정상 row 통과', () => {
    const out = LeaveTypeSchema.safeParse({
      id: 1,
      code: 'annual',
      name: '연차',
      defaultHours: 8,
      accrualPolicy: {
        type: 'annual_hire_anniversary',
        base_days: 15,
        tenure_cap_days: 25,
      },
      isPaid: true,
      isActive: true,
    });
    expect(out.success).toBe(true);
  });
  it('잘못된 accrualPolicy 가 포함되면 전체 거부', () => {
    expect(
      LeaveTypeSchema.safeParse({
        id: 1,
        code: 'annual',
        name: '연차',
        defaultHours: 8,
        accrualPolicy: { type: 'annual_hire_anniversary' }, // base_days 누락
        isPaid: true,
        isActive: true,
      }).success,
    ).toBe(false);
  });
});

describe('AttendanceAuditRowSchema', () => {
  it('check 시각 null 허용 + 빈 clientIp 기본값', () => {
    const out = AttendanceAuditRowSchema.safeParse({
      id: 1,
      userId: 1,
      workDate: '2026-05-25',
      checkInAt: null,
      checkOutAt: null,
      lunchBreakMinutes: 60,
      source: 'button',
      status: 'normal',
    });
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data.clientIp).toBe('');
      expect(out.data.userAgent).toBe('');
    }
  });
});

describe('AdjustLeaveBalanceSchema', () => {
  it('정상 입력 통과', () => {
    expect(
      AdjustLeaveBalanceSchema.safeParse({
        userId: 1,
        leaveTypeId: 1,
        deltaHours: 8,
        reason: '특별 휴가 지급',
      }).success,
    ).toBe(true);
  });
  it('reason 빈칸 → reason=required', () => {
    const out = AdjustLeaveBalanceSchema.safeParse({
      userId: 1,
      leaveTypeId: 1,
      deltaHours: 8,
      reason: '   ',
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      expect(
        out.error.issues.find((i) => i.path[0] === 'reason')?.message,
      ).toBe('required');
    }
  });
  it('deltaHours 0 → nonzero', () => {
    const out = AdjustLeaveBalanceSchema.safeParse({
      userId: 1,
      leaveTypeId: 1,
      deltaHours: 0,
      reason: '사유',
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      expect(
        out.error.issues.find((i) => i.path[0] === 'deltaHours')?.message,
      ).toBe('nonzero');
    }
  });
  it('음수 deltaHours (회수) 도 허용', () => {
    expect(
      AdjustLeaveBalanceSchema.safeParse({
        userId: 1,
        leaveTypeId: 1,
        deltaHours: -4,
        reason: '오적립 회수',
      }).success,
    ).toBe(true);
  });
});
