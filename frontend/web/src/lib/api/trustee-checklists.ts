import type {
  TrusteeChecklist,
  CreateTrusteeChecklistInput,
  UpdateTrusteeChecklistInput,
  UpdateTrusteeChecklistItemInput,
  BatchUpdateChecklistItemsInput,
} from "@trustee/types";

import { apiClient } from "./client";

export interface ChecklistListResponse {
  data: TrusteeChecklist[];
  total: number;
}

export interface ChecklistResponse {
  data: TrusteeChecklist;
}

interface ChecklistListParams {
  page?: number;
  limit?: number;
  trusteeId?: string;
  status?: string;
}

export const trusteeChecklistsApi = {
  list(params?: ChecklistListParams): Promise<ChecklistListResponse> {
    return apiClient.get("/api/trustee-checklists", params ? { ...params } : undefined);
  },

  getById(id: string): Promise<ChecklistResponse> {
    return apiClient.get(`/api/trustee-checklists/${id}`);
  },

  create(data: CreateTrusteeChecklistInput): Promise<ChecklistResponse> {
    return apiClient.post("/api/trustee-checklists", data);
  },

  update(id: string, data: UpdateTrusteeChecklistInput): Promise<ChecklistResponse> {
    return apiClient.patch(`/api/trustee-checklists/${id}`, data);
  },

  updateItem(checklistId: string, itemId: string, data: UpdateTrusteeChecklistItemInput): Promise<{ data: unknown }> {
    return apiClient.patch(`/api/trustee-checklists/${checklistId}/items/${itemId}`, data);
  },

  batchUpdateItems(checklistId: string, data: BatchUpdateChecklistItemsInput): Promise<{ data: unknown }> {
    return apiClient.patch(`/api/trustee-checklists/${checklistId}/items/batch`, data);
  },

  regenerateToken(id: string): Promise<{ data: { accessToken: string } }> {
    return apiClient.post(`/api/trustee-checklists/${id}/regenerate-token`);
  },

  delete(id: string): Promise<void> {
    return apiClient.delete(`/api/trustee-checklists/${id}`);
  },
};
