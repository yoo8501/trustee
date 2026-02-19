import { z } from "zod";

const createContactSchema = z.object({
  name: z.string().min(1, "담당자명은 필수입니다"),
  phone: z.string().optional(),
  email: z
    .string()
    .email("유효한 이메일을 입력해주세요")
    .optional()
    .or(z.literal("")),
  department: z.string().optional(),
  position: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

export const createTrusteeSchema = z
  .object({
    companyName: z.string().min(1, "회사명은 필수입니다"),
    businessNumber: z.string().optional(),
    representative: z.string().optional(),
    delegatedTasks: z.string().min(1, "위탁 업무는 필수입니다"),
    status: z.enum(["active", "inactive", "pending"]).optional(),
    contacts: z
      .array(createContactSchema)
      .min(1, "최소 1명의 담당자가 필요합니다"),
  })
  .refine((data) => data.contacts.some((c) => c.isPrimary), {
    message: "주담당자를 1명 지정해주세요",
    path: ["contacts"],
  });

const updateContactSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "담당자명은 필수입니다"),
  phone: z.string().optional(),
  email: z
    .string()
    .email("유효한 이메일을 입력해주세요")
    .optional()
    .or(z.literal("")),
  department: z.string().optional(),
  position: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

export const updateTrusteeSchema = z.object({
  companyName: z.string().min(1).optional(),
  businessNumber: z.string().optional(),
  representative: z.string().optional(),
  delegatedTasks: z.string().min(1).optional(),
  status: z.enum(["active", "inactive", "pending"]).optional(),
  contacts: z.array(updateContactSchema).min(1).optional(),
});

export const createContractSchema = z.object({
  trusteeId: z.string().min(1, "수탁사 ID는 필수입니다"),
  startDate: z.string().min(1, "시작일은 필수입니다"),
  endDate: z.string().min(1, "종료일은 필수입니다"),
  fileUrl: z.string().optional(),
});

export const updateContractSchema = createContractSchema
  .omit({ trusteeId: true })
  .partial();
