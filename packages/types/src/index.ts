export * from "./events";
export * from "./api";

// 수탁사 상태
export type TrusteeStatus = "active" | "inactive" | "pending";

// 수탁사 정보
export interface Trustee {
  id: string;
  companyName: string;
  businessNumber: string;
  representative: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  delegatedTasks: string;
  status: TrusteeStatus;
  createdAt: Date;
  updatedAt: Date;
}

// 수탁사 생성 입력
export interface CreateTrusteeInput {
  companyName: string;
  businessNumber: string;
  representative: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  delegatedTasks: string;
  status?: TrusteeStatus;
}

// 수탁사 수정 입력
export type UpdateTrusteeInput = Partial<CreateTrusteeInput>;

// 계약 정보
export interface Contract {
  id: string;
  trusteeId: string;
  startDate: Date;
  endDate: Date;
  fileUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 계약 생성 입력
export interface CreateContractInput {
  trusteeId: string;
  startDate: Date;
  endDate: Date;
  fileUrl?: string;
}

// 계약 수정 입력
export type UpdateContractInput = Partial<Omit<CreateContractInput, "trusteeId">>;

// 점검 상태
export type InspectionStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

// 점검 결과
export type InspectionResult = "pass" | "fail" | "partial" | "not_applicable";

// 점검 정보
export interface Inspection {
  id: string;
  trusteeId: string;
  inspectionDate: Date;
  score?: number;
  status: InspectionStatus;
  findings?: string;
  improvements?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 점검 생성 입력
export interface CreateInspectionInput {
  trusteeId: string;
  inspectionDate: Date;
  status?: InspectionStatus;
}

// 점검 수정 입력
export interface UpdateInspectionInput extends Partial<Omit<CreateInspectionInput, "trusteeId">> {
  score?: number;
  findings?: string;
  improvements?: string;
}

// 점검 항목
export interface InspectionItem {
  id: string;
  inspectionId: string;
  category: string;
  question: string;
  result: InspectionResult;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 점검 항목 생성 입력
export interface CreateInspectionItemInput {
  inspectionId: string;
  category: string;
  question: string;
  result: InspectionResult;
  note?: string;
}

// 점검 항목 수정 입력
export type UpdateInspectionItemInput = Partial<Omit<CreateInspectionItemInput, "inspectionId">>;

// API 응답 타입
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

// 페이지네이션
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
