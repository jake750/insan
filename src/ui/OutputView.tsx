"use client";
import { diffWordsWithSpace } from "diff";
import { memo, useMemo, type ReactNode } from "react";
import { findAiPhrases } from "../analysis/metrics";
import { docText, type Doc } from "../engine/doc";
import type { Lang } from "../engine/types";
import { IconLayers } from "./Icons";

interface Props {
  doc: Doc | null;
  streaming: string | null;
  view: "clean" | "diff";
  input: string;
  lang: Lang;
  activeId: string | null;
  showAi: boolean;
  variantsLabel: string;
  onSeg: (id: string, el: HTMLElement) => void;
  onParaVariants: (p: number, el: HTMLElement) => void;
}

function withAi(text: string, lang: Lang, on: boolean): ReactNode {
  if (!on) return text;
  const hits = findAiPhrases(text, lang);
  if (!hits.length) return text;
  const out: ReactNode[] = [];
  let last = 0;
  hits.forEach((h, i) => {
    out.push(text.slice(last, h.start), <span key={i} className="ai">{text.slice(h.start, h.end)}</span>);
    last = h.end;
  });
  out.push(text.slice(last));
  return out;
}

type Part = { value: string; added?: boolean; removed?: boolean };

/** Merge runs of changes (and the spaces between them) into one "removed → added" hunk, so it reads as phrases. */
function groupDiff(parts: Part[]): Part[] {
  const out: Part[] = [];
  let del = "";
  let add = "";
  const flush = () => {
    const lead = (add || del).match(/^\s+/)?.[0];
    if ((del.trim() || add.trim()) && lead && !/\s$/.test(out[out.length - 1]?.value ?? " ")) out.push({ value: lead });
    if (del.trim()) out.push({ value: del.trim(), removed: true });
    if (del.trim() && add.trim()) out.push({ value: " " });
    if (add.trim()) out.push({ value: add.trim(), added: true });
    const trail = (add || del).match(/\s+$/)?.[0];
    if ((del || add) && trail) out.push({ value: trail });
    del = add = "";
  };
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const between = !p.added && !p.removed && /^\s+$/.test(p.value) && (del || add) && (parts[i + 1]?.added || parts[i + 1]?.removed);
    if (p.removed) del += p.value;
    else if (p.added) add += p.value;
    else if (between) {
      del += p.value;
      add += p.value;
    } else {
      flush();
      out.push(p);
    }
  }
  flush();
  return out;
}

export const OutputView = memo(function OutputView({ doc, streaming, view, input, lang, activeId, showAi, variantsLabel, onSeg, onParaVariants }: Props) {
  const text = useMemo(() => (doc ? docText(doc) : ""), [doc]);
  const diff = useMemo(() => (view === "diff" && doc ? groupDiff(diffWordsWithSpace(input, text)) : null), [view, doc, input, text]);

  if (streaming !== null) {
    return (
      <div className="prose-text" dir="auto" data-lang={lang} aria-live="polite" aria-busy="true">
        {streaming}
        <span className="caret" />
      </div>
    );
  }
  if (!doc) return null;

  if (diff) {
    return (
      <div className="prose-text" dir="auto" data-lang={lang}>
        {diff.map((part, i) =>
          part.added ? (
            <span key={i} className="d-add">{part.value}</span>
          ) : part.removed ? (
            <span key={i} className="d-del">{part.value}</span>
          ) : (
            <span key={i}>{part.value}</span>
          ),
        )}
      </div>
    );
  }

  return (
    <div className="prose-text" dir="auto" data-lang={lang} style={{ whiteSpace: "normal" }}>
      {doc.map((para, p) => (
        <div className="para" key={p} dir="auto">
          {para.map((s, i) => (
            <span key={s.id}>
              <span
                className="seg"
                role="button"
                tabIndex={0}
                data-seg={s.id}
                data-status={s.status}
                data-active={activeId === s.id}
                style={{ whiteSpace: "pre-wrap" }}
                onClick={(e) => {
                  if (window.getSelection()?.toString()) return; // let selection → regenerate work
                  onSeg(s.id, e.currentTarget);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSeg(s.id, e.currentTarget);
                  }
                }}
              >
                {withAi(s.text, lang, showAi)}
              </span>
              {i < para.length - 1 ? <span style={{ whiteSpace: "pre-wrap" }}>{s.sep || " "}</span> : null}
            </span>
          ))}
          {para.length > 0 && (
            <span className="para-tools">
              <button
                className="btn btn-icon"
                title={variantsLabel}
                aria-label={variantsLabel}
                onClick={(e) => onParaVariants(p, e.currentTarget)}
              >
                <IconLayers size={16} />
              </button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
});
