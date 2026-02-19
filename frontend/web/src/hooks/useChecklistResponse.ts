"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BatchUpdateChecklistItemsInput,
  SubmitTrusteeChecklistInput,
} from "@trustee/types";

import { checklistResponseApi } from "@/lib/api";

const RESPONSE_KEY = ["checklist-response"];

export function useChecklistByToken(token: string) {
  return useQuery({
    queryKey: [...RESPONSE_KEY, token],
    queryFn: () => checklistResponseApi.getByToken(token),
    enabled: !!token,
  });
}

export function useBatchSaveResponse(token: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BatchUpdateChecklistItemsInput) =>
      checklistResponseApi.batchUpdateItems(token, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...RESPONSE_KEY, token] });
    },
  });
}

export function useUploadEvidence(token: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, files }: { itemId: string; files: File[] }) =>
      checklistResponseApi.uploadFiles(token, itemId, files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...RESPONSE_KEY, token] });
    },
  });
}

export function useDeleteEvidence(token: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileId: string) =>
      checklistResponseApi.deleteFile(token, fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...RESPONSE_KEY, token] });
    },
  });
}

export function useSubmitChecklist(token: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SubmitTrusteeChecklistInput) =>
      checklistResponseApi.submit(token, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...RESPONSE_KEY, token] });
    },
  });
}

export function useReopenChecklist(token: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => checklistResponseApi.reopen(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...RESPONSE_KEY, token] });
    },
  });
}

export function useChecklistResponseReviews(token: string) {
  return useQuery({
    queryKey: [...RESPONSE_KEY, token, "reviews"],
    queryFn: () => checklistResponseApi.getReviews(token),
    enabled: !!token,
  });
}
