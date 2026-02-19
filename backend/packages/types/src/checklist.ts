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
}

export interface CreateChecklistTemplateInput {
  title: string;
  version?: string;
  description?: string;
  categories: {
    no: number;
    name: string;
    sections: {
      no: string;
      name: string;
      items: {
        no: string;
        question: string;
        hint?: string;
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

export type TrusteeChecklistStatus =
  | "draft"
  | "sent"
  | "in_progress"
  | "submitted"
  | "reviewed";

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
