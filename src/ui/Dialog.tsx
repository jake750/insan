"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { IconX } from "./Icons";

/** Modal dialog: Escape closes, focus moves in and is restored on close, Tab stays inside. */
export function Dialog({ title, onClose, children, className = "", closeLabel, hideHead }: { title: string; onClose: () => void; children: ReactNode; className?: string; closeLabel: string; hideHead?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the open/focus effect on every parent render
  // (the parent passes a new arrow each time, which used to steal focus from the field being typed in).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("[data-autofocus], input, select, textarea, button:not([data-close])");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab" && ref.current) {
        const els = [...ref.current.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])")].filter((el) => !el.hasAttribute("disabled"));
        if (!els.length) return;
        const i = els.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          els[els.length - 1].focus();
        } else if (!e.shiftKey && i === els.length - 1) {
          e.preventDefault();
          els[0].focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${className}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        {!hideHead && (
          <div className="dialog-head">
            <h2>{title}</h2>
            <button className="btn btn-icon" data-close onClick={onClose} aria-label={closeLabel}>
              <IconX />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
