import type {
  TrusteeChecklist,
  EvidenceFile,
  UpdateTrusteeChecklistItemInput,
  BatchUpdateChecklistItemsInput,
  SubmitTrusteeChecklistInput,
} from "@trustee/types";

import { apiClient } from "./client";

export interface ChecklistResponseData {
  data: Omit<TrusteeChecklist, "accessToken">;
}

export interface UploadedEvidenceFile extends EvidenceFile {
  url: string;
}

export const checklistResponseApi = {
  getByToken(token: string): Promise<ChecklistResponseData> {
    return apiClient.get(`/api/checklist-response/${token}`);
  },

  updateItem(
    token: string,
    itemId: string,
    data: UpdateTrusteeChecklistItemInput
  ): Promise<{ data: unknown }> {
    return apiClient.patch(
      `/api/checklist-response/${token}/items/${itemId}`,
      data
    );
  },

  batchUpdateItems(
    token: string,
    data: BatchUpdateChecklistItemsInput
  ): Promise<{ data: unknown }> {
    return apiClient.patch(
      `/api/checklist-response/${token}/items/batch`,
      data
    );
  },

  uploadFiles(
    token: string,
    itemId: string,
    files: File[]
  ): Promise<{ data: UploadedEvidenceFile[] }> {
    return apiClient.uploadFiles(
      `/api/checklist-response/${token}/items/${itemId}/files`,
      files
    );
  },

  deleteFile(token: string, fileId: string): Promise<void> {
    return apiClient.delete(
      `/api/checklist-response/${token}/files/${fileId}`
    );
  },

  getFileUrl(storagePath: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    return `${baseUrl}/api/checklist-response/files/${storagePath}`;
  },

  submit(
    token: string,
    data: SubmitTrusteeChecklistInput
  ): Promise<ChecklistResponseData> {
    return apiClient.post(`/api/checklist-response/${token}/submit`, data);
  },

  reopen(token: string): Promise<ChecklistResponseData> {
    return apiClient.post(`/api/checklist-response/${token}/reopen`);
  },
};
