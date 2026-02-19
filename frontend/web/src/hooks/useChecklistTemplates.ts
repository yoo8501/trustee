"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateChecklistTemplateInput, UpdateChecklistTemplateInput } from "@trustee/types";

import { checklistTemplatesApi } from "@/lib/api";

const TEMPLATES_KEY = ["checklist-templates"];

export function useChecklistTemplates(params?: {
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: [...TEMPLATES_KEY, params],
    queryFn: () => checklistTemplatesApi.list(params),
  });
}

export function useChecklistTemplate(id: string) {
  return useQuery({
    queryKey: [...TEMPLATES_KEY, id],
    queryFn: () => checklistTemplatesApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateChecklistTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateChecklistTemplateInput) => checklistTemplatesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  });
}

export function useImportChecklistTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jsonData: unknown) => checklistTemplatesApi.importJson(jsonData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  });
}

export function useUpdateChecklistTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateChecklistTemplateInput }) =>
      checklistTemplatesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  });
}

export function useDeleteChecklistTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => checklistTemplatesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  });
}
