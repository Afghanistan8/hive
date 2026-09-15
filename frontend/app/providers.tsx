"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { WalletProvider } from "@/lib/genlayer/WalletProvider";
import { WalletChooser } from "@/components/WalletChooser";

export function Providers({ children }: { children: React.ReactNode }) {
  // Use useState to ensure QueryClient is only created once per component lifecycle
  // This prevents the client from being recreated on every render
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        {children}
        <WalletChooser />
      </WalletProvider>
      <Toaster
        position="top-right"
        theme="light"
        richColors
        closeButton
        offset="80px"
        toastOptions={{
          style: {
            background: '#f6f3ee',
            border: '1px solid rgba(22,21,20,0.12)',
            color: '#161514',
            boxShadow: '0 12px 32px -16px rgba(40,30,20,0.35)',
          },
        }}
      />
    </QueryClientProvider>
  );
}
