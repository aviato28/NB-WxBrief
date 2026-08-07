"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { BRIEFING_QUERY_GC_MS, BRIEFING_QUERY_STALE_MS } from "@/domain/constants/app";

export function AppProviders({ children }: { readonly children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: BRIEFING_QUERY_STALE_MS,
            gcTime: BRIEFING_QUERY_GC_MS,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
