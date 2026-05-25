// RED stub — Sprint 1 TDD
import type { FieldError } from './types';

export interface ApiErrorInit {
  status: number;
  message: string;
  errorCode?: string;
  fields?: FieldError[];
  traceId?: string;
}

export class ApiError extends Error {
  // TODO(green): persist init fields on the instance
  constructor(init: ApiErrorInit) {
    super(init.message);
  }
}
