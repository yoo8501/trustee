"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTrusteeInput, UpdateTrusteeInput } from "@trustee/types";

import { trusteesApi } from "@/lib/api";

const TRUSTEES_KEY = ["trustees"];

export function useTrustees(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: [...TRUSTEES_KEY, params],
    queryFn: () => trusteesApi.list(params),
  });
}

export function useTrustee(id: string) {
  return useQuery({
    queryKey: [...TRUSTEES_KEY, id],
    queryFn: () => trusteesApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateTrustee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTrusteeInput) => trusteesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRUSTEES_KEY });
    },
  });
}

export function useUpdateTrustee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTrusteeInput }) =>
      trusteesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRUSTEES_KEY });
    },
  });
}

export function useDeleteTrustee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => trusteesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRUSTEES_KEY });
    },
  });
}
