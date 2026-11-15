"use client";
// Detailed report drawer: score, sources, each local signal with a bar + meaning + tip, flagged sentences,
// threshold, re-humanize, export. Opens as a side drawer on desktop and a bottom sheet on phones.
import type { DetectionResult, Reason } from "../../detection/types";
import { Sheet } from "../Sheet";
import { fmt, type UILang } from "../i18n";
import { IconDownload, IconSpark } from "../Icons";
import { Gauge } from "./Gauge";
import { SIGNAL_TEXT, type DStrings } from "./strings";

export function reasonText(d: DStrings, r: Reason): string {
  switch (r.code) {
    case "cliche":
      return fmt(d.reason_cliche, { x: r.arg });
    case "transition":
      return fmt(d.reason_transition, { x: r.arg });
    case "hedge":
      return fmt(d.reason_hedge, { x: r.arg });
    case "uniform":
      return d.reason_uniform;
    default:
      return r.arg;
  }
}

interface Props {
  d: DStrings;
  ui: UILang;
  closeLabel: string;
  inRes: DetectionResult | null;
  outRes: DetectionResult | null;
  threshold: number;
  onThreshold: (n: number) => void;
  onRehumanize: (() => void) | null;
  busy: boolean;
  onExport: () => void;
  onClose: () => void;
  onJump: (start: number) => void;
  sourceLabel: (id: string) => string;
}

export function DetectReport({ d, ui, closeLabel, inRes, outRes, threshold, onThreshold, onRehumanize, busy, onExport, onClose, onJump, sourceLabel }: Props) {
  const main = outRes ?? inRes;
  const st = SIGNAL_TEXT[ui];
  const flagged = (main?.sentences ?? []).filter((s) => s.score >= threshold).sort((a, b) => b.score - a.score);
  return (
    <Sheet title={d.reportTitle} onClose={onClose} closeLabel={closeLabel}>
      {!main ? (
        <p className="help">{d.idle}</p>
      ) : (
        <div className="report-sheet">
          <div className="rs-top">
            {inRes && outRes && <Gauge score={inRes.score} band={inRes.band} size={92} label={d.input} bandLabel={d.input} muted />}
            <Gauge score={main.score} band={main.band} size={124} label={outRes ? d.output : d.aiScore} bandLabel={d[`band_${main.band}` as const]} />
            <div className="rs-sum">
              <p className="score-verdict">{d[`verdict_${main.band}` as const]}</p>
              {!main.reliable && <p className="score-note warn">{d.tooShort}</p>}
              <p className="score-disclaimer">{d.disclaimer}</p>
            </div>
          </div>

          <h3 className="section-title">{d.sources}</h3>
          <ul className="rs-sources">
            {main.sources.map((s) => (
              <li key={s.id}>
                <span>{sourceLabel(s.id)}</span>
                {s.score === null ? (
                  <span className="err" title={s.error}>{d.failed}{s.error ? ` · ${s.error}` : ""}</span>
                ) : (
                  <span className="meter" style={{ ["--v" as string]: s.score / 100 }} data-band={s.score <= 30 ? "low" : s.score <= 60 ? "mixed" : "high"}>
                    <i />
                    <b dir="ltr">{s.score}%</b>
                  </span>
                )}
              </li>
            ))}
          </ul>

          <h3 className="section-title">{d.signals}</h3>
          <ul className="rs-signals">
            {main.signals.map((sig) => (
              <li key={sig.id} data-unused={!sig.used || undefined}>
                <div className="rs-sig-head">
                  <span className="name">{st[sig.id].name}</span>
                  {sig.used ? (
                    <span className="meter" style={{ ["--v" as string]: sig.value }} data-band={sig.value <= 0.3 ? "low" : sig.value <= 0.6 ? "mixed" : "high"} aria-label={`${Math.round(sig.value * 100)}%`}>
                      <i />
                      <b dir="ltr">{Math.round(sig.value * 100)}%</b>
                    </span>
                  ) : (
                    <span className="muted">{d.notEnough}</span>
                  )}
                </div>
                <p className="help">{st[sig.id].meaning}</p>
                {sig.used && sig.value > 0.45 && <p className="tip">{st[sig.id].tip}</p>}
              </li>
            ))}
          </ul>

          <h3 className="section-title">{d.flagged}</h3>
          <label className="rs-threshold">
            <span>{d.threshold}</span>
            <input type="range" min={30} max={90} step={5} value={threshold} onChange={(e) => onThreshold(Number(e.target.value))} aria-valuetext={`${threshold}%`} />
            <b dir="ltr">{threshold}%</b>
          </label>
          {flagged.length === 0 ? (
            <p className="help">{d.noFlagged}</p>
          ) : (
            <ol className="rs-flagged">
              {flagged.slice(0, 12).map((s) => (
                <li key={s.start}>
                  <button className="rs-sent" dir="auto" onClick={() => onJump(s.start)} data-band={s.score <= 30 ? "low" : s.score <= 60 ? "mixed" : "high"}>
                    <b dir="ltr">{s.score}%</b> {s.text}
                  </button>
                  {s.reasons.length > 0 && <p className="help">{s.reasons.slice(0, 3).map((r) => reasonText(d, r)).join(" · ")}</p>}
                </li>
              ))}
            </ol>
          )}
          <div className="rs-actions">
            {onRehumanize && (
              <button className="btn btn-primary" onClick={onRehumanize} disabled={busy || flagged.length === 0}>
                <IconSpark size={16} /> {d.rehumanize}
              </button>
            )}
            <button className="btn btn-line" onClick={onExport}>
              <IconDownload size={16} /> {d.exportReport}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
