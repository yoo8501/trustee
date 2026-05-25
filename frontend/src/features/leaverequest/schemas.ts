import { z } from 'zod';

/**
 * LeaveRequest 도메인 Zod 스키마.
 *
 * BE 응답 / 폼 입력 양쪽에서 재사용된다.
 * - status: BE enum 4종 (pending/approved/rejected/cancelled).
 * - hours: 최대 160 (4주). UX §3 폼 단계 차단 — 잔여보다 큰 값은 컴포넌트가 차단.
 * - reason: 선택. trim 후 길이 0 이면 undefined 로 정규화 (BE 는 null 허용).
 */

export const LeaveStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);
export type LeaveStatus = z.infer<typeof LeaveStatusSchema>;

/**
 * BE 응답 row — `LeaveRequest`.
 *
 * camelCase 통일. ISO 8601 (timestamptz). 본 환경에서는 KST 단일이지만 표현은
 * application layer 책임 (lib/i18n/format).
 */
export const LeaveRequestSchema = z.object({
  id: z.number().int().positive(),
  requesterId: z.number().int().positive(),
  requesterName: z.string().optional(),
  leaveTypeId: z.number().int().positive(),
  leaveTypeName: z.string().optional().default(''),
  startAt: z.string(),
  endAt: z.string(),
  hours: z.number().positive(),
  reason: z.string().nullable().optional().default(null),
  status: LeaveStatusSchema,
  approverId: z.number().int().nullable(),
  approverName: z.string().nullable().optional().default(null),
  decidedAt: z.string().nullable().optional().default(null),
  decisionComment: z.string().nullable().optional().default(null),
  createdAt: z.string(),
});
export type LeaveRequest = z.infer<typeof LeaveRequestSchema>;

/**
 * 휴가 신청 폼 입력 — POST /api/hr/leave-requests body.
 *
 * superRefine:
 *  - endAt < startAt → reason=beforeStart (BE 의 INVALID_DATE_RANGE 와 정렬)
 *  - hours 0 거부 (positive 가 이미 처리하지만 명시)
 */
export const CreateLeaveRequestSchema = z
  .object({
    leaveTypeId: z.number().int().positive(),
    startAt: z.string().min(1),
    endAt: z.string().min(1),
    hours: z.number().positive().max(160),
    reason: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const start = new Date(data.startAt);
    const end = new Date(data.endAt);
    if (Number.isNaN(start.getTime())) {
      ctx.addIssue({
        code: 'custom',
        message: 'invalid',
        path: ['startAt'],
      });
    }
    if (Number.isNaN(end.getTime())) {
      ctx.addIssue({
        code: 'custom',
        message: 'invalid',
        path: ['endAt'],
      });
    }
    if (
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      end.getTime() < start.getTime()
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'beforeStart',
        path: ['endAt'],
      });
    }
  });
export type CreateLeaveRequestInput = z.infer<
  typeof CreateLeaveRequestSchema
>;

/**
 * LeaveBalance — GET /api/hr/leave-balances/me (Sprint 3 도메인).
 *
 * remainingHours 는 BE 가 제공 (granted - used). FE 가 자체 계산하면 정렬 깨질 수 있으므로
 * BE 값을 우선 사용.
 */
export const LeaveBalanceSchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  leaveTypeId: z.number().int().positive(),
  leaveTypeCode: z.string().optional().default(''),
  leaveTypeName: z.string().optional().default(''),
  periodYear: z.number().int(),
  grantedHours: z.number(),
  usedHours: z.number(),
  remainingHours: z.number(),
  expiresAt: z.string().nullable().optional().default(null),
});
export type LeaveBalance = z.infer<typeof LeaveBalanceSchema>;

/**
 * Delegation — Sprint 6.
 *
 * scope 는 jsonb. P1 에서는 `{ leaveType?: string[] }` 정도. P2 까지 확장 예정.
 */
export const DelegationSchema = z.object({
  id: z.number().int().positive(),
  delegatorId: z.number().int().positive(),
  delegatorName: z.string().optional().default(''),
  delegateId: z.number().int().positive(),
  delegateName: z.string().optional().default(''),
  validFrom: z.string(),
  validTo: z.string(),
  scope: z.record(z.string(), z.unknown()).optional().default({}),
});
export type Delegation = z.infer<typeof DelegationSchema>;

export const CreateDelegationSchema = z
  .object({
    delegateId: z.number().int().positive(),
    validFrom: z.string().min(1),
    validTo: z.string().min(1),
    scope: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    const start = new Date(data.validFrom);
    const end = new Date(data.validTo);
    if (
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      end.getTime() < start.getTime()
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'beforeStart',
        path: ['validTo'],
      });
    }
  });
export type CreateDelegationInput = z.infer<typeof CreateDelegationSchema>;
