import { useId } from "react";
import { cn } from "@/lib/utils";

/** The HIVE mark: a single ember orb with a molten highlight and a soft paper halo. */
export function HiveMark({ size = 28, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <radialGradient id={`${id}-body`} cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#FFC08A" />
          <stop offset="28%" stopColor="#F7843D" />
          <stop offset="62%" stopColor="#E4562A" />
          <stop offset="100%" stopColor="#B73A1C" />
        </radialGradient>
        <radialGradient id={`${id}-halo`} cx="50%" cy="50%" r="50%">
          <stop offset="62%" stopColor="#D8D1C5" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#D8D1C5" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.16  0 0 0 0 0.05  0 0 0 0.35 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <circle cx="32" cy="32" r="31" fill={`url(#${id}-halo)`} />
      <circle cx="32" cy="32" r="21" fill={`url(#${id}-body)`} />
      <circle cx="32" cy="32" r="21" fill="#000" filter={`url(#${id}-grain)`} />
      <ellipse cx="25.5" cy="23.5" rx="6" ry="4" fill="#FFE2C4" opacity="0.55" transform="rotate(-28 25.5 23.5)" />
    </svg>
  );
}

export function HiveLogo({ className, size = 26 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-ink", className)}>
      <HiveMark size={size} />
      <span className="text-[1.15rem] font-semibold tracking-[-0.04em]">Hive</span>
    </span>
  );
}
