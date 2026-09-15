"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Bottom-left ambient sound switch: a soft generated drone, off by default. */
export function SoundToggle({ className }: { className?: string }) {
  const [on, setOn] = useState(false);
  const audio = useRef<{ ctx: AudioContext; gain: GainNode } | null>(null);

  const ensure = () => {
    if (audio.current) return audio.current;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new Ctx();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.4;
    filter.connect(gain);
    gain.connect(ctx.destination);

    [110, 164.81, 220.4, 329.2].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 ? "triangle" : "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = [0.18, 0.08, 0.06, 0.03][i];
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.031;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = g.gain.value * 0.6;
      lfo.connect(lfoGain).connect(g.gain);
      osc.connect(g).connect(filter);
      osc.start();
      lfo.start();
    });
    audio.current = { ctx, gain };
    return audio.current;
  };

  const toggle = () => {
    const a = ensure();
    const next = !on;
    if (next && a.ctx.state === "suspended") void a.ctx.resume();
    a.gain.gain.cancelScheduledValues(a.ctx.currentTime);
    a.gain.gain.setTargetAtTime(next ? 0.22 : 0, a.ctx.currentTime, 0.6);
    setOn(next);
  };

  useEffect(() => () => { void audio.current?.ctx.close(); }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Mute ambient sound" : "Play ambient sound"}
      className={cn(
        "fixed bottom-5 left-5 z-40 grid h-9 w-9 place-items-center rounded-full bg-[#f6f3ee]/90 text-ink shadow-[0_2px_12px_rgba(40,30,20,0.12)] backdrop-blur transition hover:scale-105",
        className,
      )}
    >
      <span className="hive-bars flex h-3 items-end gap-[2px]">
        {[0.55, 1, 0.75, 0.35].map((hgt, i) => (
          <span
            key={i}
            className="w-[2px] rounded-full bg-current"
            style={{
              height: `${hgt * 100}%`,
              animation: on ? `hive-bar 0.9s ${i * 0.12}s ease-in-out infinite alternate` : undefined,
              opacity: i === 3 && !on ? 0.45 : 1,
            }}
          />
        ))}
      </span>
      <style>{`@keyframes hive-bar { from { transform: scaleY(0.35); } to { transform: scaleY(1); } } .hive-bars > span { transform-origin: bottom; }`}</style>
    </button>
  );
}
