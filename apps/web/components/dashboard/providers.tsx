"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Toaster } from "sonner";

/** Server state (TanStack Query) and toasts (Sonner) for the dashboard. */
export function DashboardProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        position="bottom-left"
        toastOptions={{
          classNames: {
            toast: "!rounded-card !border-line !bg-surface !text-text !shadow-overlay !font-sans",
            description: "!text-text-muted",
            actionButton: "!bg-bus !text-on-bus !font-semibold",
          },
        }}
      />
    </QueryClientProvider>
  );
}
