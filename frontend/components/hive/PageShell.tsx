"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Inner routes get a padded content column; the landing page composes its own full-bleed hero. */
export function PageShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") return <>{children}</>;
  return (
    <main className="px-4 pb-24 pt-32 md:px-6 md:pt-28">
      <div className="mx-auto max-w-7xl">{children}</div>
    </main>
  );
}
