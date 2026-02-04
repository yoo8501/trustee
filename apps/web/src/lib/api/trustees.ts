import type {
  Trustee,
  CreateTrusteeInput,
  UpdateTrusteeInput,
} from "@trustee/types";

import { apiClient } from "./client";

export interface TrusteeListResponse {
  data: Trustee[];
  total: number;
}

export interface TrusteeResponse {
  data: Trustee;
}

interface TrusteeListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

export const trusteesApi = {
  list(params?: TrusteeListParams): Promise<TrusteeListResponse> {
    return apiClient.get("/api/trustees", params ? { ...params } : undefined);
  },

  getById(id: string): Promise<TrusteeResponse> {
    return apiClient.get(`/api/trustees/${id}`);
  },

  create(data: CreateTrusteeInput): Promise<TrusteeResponse> {
    return apiClient.post("/api/trustees", data);
  },

  update(id: string, data: UpdateTrusteeInput): Promise<TrusteeResponse> {
    return apiClient.patch(`/api/trustees/${id}`, data);
  },

  delete(id: string): Promise<void> {
    return apiClient.delete(`/api/trustees/${id}`);
  },
};
