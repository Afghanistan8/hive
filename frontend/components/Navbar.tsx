"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountPanel } from "./AccountPanel";
import { HiveLogo } from "./hive/HiveLogo";
import { GENLAYER_CHAIN_ID } from "@/lib/genlayer/network";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/sports", label: "Sports" },
  { href: "/crypto", label: "Crypto" },
  { href: "/sports/leaderboard", label: "Leaderboard" },
  { href: "/portfolio", label: "Portfolio" },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/sports") return pathname.startsWith("/sports") && !pathname.startsWith("/sports/leaderboard");
  if (href === "/crypto") return pathname.startsWith("/crypto") || pathname.startsWith("/create");
  return pathname.startsWith(href);
}

export function Navbar() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.55);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Over the landing hero the page stays exactly as composed; the bar arrives once you scroll.
  const hidden = isHome && !scrolled;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        hidden ? "pointer-events-none -translate-y-3 opacity-0" : "translate-y-0 opacity-100",
      )}
    >
      <div className="mx-auto mt-3 flex h-14 max-w-7xl items-center justify-between gap-3 rounded-full border border-black/[0.07] bg-[#f4f1eb]/75 px-3 pl-5 shadow-[0_8px_30px_-18px_rgba(40,30,20,0.35)] backdrop-blur-xl md:mx-6 xl:mx-auto">
        <div className="flex items-center gap-6">
          <Link href="/" aria-label="Hive Markets home">
            <HiveLogo />
          </Link>
          <nav className="hidden items-center gap-0.5 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-[14px] transition-colors",
                  isActive(pathname, l.href) ? "bg-ink text-[#f6f3ee]" : "text-ink/70 hover:text-ink",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-[12px] text-ink/70 lg:inline-flex">
            <span className="ember-dot h-1.5 w-1.5 rounded-full" /> Studio Next · {GENLAYER_CHAIN_ID}
          </span>
          <AccountPanel />
        </div>
      </div>
      <nav className="mx-3 mt-2 flex items-center justify-center gap-1 md:hidden">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-full px-3 py-1 text-[13px] backdrop-blur",
              isActive(pathname, l.href) ? "bg-ink text-[#f6f3ee]" : "bg-[#f4f1eb]/80 text-ink/70",
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
