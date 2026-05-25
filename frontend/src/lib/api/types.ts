// RED stub — Sprint 1 TDD
export interface FieldError {
  field: string;
  reason: string;
}

export interface ErrorDetails {
  errorCode: string;
  fields?: FieldError[];
  traceId?: string;
}

export interface ApiResult<T> {
  success: boolean;
  data: T | null;
  message: string | null;
  details: ErrorDetails | null;
  total: number | null;
}
