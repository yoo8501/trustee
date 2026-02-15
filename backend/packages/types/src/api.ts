// REST API 공통 타입 정의

// 성공 응답
export interface SuccessResponse<T> {
  data: T;
}

// 목록 응답
export interface ListResponse<T> {
  data: T[];
  total: number;
}

// 에러 응답
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

// 쿼리 파라미터
export interface ListQueryParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
  search?: string;
}

// 서비스 헬스 체크 응답
export interface HealthCheckResponse {
  status: "ok" | "error";
  service: string;
  timestamp: string;
  uptime: number;
}

// Gateway 집계 응답
export interface TrusteeSummary {
  id: string;
  companyName: string;
  businessNumber: string;
  status: string;
  contractCount: number;
  latestInspection: {
    id: string;
    inspectionDate: string;
    score: number | null;
    status: string;
  } | null;
}
