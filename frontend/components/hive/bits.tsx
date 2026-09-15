"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { GENLAYER_CHAIN_ID, GENLAYER_NETWORK } from "@/lib/genlayer/network";
import { explorerAddress } from "@/lib/hive/config";
import { cn } from "@/lib/utils";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("brand-card p-5", className)}>{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function NetworkBadge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
      <span className="h-2 w-2 rounded-full bg-emerald-400" />
      {GENLAYER_NETWORK.chainName} · {GENLAYER_CHAIN_ID}
    </span>
  );
}

export function ContractLink({ label, address }: { label: string; address: string }) {
  if (!address) return <span className="text-destructive text-sm">{label}: not configured</span>;
  return (
    <a href={explorerAddress(address)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm hover:text-accent">
      <span className="text-muted-foreground">{label}</span>
      <code className="font-mono">{address.slice(0, 8)}…{address.slice(-6)}</code>
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold">{title}</h1>
        {subtitle && <p className="mt-2 max-w-3xl text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return <div className="py-12 text-center text-muted-foreground">Reading {what} from the contract…</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mb-4 inline-block text-sm text-muted-foreground hover:text-accent">
      ← {children}
    </Link>
  );
}

export function SourceLink({ href, children }: { href?: string; children: ReactNode }) {
  if (!href) return <span className="text-muted-foreground">{children}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline break-all">
      {children} <ExternalLink className="w-3 h-3 shrink-0" />
    </a>
  );
}
