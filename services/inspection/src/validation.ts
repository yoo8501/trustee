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
