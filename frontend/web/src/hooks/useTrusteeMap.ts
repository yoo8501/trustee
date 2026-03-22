"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { trusteesApi } from "@/lib/api";

const TRUSTEE_MAP_KEY = ["trustees", "map"];

export function useTrusteeMap() {
  const { data } = useQuery({
    queryKey: TRUSTEE_MAP_KEY,
    queryFn: () => trusteesApi.list({ limit: 500 }),
    staleTime: 10 * 60 * 1000,
  });

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const t of data?.data ?? []) {
      map.set(t.id, t.companyName);
    }
    return map;
  }, [data]);
}
