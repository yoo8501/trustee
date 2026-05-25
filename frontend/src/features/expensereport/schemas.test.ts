import { describe, expect, it } from 'vitest';
import {
  AttachmentUploadSchema,
  CreateExpenseSchema,
  ExpenseReportSchema,
  ExpenseStatusSchema,
} from './schemas';

describe('ExpenseStatusSchema', () => {
  it('4종 enum 통과', () => {
    expect(ExpenseStatusSchema.safeParse('pending').success).toBe(true);
    expect(ExpenseStatusSchema.safeParse('approved').success).toBe(true);
    expect(ExpenseStatusSchema.safeParse('rejected').success).toBe(true);
    expect(ExpenseStatusSchema.safeParse('cancelled').success).toBe(true);
  });

  it('unknown 상태 거부', () => {
    expect(ExpenseStatusSchema.safeParse('unknown').success).toBe(false);
  });
});

describe('CreateExpenseSchema', () => {
  const base = {
    amountWon: 12000,
    vendor: '거래처',
    purpose: '거래처 미팅 식대',
    paidAt: '2026-05-25',
  };

  it('정상 입력 통과', () => {
    expect(CreateExpenseSchema.safeParse(base).success).toBe(true);
  });

  it('amountWon 음수 거부', () => {
    expect(
      CreateExpenseSchema.safeParse({ ...base, amountWon: -1 }).success,
    ).toBe(false);
  });

  it('amountWon 0 거부', () => {
    expect(
      CreateExpenseSchema.safeParse({ ...base, amountWon: 0 }).success,
    ).toBe(false);
  });

  it('amountWon 1억 초과 거부', () => {
    expect(
      CreateExpenseSchema.safeParse({
        ...base,
        amountWon: 100_000_001,
      }).success,
    ).toBe(false);
  });

  it('amountWon 소수점 거부', () => {
    expect(
      CreateExpenseSchema.safeParse({ ...base, amountWon: 12.5 }).success,
    ).toBe(false);
  });

  it('vendor 빈 문자열 거부', () => {
    expect(
      CreateExpenseSchema.safeParse({ ...base, vendor: '' }).success,
    ).toBe(false);
  });

  it('purpose 빈 문자열 거부', () => {
    expect(
      CreateExpenseSchema.safeParse({ ...base, purpose: '' }).success,
    ).toBe(false);
  });

  it('paidAt 빈 문자열 거부', () => {
    expect(
      CreateExpenseSchema.safeParse({ ...base, paidAt: '' }).success,
    ).toBe(false);
  });

  it('vendor 200자 초과 거부', () => {
    expect(
      CreateExpenseSchema.safeParse({
        ...base,
        vendor: 'a'.repeat(201),
      }).success,
    ).toBe(false);
  });

  it('purpose 500자 초과 거부', () => {
    expect(
      CreateExpenseSchema.safeParse({
        ...base,
        purpose: 'a'.repeat(501),
      }).success,
    ).toBe(false);
  });

  it('attachmentUrl 선택 — 있으면 통과', () => {
    expect(
      CreateExpenseSchema.safeParse({
        ...base,
        attachmentUrl: 'https://example.com/r.pdf',
        attachmentMime: 'application/pdf',
      }).success,
    ).toBe(true);
  });
});

describe('ExpenseReportSchema', () => {
  const sample = {
    id: 1,
    requesterId: 10,
    requesterName: '홍길동',
    amountWon: 12000,
    vendor: '식당',
    purpose: '점심 식대',
    paidAt: '2026-05-25',
    attachmentUrl: null,
    attachmentMime: null,
    status: 'pending',
    approverId: 5,
    approverName: '김민지',
    decidedAt: null,
    decisionComment: null,
    createdAt: '2026-05-25T10:00:00+09:00',
  };

  it('정상 BE 응답 파싱', () => {
    const p = ExpenseReportSchema.safeParse(sample);
    expect(p.success).toBe(true);
  });

  it('optional 필드 누락 허용', () => {
    const p = ExpenseReportSchema.safeParse({
      id: 1,
      requesterId: 10,
      amountWon: 5000,
      vendor: 'v',
      purpose: 'p',
      paidAt: '2026-05-25',
      status: 'pending',
      createdAt: '2026-05-25T10:00:00+09:00',
    });
    expect(p.success).toBe(true);
  });

  it('status 검증', () => {
    expect(
      ExpenseReportSchema.safeParse({ ...sample, status: 'oops' }).success,
    ).toBe(false);
  });
});

describe('AttachmentUploadSchema', () => {
  it('정상 응답', () => {
    expect(
      AttachmentUploadSchema.safeParse({
        attachmentUrl: 'https://example.com/r.pdf',
        attachmentMime: 'application/pdf',
        sizeBytes: 12000,
      }).success,
    ).toBe(true);
  });

  it('sizeBytes 누락 허용', () => {
    expect(
      AttachmentUploadSchema.safeParse({
        attachmentUrl: '/a.pdf',
        attachmentMime: 'application/pdf',
      }).success,
    ).toBe(true);
  });
});
