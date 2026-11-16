"use client";
// Side drawer on wide screens, bottom sheet on phones (drag handle, two snap points, drag down to close).
// Escape closes, focus moves in and is restored, Tab stays inside.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconX } from "./Icons";

const SNAPS = [0.55, 0.92]; // share of the viewport height

export function Sheet({ title, onClose, closeLabel, children }: { title: string; onClose: () => void; closeLabel: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the open/focus effect on every parent render
  // (the parent passes a new arrow each time, which used to steal focus from the field being typed in).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const [snap, setSnap] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; h: number } | null>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, input, select, textarea")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab" && ref.current) {
        const els = [...ref.current.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href]")].filter((el) => !el.hasAttribute("disabled"));
        const i = els.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          els[els.length - 1]?.focus();
        } else if (!e.shiftKey && i === els.length - 1) {
          e.preventDefault();
          els[0]?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prev?.focus?.({ preventScroll: true });
    };
  }, []);

  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, h: SNAPS[snap] * vh };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    setDrag(Math.max(80, Math.min(vh * 0.96, start.current.h - (e.clientY - start.current.y))));
  };
  const onUp = () => {
    if (!start.current || drag === null) {
      start.current = null;
      return;
    }
    const share = drag / vh;
    start.current = null;
    setDrag(null);
    if (share < SNAPS[0] * 0.6) return onClose();
    setSnap(Math.abs(share - SNAPS[0]) < Math.abs(share - SNAPS[1]) ? 0 : 1);
  };

  return (
    <div className="scrim sheet-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        data-dragging={drag !== null || undefined}
        style={{ ["--sheet-h" as string]: `${drag ?? SNAPS[snap] * vh}px` }}
      >
        <div className="sheet-handle" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={() => setSnap((s) => 1 - s)} aria-hidden="true">
          <span />
        </div>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="btn btn-icon" onClick={onClose} aria-label={closeLabel}>
            <IconX />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
