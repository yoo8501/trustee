import type {
  TrusteeChecklist,
  CreateTrusteeChecklistInput,
  UpdateTrusteeChecklistInput,
  UpdateTrusteeChecklistItemInput,
  BatchUpdateChecklistItemsInput,
  RejectChecklistInput,
  ChecklistDiffResult,
  ChecklistSnapshotMeta,
  ItemReview,
  ScoringResult,
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
  search?: string;
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

  reject(id: string, data: RejectChecklistInput): Promise<ChecklistResponse> {
    return apiClient.post(`/api/trustee-checklists/${id}/reject`, data);
  },

  review(id: string): Promise<ChecklistResponse> {
    return apiClient.post(`/api/trustee-checklists/${id}/review`);
  },

  getSnapshots(id: string): Promise<{ data: ChecklistSnapshotMeta[] }> {
    return apiClient.get(`/api/trustee-checklists/${id}/snapshots`);
  },

  getDiff(id: string, round?: number): Promise<{ data: ChecklistDiffResult }> {
    return apiClient.get(`/api/trustee-checklists/${id}/diff`, round ? { round } : undefined);
  },

  getReviews(id: string, round?: number): Promise<{ data: ItemReview[] }> {
    return apiClient.get(`/api/trustee-checklists/${id}/reviews`, round ? { round } : undefined);
  },

  stats(): Promise<{ data: { total: number; submitted: number; reviewed: number; averageScore: number | null } }> {
    return apiClient.get("/api/trustee-checklists/stats/summary");
  },

  recentSubmitted(limit?: number): Promise<{ data: { id: string; title: string; trusteeId: string; status: string; totalScore: number | null; grade: string | null; submittedAt: string | null }[] }> {
    return apiClient.get("/api/trustee-checklists/recent/submitted", limit ? { limit } : undefined);
  },

  score(id: string): Promise<{ data: ScoringResult }> {
    return apiClient.post(`/api/trustee-checklists/${id}/score`);
  },
};
