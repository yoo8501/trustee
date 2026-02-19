import type {
  ChecklistTemplate,
  CreateChecklistTemplateInput,
  UpdateChecklistTemplateInput,
} from "@trustee/types";

import { apiClient } from "./client";

export interface TemplateListResponse {
  data: ChecklistTemplate[];
  total: number;
}

export interface TemplateResponse {
  data: ChecklistTemplate;
}

interface TemplateListParams {
  page?: number;
  limit?: number;
}

export const checklistTemplatesApi = {
  list(params?: TemplateListParams): Promise<TemplateListResponse> {
    return apiClient.get("/api/checklist-templates", params ? { ...params } : undefined);
  },

  getById(id: string): Promise<TemplateResponse> {
    return apiClient.get(`/api/checklist-templates/${id}`);
  },

  create(data: CreateChecklistTemplateInput): Promise<TemplateResponse> {
    return apiClient.post("/api/checklist-templates", data);
  },

  importJson(jsonData: unknown): Promise<TemplateResponse> {
    return apiClient.post("/api/checklist-templates/import", { jsonData });
  },

  update(id: string, data: UpdateChecklistTemplateInput): Promise<TemplateResponse> {
    return apiClient.patch(`/api/checklist-templates/${id}`, data);
  },

  delete(id: string): Promise<void> {
    return apiClient.delete(`/api/checklist-templates/${id}`);
  },
};
