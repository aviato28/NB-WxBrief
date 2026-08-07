"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BRIEFING_QUERY_GC_MS,
  BRIEFING_QUERY_STALE_MS,
} from "@/domain/constants/app";
import type { FlightRequest } from "@/domain/models/route";
import { briefingQueryKey } from "@/lib/flight-request";
import { fetchBriefing } from "@/services/briefing/briefing-api-client";

export function useBriefing(request: FlightRequest | null) {
  return useQuery({
    queryKey: request ? briefingQueryKey(request) : ["briefing", "idle"],
    queryFn: () => {
      if (!request) {
        throw new Error("Flight request is required");
      }
      return fetchBriefing(request);
    },
    enabled: request !== null,
    staleTime: BRIEFING_QUERY_STALE_MS,
    gcTime: BRIEFING_QUERY_GC_MS,
    retry: 1,
  });
}
