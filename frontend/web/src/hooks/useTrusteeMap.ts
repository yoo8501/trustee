"use client";

import { useMemo } from "react";
import { useTrustees } from "@/hooks";

export function useTrusteeMap() {
  const { data } = useTrustees({ limit: 500 });

  const trusteeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of data?.data ?? []) {
      map.set(t.id, t.companyName);
    }
    return map;
  }, [data]);

  return trusteeMap;
}
