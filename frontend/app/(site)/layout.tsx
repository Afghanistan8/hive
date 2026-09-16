import type { ReactNode } from "react";

/**
 * Padded content column for every page except the landing page, which composes its own
 * full-bleed hero. A route group (not a pathname check) so server and client always agree.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <main className="px-4 pb-24 pt-32 md:px-6 md:pt-28">
      <div className="mx-auto max-w-7xl">{children}</div>
    </main>
  );
}
