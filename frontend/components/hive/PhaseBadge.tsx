import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  OPEN: "bg-emerald-600/10 text-emerald-800 border-emerald-700/25",
  CLOSED: "bg-black/[0.05] text-ink/70 border-black/15",
  READY_TO_SETTLE: "bg-[#ee6a2c]/12 text-[#b53a17] border-[#ee6a2c]/35",
  SETTLED: "bg-ink text-[#f6f3ee] border-ink",
  INCONCLUSIVE: "bg-black/[0.04] text-ink/55 border-black/10",
  POSTPONED: "bg-amber-500/10 text-amber-800 border-amber-600/30",
};

const LABELS: Record<string, string> = {
  READY_TO_SETTLE: "READY TO SETTLE",
};

export function PhaseBadge({ phase, className }: { phase: string; className?: string }) {
  return (
    <span suppressHydrationWarning className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide", STYLES[phase] ?? STYLES.INCONCLUSIVE, className)}>
      {LABELS[phase] ?? phase}
    </span>
  );
}
