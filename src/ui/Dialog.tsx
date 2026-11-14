"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { IconX } from "./Icons";

/** Modal dialog: Escape closes, focus moves in and is restored on close, Tab stays inside. */
export function Dialog({ title, onClose, children, className = "", closeLabel, hideHead }: { title: string; onClose: () => void; children: ReactNode; className?: string; closeLabel: string; hideHead?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("[data-autofocus], input, select, textarea, button:not([data-close])");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
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
  }, [onClose]);
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
