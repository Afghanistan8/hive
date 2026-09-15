import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  OPEN: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  CLOSED: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  READY_TO_SETTLE: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  SETTLED: "bg-purple-500/20 text-purple-200 border-purple-500/40",
  INCONCLUSIVE: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40",
  POSTPONED: "bg-orange-500/15 text-orange-300 border-orange-500/30",
};

const LABELS: Record<string, string> = {
  READY_TO_SETTLE: "READY TO SETTLE",
};

export function PhaseBadge({ phase, className }: { phase: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide", STYLES[phase] ?? STYLES.INCONCLUSIVE, className)}>
      {LABELS[phase] ?? phase}
    </span>
  );
}
