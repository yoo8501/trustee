"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateTrusteeChecklistInput,
  UpdateTrusteeChecklistInput,
  UpdateTrusteeChecklistItemInput,
  BatchUpdateChecklistItemsInput,
} from "@trustee/types";

import { trusteeChecklistsApi } from "@/lib/api";

const CHECKLISTS_KEY = ["trustee-checklists"];

export function useTrusteeChecklists(params?: {
  page?: number;
  limit?: number;
  trusteeId?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: [...CHECKLISTS_KEY, params],
    queryFn: () => trusteeChecklistsApi.list(params),
  });
}

export function useTrusteeChecklist(id: string) {
  return useQuery({
    queryKey: [...CHECKLISTS_KEY, id],
    queryFn: () => trusteeChecklistsApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateTrusteeChecklist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTrusteeChecklistInput) => trusteeChecklistsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });
    },
  });
}

export function useUpdateTrusteeChecklist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTrusteeChecklistInput }) =>
      trusteeChecklistsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });
    },
  });
}

export function useUpdateChecklistItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      checklistId,
      itemId,
      data,
    }: {
      checklistId: string;
      itemId: string;
      data: UpdateTrusteeChecklistItemInput;
    }) => trusteeChecklistsApi.updateItem(checklistId, itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });
    },
  });
}

export function useBatchUpdateChecklistItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      checklistId,
      data,
    }: {
      checklistId: string;
      data: BatchUpdateChecklistItemsInput;
    }) => trusteeChecklistsApi.batchUpdateItems(checklistId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });
    },
  });
}

export function useRegenerateToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => trusteeChecklistsApi.regenerateToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });
    },
  });
}

export function useDeleteTrusteeChecklist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => trusteeChecklistsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });
    },
  });
}
