"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateTrusteeChecklistInput,
  UpdateTrusteeChecklistInput,
  UpdateTrusteeChecklistItemInput,
  BatchUpdateChecklistItemsInput,
  RejectChecklistInput,
} from "@trustee/types";

import { trusteeChecklistsApi } from "@/lib/api";

const CHECKLISTS_KEY = ["trustee-checklists"];

export function useTrusteeChecklists(params?: {
  page?: number;
  limit?: number;
  trusteeId?: string;
  status?: string;
  search?: string;
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

export function useRejectChecklist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RejectChecklistInput }) =>
      trusteeChecklistsApi.reject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });
    },
  });
}

export function useReviewChecklist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => trusteeChecklistsApi.review(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });
    },
  });
}

export function useChecklistSnapshots(id: string) {
  return useQuery({
    queryKey: [...CHECKLISTS_KEY, id, "snapshots"],
    queryFn: () => trusteeChecklistsApi.getSnapshots(id),
    enabled: !!id,
  });
}

export function useChecklistDiff(id: string, round?: number) {
  return useQuery({
    queryKey: [...CHECKLISTS_KEY, id, "diff", round],
    queryFn: () => trusteeChecklistsApi.getDiff(id, round),
    enabled: !!id,
  });
}

export function useChecklistReviews(id: string, round?: number) {
  return useQuery({
    queryKey: [...CHECKLISTS_KEY, id, "reviews", round],
    queryFn: () => trusteeChecklistsApi.getReviews(id, round),
    enabled: !!id,
  });
}

export function useChecklistStats() {
  return useQuery({
    queryKey: [...CHECKLISTS_KEY, "stats"],
    queryFn: () => trusteeChecklistsApi.stats(),
  });
}

export function useRecentSubmitted(limit?: number) {
  return useQuery({
    queryKey: [...CHECKLISTS_KEY, "recent", limit],
    queryFn: () => trusteeChecklistsApi.recentSubmitted(limit),
  });
}

export function useScoreChecklist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => trusteeChecklistsApi.score(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });
    },
  });
}
