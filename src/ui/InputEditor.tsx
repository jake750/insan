"use client";
import { forwardRef, useRef, type ReactNode } from "react";
import type { AiHit } from "../analysis/metrics";

interface Props {
  value: string;
  onChange: (v: string) => void;
  lang: string;
  placeholder: string;
  hits: AiHit[] | null;
  /** per-sentence AI-likeness heat (null = off) */
  heat?: { start: number; end: number; score: number }[] | null;
  disabled?: boolean;
  label: string;
}

/** Textarea with a mirrored backdrop so stock phrases can be underlined in place. */
export const InputEditor = forwardRef<HTMLTextAreaElement, Props>(function InputEditor(
  { value, onChange, lang, placeholder, hits, disabled, label, heat },
  ref,
) {
  const back = useRef<HTMLDivElement>(null);
  const parts: ReactNode[] = [];
  if (heat?.length) {
    let last = 0;
    heat.forEach((h, i) => {
      parts.push(value.slice(last, h.start));
      const band = h.score <= 30 ? "low" : h.score <= 60 ? "mixed" : "high";
      parts.push(<mark key={i} className="heat" data-heat={band} style={{ ["--heat" as string]: Math.max(0.12, h.score / 100) }}>{value.slice(h.start, h.end)}</mark>);
      last = h.end;
    });
    parts.push(value.slice(last));
  } else if (hits?.length) {
    let last = 0;
    hits.forEach((h, i) => {
      parts.push(value.slice(last, h.start));
      parts.push(<mark key={i}>{value.slice(h.start, h.end)}</mark>);
      last = h.end;
    });
    parts.push(value.slice(last));
  }
  return (
    <div className="editor" data-lang={lang}>
      {hits?.length || heat?.length ? (
        <div className="backdrop" ref={back} dir="auto" aria-hidden="true">
          {parts}
          {"\n"}
        </div>
      ) : null}
      <textarea
        ref={ref}
        dir="auto"
        lang={lang}
        aria-label={label}
        value={value}
        placeholder={placeholder}
        spellCheck
        readOnly={disabled}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (back.current) back.current.scrollTop = e.currentTarget.scrollTop;
        }}
      />
    </div>
  );
});
