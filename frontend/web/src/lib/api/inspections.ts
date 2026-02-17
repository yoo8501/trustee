import type {
  Inspection,
  CreateInspectionInput,
  UpdateInspectionInput,
  InspectionItem,
  CreateInspectionItemInput,
  UpdateInspectionItemInput,
} from "@trustee/types";

import { apiClient } from "./client";

export interface InspectionListResponse {
  data: Inspection[];
  total: number;
}

export interface InspectionResponse {
  data: Inspection;
}

export interface InspectionItemListResponse {
  data: InspectionItem[];
  total: number;
}

export interface InspectionItemResponse {
  data: InspectionItem;
}

interface InspectionListParams {
  page?: number;
  limit?: number;
  trusteeId?: string;
  status?: string;
}

export const inspectionsApi = {
  list(params?: InspectionListParams): Promise<InspectionListResponse> {
    return apiClient.get("/api/inspections", params ? { ...params } : undefined);
  },

  getById(id: string): Promise<InspectionResponse> {
    return apiClient.get(`/api/inspections/${id}`);
  },

  getByTrusteeId(trusteeId: string): Promise<InspectionListResponse> {
    return apiClient.get(`/api/inspections/trustee/${trusteeId}`);
  },

  create(data: CreateInspectionInput): Promise<InspectionResponse> {
    return apiClient.post("/api/inspections", {
      ...data,
      inspectionDate:
        data.inspectionDate instanceof Date
          ? data.inspectionDate.toISOString()
          : data.inspectionDate,
    });
  },

  update(id: string, data: UpdateInspectionInput): Promise<InspectionResponse> {
    return apiClient.patch(`/api/inspections/${id}`, {
      ...data,
      ...(data.inspectionDate && {
        inspectionDate:
          data.inspectionDate instanceof Date
            ? data.inspectionDate.toISOString()
            : data.inspectionDate,
      }),
    });
  },

  delete(id: string): Promise<void> {
    return apiClient.delete(`/api/inspections/${id}`);
  },
};

export const inspectionItemsApi = {
  listByInspection(inspectionId: string): Promise<InspectionItemListResponse> {
    return apiClient.get(`/api/inspection-items/inspection/${inspectionId}`);
  },

  getById(id: string): Promise<InspectionItemResponse> {
    return apiClient.get(`/api/inspection-items/${id}`);
  },

  create(data: CreateInspectionItemInput): Promise<InspectionItemResponse> {
    return apiClient.post("/api/inspection-items", data);
  },

  createBatch(
    inspectionId: string,
    items: Omit<CreateInspectionItemInput, "inspectionId">[]
  ): Promise<{ data: { count: number } }> {
    return apiClient.post(`/api/inspection-items/inspection/${inspectionId}/batch`, {
      items,
    });
  },

  update(id: string, data: UpdateInspectionItemInput): Promise<InspectionItemResponse> {
    return apiClient.patch(`/api/inspection-items/${id}`, data);
  },

  delete(id: string): Promise<void> {
    return apiClient.delete(`/api/inspection-items/${id}`);
  },
};
