"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateContractInput, UpdateContractInput } from "@trustee/types";

import { contractsApi } from "@/lib/api";

const CONTRACTS_KEY = ["contracts"];

export function useContractsByTrustee(trusteeId: string) {
  return useQuery({
    queryKey: [...CONTRACTS_KEY, "trustee", trusteeId],
    queryFn: () => contractsApi.listByTrustee(trusteeId),
    enabled: !!trusteeId,
  });
}

export function useContract(id: string) {
  return useQuery({
    queryKey: [...CONTRACTS_KEY, id],
    queryFn: () => contractsApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateContract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateContractInput) => contractsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTRACTS_KEY });
    },
  });
}

export function useUpdateContract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateContractInput }) =>
      contractsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTRACTS_KEY });
    },
  });
}

export function useDeleteContract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => contractsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTRACTS_KEY });
    },
  });
}
