"use client";
// The AI-score card: one big gauge (output when there is one, input otherwise), the before → after line,
// the sources that answered, every state, and the always-visible disclaimer.
import type { DetectionResult } from "../../detection/types";
import { fmt, type UILang } from "../i18n";
import { IconAlert, IconCheck, IconReport, IconScan } from "../Icons";
import { Gauge } from "./Gauge";
import type { DStrings } from "./strings";

interface Props {
  d: DStrings;
  ui: UILang;
  inRes: DetectionResult | null;
  outRes: DetectionResult | null;
  checking: boolean;
  error: string | null;
  canCheck: boolean;
  onCheck: () => void;
  onReport: () => void;
  sourceLabel: (id: string) => string;
}

export function ScoreCard({ d, inRes, outRes, checking, error, canCheck, onCheck, onReport, sourceLabel }: Props) {
  const main = outRes ?? inRes;
  const band = main ? (d[`band_${main.band}` as const] as string) : undefined;
  const failed = main?.sources.filter((s) => s.score === null) ?? [];
  const delta = inRes && outRes ? outRes.score - inRes.score : null;
  return (
    <section className="score-card" aria-label={d.aiScore} aria-busy={checking}>
      {inRes && outRes ? (
        <div className="score-rings" dir="ltr">
          <figure>
            <Gauge score={inRes.score} band={inRes.band} size={104} label={d.input} bandLabel={d[`band_${inRes.band}` as const]} muted={!inRes.reliable} />
            <figcaption>{d.input}</figcaption>
          </figure>
          <div className="score-arrow" aria-hidden={delta === 0 || undefined}>
            <span aria-hidden="true">→</span>
            {delta !== null && delta !== 0 && (
              <span className="score-move" data-dir={delta < 0 ? "down" : "up"} aria-label={fmt(d.points, { n: delta })}>
                {delta < 0 ? "↓" : "↑"} {Math.abs(delta)}
              </span>
            )}
          </div>
          <figure>
            <Gauge score={outRes.score} band={outRes.band} size={104} label={d.output} bandLabel={band} muted={!outRes.reliable} />
            <figcaption>{d.output}</figcaption>
          </figure>
        </div>
      ) : (
        <Gauge score={main ? main.score : null} band={main?.band ?? null} label={d.aiScore} bandLabel={band} loading={checking && !main} muted={!!main && !main.reliable} />
      )}
      <div className="score-body">
        <h2 className="score-title">{d.aiLikeness}</h2>
        {!main ? (
          <p className="score-verdict muted">{d.idle}</p>
        ) : (
          <>
            <p className="score-verdict">{d[`verdict_${main.band}` as const]}</p>
            <ul className="score-sources" aria-label={d.sources}>
              {main.sources.map((s) => (
                <li key={s.id} data-failed={s.score === null || undefined} title={s.error}>
                  {s.score === null ? <IconAlert size={13} /> : <IconCheck size={13} />}
                  {sourceLabel(s.id)}
                  <span className="num">{s.score === null ? d.failed : `${s.score}%`}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {main && !main.reliable && <p className="score-note warn" role="note"><IconAlert size={14} /> {d.tooShort}</p>}
        {failed.length > 0 && <p className="score-note warn" role="status"><IconAlert size={14} /> {fmt(d.partial, { list: failed.map((f) => sourceLabel(f.id)).join(", ") })}</p>}
        {error && <p className="score-note err" role="alert"><IconAlert size={14} /> {fmt(d.error, { m: error })}</p>}
        <p className="score-disclaimer">{d.disclaimer}</p>
      </div>
      <div className="score-actions">
        <button className="btn btn-line" onClick={onCheck} disabled={!canCheck || checking}>
          <IconScan size={16} /> {checking ? d.checking : main && main.sources.length > 1 ? d.recheck : d.checkAi}
        </button>
        <button className="btn" onClick={onReport} disabled={!main}>
          <IconReport size={16} /> {d.report}
        </button>
      </div>
    </section>
  );
}

/** Compact pill for phones: tap to open the full report sheet. */
export function ScorePill({ d, inRes, outRes, checking, onOpen }: { d: DStrings; inRes: DetectionResult | null; outRes: DetectionResult | null; checking: boolean; onOpen: () => void }) {
  const main = outRes ?? inRes;
  return (
    <button className="score-pill" onClick={onOpen} data-band={main?.band ?? "none"} aria-label={main ? `${d.aiScore}: ${main.score}%${main.reliable ? "" : ` (${d.tooShort})`}` : d.aiScore} title={main && !main.reliable ? d.tooShort : undefined} disabled={!main && !checking}>
      <MiniRing value={main && !checking ? main.score : null} />
      <span>{d.aiScore}</span>
      {checking ? <span className="gauge-skel small" /> : main && !main.reliable && !main.signals.some((x) => x.used) ? <b>–</b> : main ? (
        <b dir="ltr">
          {inRes && outRes ? <>{inRes.score}% → {outRes.score}%</> : `${main.score}%`}
        </b>
      ) : <b>–</b>}
      {main && !main.reliable && <IconAlert size={14} />}
    </button>
  );
}

/** 22 px ring for the phone pill: the arc length is the score, the colour is the band. */
function MiniRing({ value }: { value: number | null }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <svg className="mini-ring" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r={r} fill="none" strokeWidth="3" className="gauge-track" />
      {value !== null && (
        <circle cx="11" cy="11" r={r} fill="none" strokeWidth="3" className="mini-fill" strokeLinecap="round" strokeDasharray={`${Math.max(0.001, (value / 100) * c)} ${c}`} transform="rotate(-90 11 11)" />
      )}
    </svg>
  );
}
