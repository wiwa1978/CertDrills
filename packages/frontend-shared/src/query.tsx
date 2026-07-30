"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

export function createDefaultQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export function SharedQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createDefaultQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
