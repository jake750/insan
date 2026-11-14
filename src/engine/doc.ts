// Output document model: paragraphs of sentence segments, each aligned to the original
// sentence(s) it came from, so the user can accept / reject / regenerate one sentence at a time.
import { splitParagraphs, splitSentences, words, type Span } from "../analysis/sentences";

export type SegStatus = "pending" | "accepted" | "rejected" | "edited";

export interface Seg {
  id: string;
  text: string;
  /** Original sentence(s) this segment was rewritten from ("" if newly written). */
  orig: string;
  /** Whitespace that follows this segment inside its paragraph (space, newline for list items…). */
  sep: string;
  status: SegStatus;
}

export type Doc = Seg[][];

let uid = 0;
const nid = () => `s${Date.now().toString(36)}${(uid++).toString(36)}`;

const bag = (s: string) => new Set(words(s.toLowerCase()).filter((w) => w.length > 2));
function sim(a: string, b: string): number {
  const A = bag(a);
  const B = bag(b);
  if (!A.size || !B.size) return a.trim() === b.trim() ? 1 : 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  // also reward shared character trigrams so paraphrases in Arabic (rich morphology) still align
  const tri = (s: string) => {
    const t = new Set<string>();
    const c = s.toLowerCase().replace(/\s+/g, " ");
    for (let i = 0; i < c.length - 2; i++) t.add(c.slice(i, i + 3));
    return t;
  };
  const TA = tri(a);
  const TB = tri(b);
  let ti = 0;
  for (const t of TA) if (TB.has(t)) ti++;
  return 0.5 * (inter / Math.min(A.size, B.size)) + 0.5 * (ti / Math.max(1, Math.min(TA.size, TB.size)));
}

interface OutSent extends Span {
  para: number;
}

/**
 * Monotone alignment with 1-1, 1-2, 2-1, 1-0 and 0-1 moves (Gale–Church style DP on similarity).
 * Returns, for each group of output sentences, the original text it maps to.
 */
function align(orig: string[], out: OutSent[]): { outIdx: number[]; orig: string }[] {
  const n = orig.length;
  const m = out.length;
  const INF = 1e9;
  const cost: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(INF));
  const back: [number, number][][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill([0, 0]));
  cost[0][0] = 0;
  const SKIP = 0.9;
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= m; j++) {
      const c = cost[i][j];
      if (c >= INF) continue;
      const relax = (di: number, dj: number, add: number) => {
        const a = i + di;
        const b = j + dj;
        if (a > n || b > m) return;
        if (c + add < cost[a][b]) {
          cost[a][b] = c + add;
          back[a][b] = [di, dj];
        }
      };
      if (i < n && j < m) relax(1, 1, 1 - sim(orig[i], out[j].text));
      if (i < n && j + 1 < m && out[j].para === out[j + 1].para) relax(1, 2, 2.15 - 2 * sim(orig[i], out[j].text + " " + out[j + 1].text));
      if (i + 1 < n && j < m) relax(2, 1, 2.15 - 2 * sim(orig[i] + " " + orig[i + 1], out[j].text));
      if (i < n) relax(1, 0, SKIP);
      if (j < m) relax(0, 1, SKIP);
    }
  const groups: { outIdx: number[]; orig: string }[] = [];
  let i = n;
  let j = m;
  const pendingOrig: string[] = [];
  while (i > 0 || j > 0) {
    const [di, dj] = back[i][j];
    if (di === 0 && dj === 0) break;
    const o = orig.slice(i - di, i).join(" ");
    if (dj === 0) {
      // original sentence dropped: attach it to the next group so reject restores it
      pendingOrig.unshift(o);
    } else {
      const idx = Array.from({ length: dj }, (_, k) => j - dj + k);
      groups.unshift({ outIdx: idx, orig: o });
    }
    i -= di;
    j -= dj;
  }
  if (pendingOrig.length) {
    if (groups.length) groups[0].orig = (pendingOrig.join(" ") + " " + groups[0].orig).trim();
  }
  return groups;
}

/** Build the segment document from original + rewritten text. */
export function buildDoc(original: string, rewritten: string): Doc {
  const origSents = splitParagraphs(original).flatMap((p) => splitSentences(p).map((s) => s.text));
  const outParas = splitParagraphs(rewritten);
  const outSents: OutSent[] = [];
  const parSpans = outParas.map((p, pi) => {
    const sp = splitSentences(p);
    sp.forEach((s) => outSents.push({ ...s, para: pi }));
    return sp;
  });
  const groups = align(origSents, outSents);
  const groupOf = new Map<number, number>();
  groups.forEach((g, gi) => g.outIdx.forEach((k) => groupOf.set(k, gi)));

  const doc: Doc = outParas.map(() => []);
  let k = 0;
  outParas.forEach((par, pi) => {
    const spans = parSpans[pi];
    let si = 0;
    while (si < spans.length) {
      const gi = groupOf.get(k);
      const g = gi !== undefined ? groups[gi] : null;
      const size = g ? g.outIdx.filter((x) => outSents[x].para === pi).length : 1;
      const first = spans[si];
      const last = spans[si + size - 1] ?? first;
      const nextStart = spans[si + size]?.start ?? par.length;
      doc[pi].push({
        id: nid(),
        text: par.slice(first.start, last.end),
        orig: g?.orig ?? "",
        sep: par.slice(last.end, nextStart) || (si + size < spans.length ? " " : ""),
        status: "pending",
      });
      si += size;
      k += size;
    }
  });
  return doc;
}

export function docText(doc: Doc): string {
  return doc
    .map((p) => p.map((s, i) => s.text + (i < p.length - 1 ? s.sep || " " : "")).join(""))
    .filter((p) => p.trim())
    .join("\n\n");
}

export function updateSeg(doc: Doc, id: string, patch: Partial<Seg>): Doc {
  return doc.map((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

export function findSeg(doc: Doc, id: string): { p: number; i: number; seg: Seg } | null {
  for (let p = 0; p < doc.length; p++) {
    const i = doc[p].findIndex((s) => s.id === id);
    if (i >= 0) return { p, i, seg: doc[p][i] };
  }
  return null;
}

/** Replace a whole paragraph's text (paragraph variants), re-segmenting it against its originals. */
export function replaceParagraph(doc: Doc, p: number, text: string): Doc {
  const orig = doc[p].map((s) => s.orig).filter(Boolean).join(" ");
  const fresh = buildDoc(orig || text, text)[0] ?? [];
  return doc.map((para, i) => (i === p ? fresh : para));
}
