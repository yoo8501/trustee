import type { Contract, CreateContractInput, UpdateContractInput } from "@trustee/types";

import { apiClient } from "./client";

export interface ContractListResponse {
  data: Contract[];
  total: number;
}

export interface ContractResponse {
  data: Contract;
}

export const contractsApi = {
  listByTrustee(trusteeId: string): Promise<ContractListResponse> {
    return apiClient.get(`/api/contracts/trustee/${trusteeId}`);
  },

  getById(id: string): Promise<ContractResponse> {
    return apiClient.get(`/api/contracts/${id}`);
  },

  create(data: CreateContractInput): Promise<ContractResponse> {
    return apiClient.post("/api/contracts", {
      ...data,
      startDate: data.startDate instanceof Date ? data.startDate.toISOString() : data.startDate,
      endDate: data.endDate instanceof Date ? data.endDate.toISOString() : data.endDate,
    });
  },

  update(id: string, data: UpdateContractInput): Promise<ContractResponse> {
    return apiClient.patch(`/api/contracts/${id}`, {
      ...data,
      ...(data.startDate && {
        startDate: data.startDate instanceof Date ? data.startDate.toISOString() : data.startDate,
      }),
      ...(data.endDate && {
        endDate: data.endDate instanceof Date ? data.endDate.toISOString() : data.endDate,
      }),
    });
  },

  delete(id: string): Promise<void> {
    return apiClient.delete(`/api/contracts/${id}`);
  },
};
