"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountPanel } from "./AccountPanel";
import { NetworkBadge } from "./hive/bits";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/sports", label: "Sports" },
  { href: "/crypto", label: "Crypto" },
  { href: "/create", label: "Create" },
  { href: "/portfolio", label: "Portfolio" },
];

export function Navbar() {
  const pathname = usePathname();
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-md gradient-purple-pink text-sm">⬢</span>
            HIVE
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-white/5",
                  pathname?.startsWith(l.href) ? "text-foreground bg-white/5" : "text-muted-foreground",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden lg:block"><NetworkBadge /></div>
          <AccountPanel />
        </div>
      </div>
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-white/5 px-4 py-1 md:hidden">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={cn("rounded-md px-3 py-1 text-sm", pathname?.startsWith(l.href) ? "bg-white/5" : "text-muted-foreground")}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
