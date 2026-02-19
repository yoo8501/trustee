import { z } from "zod";

export const createInspectionSchema = z.object({
  trusteeId: z.string().min(1, "수탁사 ID는 필수입니다"),
  inspectionDate: z.string().min(1, "점검일은 필수입니다"),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
});

export const updateInspectionSchema = z.object({
  inspectionDate: z.string().optional(),
  score: z.number().min(0).max(100).optional(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
  findings: z.string().optional(),
  improvements: z.string().optional(),
});

export const createInspectionItemSchema = z.object({
  inspectionId: z.string().min(1, "점검 ID는 필수입니다"),
  category: z.string().min(1, "카테고리는 필수입니다"),
  question: z.string().min(1, "질문은 필수입니다"),
  result: z.enum(["pass", "fail", "partial", "not_applicable"]),
  note: z.string().optional(),
});

export const updateInspectionItemSchema = z.object({
  category: z.string().optional(),
  question: z.string().optional(),
  result: z.enum(["pass", "fail", "partial", "not_applicable"]).optional(),
  note: z.string().optional(),
});

export const batchCreateInspectionItemsSchema = z.object({
  items: z.array(
    z.object({
      category: z.string().min(1),
      question: z.string().min(1),
      result: z.enum(["pass", "fail", "partial", "not_applicable"]),
      note: z.string().optional(),
    })
  ).min(1, "최소 1개의 항목이 필요합니다"),
});

// ── 체크리스트 템플릿 ──

export const createChecklistTemplateSchema = z.object({
  title: z.string().min(1, "제목은 필수입니다"),
  version: z.string().optional(),
  description: z.string().optional(),
  categories: z.array(z.object({
    no: z.number(),
    name: z.string().min(1),
    weight: z.number().min(0).max(100).optional(),
    sections: z.array(z.object({
      no: z.string().min(1),
      name: z.string().min(1),
      items: z.array(z.object({
        no: z.string().min(1),
        question: z.string().min(1),
        hint: z.string().optional(),
        isCritical: z.boolean().optional(),
      })).min(1),
    })).min(1),
  })).min(1),
});

export const updateChecklistTemplateSchema = z.object({
  title: z.string().min(1).optional(),
  version: z.string().optional(),
  description: z.string().optional(),
});

export const importChecklistTemplateSchema = z.object({
  jsonData: z.object({
    title: z.string().optional(),
    version: z.string().optional(),
    description: z.string().optional(),
    categories: z.array(z.any()).min(1),
  }),
});

// ── 수탁사 체크리스트 ──

export const createTrusteeChecklistSchema = z.object({
  trusteeId: z.string().min(1, "수탁사 ID는 필수입니다"),
  templateId: z.string().min(1, "템플릿 ID는 필수입니다"),
  inspectionScope: z.string().optional(),
  deadline: z.string().min(1, "작성 기한은 필수입니다"),
});

export const updateTrusteeChecklistSchema = z.object({
  inspectionScope: z.string().optional(),
  status: z.enum(["draft", "sent", "in_progress", "submitted", "reviewed", "rejected"]).optional(),
  deadline: z.string().optional(),
});

export const rejectChecklistSchema = z.object({
  items: z.array(z.object({
    itemId: z.string().min(1, "항목 ID는 필수입니다"),
    status: z.enum(["approved", "rejected"]),
    reason: z.string().optional(),
  })).min(1, "최소 1개의 항목이 필요합니다")
    .refine(
      (items) => items.some((item) => item.status === "rejected"),
      "반려 항목이 최소 1개 이상 있어야 합니다"
    ),
  newDeadline: z.string().min(1, "새 작성 기한은 필수입니다"),
});

export const updateTrusteeChecklistItemSchema = z.object({
  applicable: z.boolean().optional(),
  answer: z.enum(["yes", "no", "not_applicable"]).nullable().optional(),
  currentStatus: z.string().optional(),
  remarks: z.string().optional(),
});

export const batchUpdateChecklistItemsSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    applicable: z.boolean().optional(),
    answer: z.enum(["yes", "no", "not_applicable"]).nullable().optional(),
    currentStatus: z.string().optional(),
    remarks: z.string().optional(),
  })).min(1, "최소 1개의 항목이 필요합니다"),
});

// ── 수탁사 체크리스트 제출 ──

export const submitChecklistSchema = z.object({
  contactName: z.string().min(1, "담당자명은 필수입니다"),
  contactEmail: z.string().email("유효한 이메일을 입력해주세요").optional().or(z.literal("")),
  contactPhone: z.string().optional(),
});
