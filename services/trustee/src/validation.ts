import { z } from "zod";

export const createTrusteeSchema = z.object({
  companyName: z.string().min(1, "회사명은 필수입니다"),
  businessNumber: z.string().min(1, "사업자번호는 필수입니다"),
  representative: z.string().min(1, "대표자는 필수입니다"),
  contactName: z.string().min(1, "담당자명은 필수입니다"),
  contactPhone: z.string().min(1, "연락처는 필수입니다"),
  contactEmail: z.string().email("유효한 이메일을 입력해주세요"),
  delegatedTasks: z.string().min(1, "위탁 업무는 필수입니다"),
  status: z.enum(["active", "inactive", "pending"]).optional(),
});

export const updateTrusteeSchema = createTrusteeSchema.partial();

export const createContractSchema = z.object({
  trusteeId: z.string().min(1, "수탁사 ID는 필수입니다"),
  startDate: z.string().min(1, "시작일은 필수입니다"),
  endDate: z.string().min(1, "종료일은 필수입니다"),
  fileUrl: z.string().optional(),
});

export const updateContractSchema = createContractSchema
  .omit({ trusteeId: true })
  .partial();
