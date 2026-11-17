"use client";
// Circular score gauge. The arc and the number move together on a critically damped spring
// (perceived duration 0.5 s, no bounce), retargeted from the current value and velocity when the score changes.
import { useEffect, useRef, useState } from "react";
import type { Band } from "../../detection/types";

const DURATION = 0.5;
const STIFFNESS = (2 * Math.PI / DURATION) ** 2;
const DAMPING = (4 * Math.PI) / DURATION;

function useSpring(target: number): number {
  const [v, setV] = useState(target);
  const state = useRef({ x: target, vel: 0, raf: 0, last: 0 });
  useEffect(() => {
    const s = state.current;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      s.x = target;
      s.vel = 0;
      setV(target);
      return;
    }
    cancelAnimationFrame(s.raf);
    s.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - s.last) / 1000);
      s.last = now;
      const a = STIFFNESS * (target - s.x) - DAMPING * s.vel;
      s.vel += a * dt;
      s.x += s.vel * dt;
      if (Math.abs(target - s.x) < 0.05 && Math.abs(s.vel) < 0.05) {
        s.x = target;
        s.vel = 0;
        setV(target);
        return;
      }
      setV(s.x);
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(s.raf);
  }, [target]);
  return v;
}

interface Props {
  score: number | null;
  band: Band | null;
  size?: number;
  label: string;
  bandLabel?: string;
  loading?: boolean;
  muted?: boolean;
}

export function Gauge({ score, band, size = 132, label, bandLabel, loading, muted }: Props) {
  const v = useSpring(score ?? 0);
  const stroke = Math.max(6, size * 0.075);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // 300° arc, open at the bottom
  const arc = c * (300 / 360);
  const filled = (Math.max(0, Math.min(100, v)) / 100) * arc;
  return (
    <div
      className="gauge"
      data-band={band ?? "none"}
      data-loading={loading || undefined}
      data-muted={muted || undefined}
      style={{ width: size, height: size, ["--g" as string]: `${size}px` }}
      role="img"
      aria-label={score === null ? label : `${label}: ${Math.round(score)}%${bandLabel ? `, ${bandLabel}` : ""}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <g transform={`rotate(120 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="gauge-track" strokeWidth={stroke} strokeDasharray={`${arc} ${c}`} strokeLinecap="round" />
          {score !== null && !loading && (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="gauge-fill" strokeWidth={stroke} strokeDasharray={`${Math.max(0.001, filled)} ${c}`} strokeLinecap="round" />
          )}
        </g>
      </svg>
      <div className="gauge-center" dir="ltr">
        {loading ? <span className="gauge-skel" /> : score === null ? <span className="gauge-num muted">–</span> : <span className="gauge-num">{Math.round(v)}<small>%</small></span>}
        {bandLabel && !loading && score !== null && <span className="gauge-band">{bandLabel}</span>}
      </div>
    </div>
  );
}
