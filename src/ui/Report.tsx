"use client";
import type { Report as R } from "../analysis/metrics";
import type { Strings } from "./i18n";

/** Sentence lengths drawn as a pulse line (the brand's living line): flat = machine rhythm, uneven = human. */
export function Rhythm({ lengths, muted, label }: { lengths: number[]; muted?: boolean; label: string }) {
  const shown = lengths.slice(0, 60);
  const max = Math.max(12, ...shown);
  const W = 120, H = 34, pad = 3;
  const pts = (shown.length > 1 ? shown : [shown[0] ?? 0, shown[0] ?? 0]).map((l, i, a) => [
    pad + (i / (a.length - 1)) * (W - pad * 2),
    H - pad - Math.max(0.08, l / max) * (H - pad * 2),
  ]);
  // Catmull-Rom → cubic Bézier, so the line flows instead of zig-zagging.
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1] ?? pts[i], pts[i], pts[i + 1], pts[i + 2] ?? pts[i + 1]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1.map((n) => n.toFixed(1)).join(" ")} ${c2.map((n) => n.toFixed(1)).join(" ")} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const end = pts[pts.length - 1];
  return (
    <svg key={shown.join(",")} className={`rhythm${muted ? " muted" : ""}`} viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
      <path className="rhythm-line" d={d} pathLength={100} />
      {!muted && <circle className="rhythm-dot" cx={end[0]} cy={end[1]} r="2.6" />}
    </svg>
  );
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Delta({ before, after, better }: { before: number; after: number; better: "up" | "down" | "none" }) {
  if (better === "none" || Math.abs(after - before) < 1e-6) return null;
  const good = better === "up" ? after > before : after < before;
  return <span className={good ? "up" : "down"} aria-hidden="true">{after > before ? "↑" : "↓"}</span>;
}

interface Props {
  t: Strings;
  before: R | null;
  after: R | null;
  showAi: boolean;
  onToggleAi: (v: boolean) => void;
}

export function ReportPanel({ t, before, after, showAi, onToggleAi }: Props) {
  const main = after ?? before;
  return (
    <details className="report" open>
      <summary>
        <span style={{ fontWeight: 600 }}>{t.naturalness}</span>
        {before && <Rhythm lengths={before.lengths} muted={!!after} label={`${t.rhythm} — ${t.before}`} />}
        {after && <Rhythm lengths={after.lengths} label={`${t.rhythm} — ${t.after}`} />}
        <span className="help hide-sm" style={{ marginInlineStart: "auto", marginTop: 0 }}>{t.reportNote}</span>
      </summary>
      {!main ? (
        <p className="help" style={{ padding: "0 16px 16px", margin: 0 }}>{t.emptyReport}</p>
      ) : (
        <div className="report-grid">
          <Metric
            t={t}
            title={t.variety}
            sub={t.rhythmHelp}
            b={before && `${before.burstiness.toFixed(2)}`}
            a={after && `${after.burstiness.toFixed(2)}`}
            delta={before && after ? <Delta before={before.burstiness} after={after.burstiness} better="up" /> : null}
          />
          <Metric
            t={t}
            title={t.avgSentence}
            sub={`± ${(main.sdLen || 0).toFixed(1)} ${t.wordsPerSentence}`}
            b={before && `${before.meanLen.toFixed(1)}`}
            a={after && `${after.meanLen.toFixed(1)}`}
          />
          <div className="metric">
            <h4>{t.aiPhrases}</h4>
            <div className="vals">
              {before && after && <span className="v before">{before.aiHits.length}</span>}
              <span className="v">{main.aiHits.length}</span>
              {before && after && <Delta before={before.aiHits.length} after={after.aiHits.length} better="down" />}
            </div>
            {main.aiHits.length > 0 && (
              <>
                <div className="chips" style={{ marginTop: 6 }}>
                  {[...new Set(main.aiHits.map((h) => h.text.toLowerCase()))].slice(0, 8).map((p) => (
                    <span className="chip ai" key={p}>{p}</span>
                  ))}
                </div>
                <label className="check help" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={showAi} onChange={(e) => onToggleAi(e.target.checked)} />
                  {t.highlight}
                </label>
              </>
            )}
          </div>
          <div className="metric">
            <h4>{t.openers}</h4>
            {main.openers.length ? (
              <div className="chips">
                {main.openers.map((o) => (
                  <span className="chip" key={o.word} dir="auto">{o.word} ×{o.count}</span>
                ))}
              </div>
            ) : (
              <div className="v" style={{ fontSize: 14, color: "var(--ink-3)" }}>{t.none}</div>
            )}
          </div>
          {main.passiveRatio !== null && (
            <Metric
              t={t}
              title={t.passive}
              b={before?.passiveRatio != null ? pct(before.passiveRatio) : null}
              a={after?.passiveRatio != null ? pct(after.passiveRatio) : null}
            />
          )}
          {main.readability && (
            <Metric
              t={t}
              title={t.readability}
              sub={`${t[`read_${main.readability.label}` as keyof Strings]}${main.readability.approximate ? ` (${t.approx})` : ""}`}
              b={before?.readability ? String(before.readability.score) : null}
              a={after?.readability ? String(after.readability.score) : null}
            />
          )}
          <Metric
            t={t}
            title={t.diversity}
            b={before && pct(before.diversity)}
            a={after && pct(after.diversity)}
          />
        </div>
      )}
    </details>
  );
}

function Metric({ title, sub, b, a, delta }: { t: Strings; title: string; sub?: string; b: string | null; a: string | null; delta?: React.ReactNode }) {
  return (
    <div className="metric">
      <h4>{title}</h4>
      <div className="vals">
        {b && a && <span className="v before">{b}</span>}
        <span className="v">{a ?? b}</span>
        {delta}
      </div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
