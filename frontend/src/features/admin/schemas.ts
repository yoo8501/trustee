import { z } from 'zod';

/**
 * Admin / HR 도메인 Zod 스키마 모음.
 *
 * BE 응답 shape 과 1:1 매핑 (camelCase). API client 의 파싱 + 폼 검증 양쪽에서 재사용된다.
 *
 * - Role / UserStatus / Source enum 은 BE `permission.Role`, `dbq.UserStatus`,
 *   `attendance_records.source` 와 동일.
 * - AccrualPolicySchema 는 BE `internal/hr/leave/accrual_policy.go` 의 enum/필드와 일치.
 */

export const RoleSchema = z.enum([
  'general',
  'team_lead',
  'dept_head',
  'hr_manager',
  'super_admin',
]);
export type Role = z.infer<typeof RoleSchema>;

export const UserStatusSchema = z.enum(['active', 'inactive', 'terminated']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

/**
 * 관리자/HR 사용자 목록의 row.
 *
 * teamId / managerId 는 nullable (소속 없음). hireDate 는 YYYY-MM-DD.
 */
export const AdminUserSchema = z.object({
  id: z.number().int().positive(),
  email: z.string(),
  name: z.string(),
  status: UserStatusSchema,
  role: RoleSchema,
  teamId: z.number().int().nullable(),
  managerId: z.number().int().nullable(),
  hireDate: z.string(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

/**
 * Team — BE `internal/teams/handler.go` `teamResponse`.
 */
export const TeamSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  parentTeamId: z.number().int().nullable(),
  teamLeadId: z.number().int().nullable(),
  hrManagerId: z.number().int().nullable(),
});
export type Team = z.infer<typeof TeamSchema>;

/**
 * AccrualPolicy — BE `accrual_policy.go` JSON 컬럼.
 *
 * type 은 4종 enum. 필드는 type 별로 유의미한 조합이 다르지만 본 스키마에선
 * 음수 거부 + cap >= base 등 BE Validate 와 동일한 검증을 거친다 (superRefine).
 */
export const AccrualPolicySchema = z
  .object({
    type: z.enum([
      'annual_hire_anniversary',
      'monthly_lt_one_year',
      'fixed',
      'carryover_from_overtime',
    ]),
    base_days: z.number().int().min(0).optional(),
    tenure_bonus_per_2y: z.number().int().min(0).optional(),
    tenure_cap_days: z.number().int().min(0).optional(),
    expires_after_months: z.number().int().min(0).optional(),
    carryover_max_days: z.number().int().min(0).optional(),
  })
  .superRefine((policy, ctx) => {
    if (policy.type === 'annual_hire_anniversary') {
      const base = policy.base_days ?? 0;
      if (base <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['base_days'],
          message: 'required',
        });
      }
      if (
        policy.tenure_cap_days !== undefined &&
        policy.tenure_cap_days > 0 &&
        policy.tenure_cap_days < base
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['tenure_cap_days'],
          message: 'cap_lt_base',
        });
      }
    }
    if (policy.type === 'monthly_lt_one_year') {
      const base = policy.base_days ?? 0;
      if (base <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['base_days'],
          message: 'required',
        });
      }
    }
  });
export type AccrualPolicy = z.infer<typeof AccrualPolicySchema>;

/**
 * LeaveType — BE `leavetype_handler.go` `leaveTypeResponse`.
 *
 * accrualPolicy 는 JSON 객체로 도착 (BE 가 `json.RawMessage` 로 직렬화하지만
 * envelope.data 단계에서 이미 객체로 파싱되어 있음).
 */
export const LeaveTypeSchema = z.object({
  id: z.number().int().positive(),
  code: z.string(),
  name: z.string(),
  defaultHours: z.number(),
  accrualPolicy: AccrualPolicySchema,
  isPaid: z.boolean(),
  isActive: z.boolean(),
});
export type LeaveType = z.infer<typeof LeaveTypeSchema>;

/**
 * AttendanceAuditRow — BE `audit/handler.go` `attendanceListItem`.
 *
 * checkInAt / checkOutAt / createdAt 은 ISO 8601 (UTC). 표시는 KST 변환.
 */
export const AttendanceAuditRowSchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  workDate: z.string(),
  checkInAt: z.string().nullish(),
  checkOutAt: z.string().nullish(),
  lunchBreakMinutes: z.number(),
  source: z.string(),
  clientIp: z.string().optional().default(''),
  userAgent: z.string().optional().default(''),
  status: z.string(),
  createdAt: z.string().optional().default(''),
});
export type AttendanceAuditRow = z.infer<typeof AttendanceAuditRowSchema>;

/**
 * AdjustLeaveBalanceInput — HR 잔여 강제 조정.
 *
 * BE `leavebalance_handler.go` Adjust 의 request body 와 일치.
 * reason 은 1자 이상 필수 (UX §3 폼 단계 차단).
 * deltaHours 는 0 이 아닌 수 (정/음 모두 허용).
 */
export const AdjustLeaveBalanceSchema = z.object({
  userId: z.number().int().positive(),
  leaveTypeId: z.number().int().positive(),
  periodYear: z.number().int().min(2000).optional(),
  deltaHours: z
    .number()
    .refine((v) => v !== 0, { message: 'nonzero' }),
  reason: z
    .string()
    .trim()
    .min(1, { message: 'required' }),
});
export type AdjustLeaveBalanceInput = z.infer<typeof AdjustLeaveBalanceSchema>;
