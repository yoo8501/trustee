import type { FieldError } from './types';

export interface ApiErrorInit {
  status: number;
  message: string;
  errorCode?: string;
  fields?: FieldError[];
  traceId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly errorCode?: string;
  readonly fields?: FieldError[];
  readonly traceId?: string;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.errorCode = init.errorCode;
    this.fields = init.fields;
    this.traceId = init.traceId;
  }
}
