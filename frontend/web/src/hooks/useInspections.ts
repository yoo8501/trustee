"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateInspectionInput,
  UpdateInspectionInput,
  CreateInspectionItemInput,
  UpdateInspectionItemInput,
} from "@trustee/types";

import { inspectionsApi, inspectionItemsApi } from "@/lib/api";

const INSPECTIONS_KEY = ["inspections"];
const INSPECTION_ITEMS_KEY = ["inspection-items"];

export function useInspections(params?: {
  page?: number;
  limit?: number;
  trusteeId?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: [...INSPECTIONS_KEY, params],
    queryFn: () => inspectionsApi.list(params),
  });
}

export function useInspection(id: string) {
  return useQuery({
    queryKey: [...INSPECTIONS_KEY, id],
    queryFn: () => inspectionsApi.getById(id),
    enabled: !!id,
  });
}

export function useInspectionsByTrustee(trusteeId: string) {
  return useQuery({
    queryKey: [...INSPECTIONS_KEY, "trustee", trusteeId],
    queryFn: () => inspectionsApi.getByTrusteeId(trusteeId),
    enabled: !!trusteeId,
  });
}

export function useCreateInspection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateInspectionInput) => inspectionsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INSPECTIONS_KEY });
    },
  });
}

export function useUpdateInspection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateInspectionInput }) =>
      inspectionsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INSPECTIONS_KEY });
    },
  });
}

export function useDeleteInspection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => inspectionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INSPECTIONS_KEY });
    },
  });
}

// 점검 항목 훅
export function useInspectionItems(inspectionId: string) {
  return useQuery({
    queryKey: [...INSPECTION_ITEMS_KEY, "inspection", inspectionId],
    queryFn: () => inspectionItemsApi.listByInspection(inspectionId),
    enabled: !!inspectionId,
  });
}

export function useCreateInspectionItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateInspectionItemInput) =>
      inspectionItemsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INSPECTION_ITEMS_KEY });
    },
  });
}

export function useUpdateInspectionItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateInspectionItemInput;
    }) => inspectionItemsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INSPECTION_ITEMS_KEY });
    },
  });
}

export function useDeleteInspectionItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => inspectionItemsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INSPECTION_ITEMS_KEY });
    },
  });
}
