import { z } from 'zod';

/**
 * ExpenseReport 도메인 Zod 스키마 — Sprint 7.
 *
 * BE 응답 / 폼 입력 양쪽에서 재사용.
 * - status: pending/approved/rejected/cancelled (LeaveRequest 와 동일 enum 4종)
 * - amountWon: 1원 단위 정수, 양수 (음수/0 차단). 최대 1억원 (개별 결의서 상한).
 * - attachmentUrl: 첨부 업로드 후 채워짐 (선택).
 */

export const ExpenseStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);
export type ExpenseStatus = z.infer<typeof ExpenseStatusSchema>;

/**
 * BE 응답 row — `ExpenseReport`.
 *
 * camelCase 통일. 금액은 정수 won.
 */
export const ExpenseReportSchema = z.object({
  id: z.number().int().positive(),
  requesterId: z.number().int().positive(),
  requesterName: z.string().optional().default(''),
  amountWon: z.number().int().nonnegative(),
  vendor: z.string(),
  purpose: z.string(),
  paidAt: z.string(),
  attachmentUrl: z.string().nullable().optional().default(null),
  attachmentMime: z.string().nullable().optional().default(null),
  status: ExpenseStatusSchema,
  approverId: z.number().int().nullable().optional().default(null),
  approverName: z.string().nullable().optional().default(null),
  decidedAt: z.string().nullable().optional().default(null),
  decisionComment: z.string().nullable().optional().default(null),
  createdAt: z.string(),
});
export type ExpenseReport = z.infer<typeof ExpenseReportSchema>;

/**
 * 지출결의서 신청 폼 입력 — POST /api/hr/expense-reports body.
 *
 * - amountWon: 양수 정수, 1억원 이하.
 * - vendor: 1~200 자.
 * - purpose: 1~500 자.
 * - paidAt: YYYY-MM-DD (날짜만).
 * - 첨부는 별도 endpoint 로 업로드 후 attachmentUrl 을 추가 전달하거나
 *   생성 직후 PATCH 패턴이 아닌, create 에서 attachmentUrl 옵션으로 받는다.
 */
export const CreateExpenseSchema = z.object({
  amountWon: z
    .number({ message: 'required' })
    .int()
    .positive()
    .max(100_000_000),
  vendor: z.string().min(1).max(200),
  purpose: z.string().min(1).max(500),
  paidAt: z.string().min(1),
  attachmentUrl: z.string().optional(),
  attachmentMime: z.string().optional(),
});
export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>;

/**
 * 첨부 업로드 응답 — POST /api/hr/expense-reports/attachment.
 *
 * BE 가 업로드 후 attachmentUrl + mime 반환. FE 는 미리보기 + 폼 hidden 으로 저장.
 */
export const AttachmentUploadSchema = z.object({
  attachmentUrl: z.string(),
  attachmentMime: z.string(),
  sizeBytes: z.number().int().nonnegative().optional().default(0),
});
export type AttachmentUpload = z.infer<typeof AttachmentUploadSchema>;
