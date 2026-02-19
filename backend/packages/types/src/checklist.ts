// ── Root 템플릿 ──

export interface ChecklistTemplate {
  id: string;
  title: string;
  version: string;
  description?: string;
  categories: ChecklistCategory[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChecklistCategory {
  id: string;
  templateId: string;
  no: number;
  name: string;
  sortOrder: number;
  weight: number;
  sections: ChecklistSection[];
}

export interface ChecklistSection {
  id: string;
  categoryId: string;
  no: string;
  name: string;
  sortOrder: number;
  items: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  sectionId: string;
  no: string;
  question: string;
  hint?: string;
  sortOrder: number;
  isCritical: boolean;
}

export interface CreateChecklistTemplateInput {
  title: string;
  version?: string;
  description?: string;
  categories: {
    no: number;
    name: string;
    weight?: number;
    sections: {
      no: string;
      name: string;
      items: {
        no: string;
        question: string;
        hint?: string;
        isCritical?: boolean;
      }[];
    }[];
  }[];
}

export interface UpdateChecklistTemplateInput {
  title?: string;
  version?: string;
  description?: string;
}

// ── 수탁사 체크리스트 ──

import type { ScoringResult } from "./scoring";

export type TrusteeChecklistStatus =
  | "draft"
  | "sent"
  | "in_progress"
  | "submitted"
  | "reviewed"
  | "rejected";

export type ChecklistAnswer = "yes" | "no" | "not_applicable";

export interface TrusteeChecklist {
  id: string;
  trusteeId: string;
  templateId?: string;
  templateVersion?: string;
  title: string;
  inspectionScope?: string;
  status: TrusteeChecklistStatus;
  submittedAt?: Date;
  accessToken: string;
  accessTokenExpiresAt: Date;
  submissionCount: number;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  totalScore?: number;
  grade?: string;
  scoreDetail?: ScoringResult;
  scoredAt?: Date;
  totalItemCount: number;
  answeredCount: number;
  reviewRound: number;
  categories: TrusteeChecklistCategory[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TrusteeChecklistCategory {
  id: string;
  checklistId: string;
  no: number;
  name: string;
  sortOrder: number;
  weight: number;
  sections: TrusteeChecklistSection[];
}

export interface TrusteeChecklistSection {
  id: string;
  categoryId: string;
  no: string;
  name: string;
  sortOrder: number;
  items: TrusteeChecklistItem[];
}

export interface EvidenceFile {
  id: string;
  itemId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  createdAt: Date;
}

export interface TrusteeChecklistItem {
  id: string;
  sectionId: string;
  no: string;
  question: string;
  hint?: string;
  sortOrder: number;
  applicable: boolean;
  answer?: ChecklistAnswer;
  currentStatus?: string;
  remarks?: string;
  isCritical: boolean;
  evidenceFiles: EvidenceFile[];
}

export interface CreateTrusteeChecklistInput {
  trusteeId: string;
  templateId: string;
  inspectionScope?: string;
  deadline: string;
}

export interface UpdateTrusteeChecklistInput {
  inspectionScope?: string;
  status?: TrusteeChecklistStatus;
  deadline?: string;
}

export interface UpdateTrusteeChecklistItemInput {
  applicable?: boolean;
  answer?: ChecklistAnswer | null;
  currentStatus?: string;
  remarks?: string;
}

export interface BatchUpdateChecklistItemsInput {
  items: {
    id: string;
    applicable?: boolean;
    answer?: ChecklistAnswer | null;
    currentStatus?: string;
    remarks?: string;
  }[];
}

// 수탁사 측 체크리스트 제출 요청
export interface SubmitTrusteeChecklistInput {
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
}

// 토큰 재발급 응답
export interface RegenerateTokenResponse {
  accessToken: string;
}

// ── 검토/반려 ──

export interface ItemReview {
  id: string;
  checklistId: string;
  itemId: string;
  status: "approved" | "rejected";
  reason?: string;
  reviewedAt: Date;
  reviewRound: number;
}

export interface SnapshotItemData {
  itemId: string;
  no: string;
  question: string;
  applicable: boolean;
  answer: ChecklistAnswer | null;
  currentStatus: string | null;
  remarks: string | null;
  evidenceFileNames: string[];
}

export interface ChecklistSnapshot {
  id: string;
  checklistId: string;
  round: number;
  data: SnapshotItemData[];
  submittedAt: Date;
}

export interface ChecklistSnapshotMeta {
  id: string;
  checklistId: string;
  round: number;
  submittedAt: Date;
}

export interface RejectChecklistInput {
  items: {
    itemId: string;
    status: "approved" | "rejected";
    reason?: string;
  }[];
  newDeadline: string;
}

export interface ChecklistDiffResult {
  previousRound: number;
  currentRound: number;
  changes: ChecklistDiffItem[];
}

export interface ChecklistDiffItem {
  itemId: string;
  no: string;
  question: string;
  fields: ChecklistDiffField[];
}

export interface ChecklistDiffField {
  field: "answer" | "currentStatus" | "remarks" | "evidenceFiles" | "applicable";
  previous: string | null;
  current: string | null;
  changed: boolean;
}
