// The ensemble: runs every enabled source in parallel and combines what came back.
import { detectLang } from "../engine/text";
import type { Lang, ProviderConfig } from "../engine/types";
import { MIN_WORDS, bandOf, sourceWeight } from "./config";
import { adapterById } from "./external";
import { judge } from "./judge";
import { detectLocal, fold } from "./local";
import type { DetectionResult, HttpPost, SentenceScore, SourceResult } from "./types";

export * from "./types";
export { bandOf, MIN_WORDS, DEFAULT_FLAG_THRESHOLD } from "./config";
export { ADAPTERS } from "./external";

export interface DetectOptions {
  lang?: Lang;
  /** run the LLM judge with this provider */
  llm?: ProviderConfig | null;
  /** external detectors to run, with their credentials */
  external?: { id: string; creds: Record<string, string> }[];
  post?: HttpPost;
  signal?: AbortSignal;
  /** called as each source finishes, so the UI can show partial progress */
  onSource?: (r: SourceResult) => void;
}

/** Weighted mean of the sources that answered; failed ones are skipped and the weights renormalised. */
export function combine(sources: SourceResult[]): number {
  const ok = sources.filter((s) => s.score !== null);
  const w = ok.reduce((a, s) => a + s.weight, 0);
  return w ? Math.round(ok.reduce((a, s) => a + s.score! * s.weight, 0) / w) : 0;
}

/** Match a sentence reported by another source to one of ours by word overlap (works across punctuation/spacing differences). */
function matchIndex(ours: SentenceScore[], text: string): number {
  const toks = (s: string) => new Set(fold(s).match(/[\p{L}\p{N}]+/gu) ?? []);
  const t = toks(text);
  if (!t.size) return -1;
  let best = -1;
  let bestScore = 0.5;
  ours.forEach((s, i) => {
    const o = toks(s.text);
    let inter = 0;
    t.forEach((x) => o.has(x) && inter++);
    const j = inter / Math.max(t.size, o.size);
    if (j > bestScore) {
      bestScore = j;
      best = i;
    }
  });
  return best;
}

/** Blend per-sentence scores from every source onto the local sentence spans. */
export function mergeSentences(local: SentenceScore[], sources: SourceResult[]): SentenceScore[] {
  const acc = local.map((s) => ({ sum: s.score * sourceWeight("local"), w: sourceWeight("local"), reasons: [...s.reasons] }));
  for (const src of sources) {
    if (src.id === "local" || src.score === null || !src.sentences?.length) continue;
    for (const s of src.sentences) {
      const i = matchIndex(local, s.text);
      if (i < 0) continue;
      acc[i].sum += s.score * src.weight;
      acc[i].w += src.weight;
      if (s.reason) acc[i].reasons.unshift({ code: "text", arg: s.reason, source: src.id });
    }
  }
  return local.map((s, i) => ({ ...s, score: Math.round(acc[i].sum / acc[i].w), reasons: acc[i].reasons }));
}

export async function detect(text: string, opts: DetectOptions = {}): Promise<DetectionResult> {
  const lang = opts.lang ?? detectLang(text);
  const t0 = performance.now();
  const local = detectLocal(text, lang);
  const localSrc: SourceResult = { id: "local", score: local.score, weight: sourceWeight("local"), ms: Math.round(performance.now() - t0) };
  opts.onSource?.(localSrc);

  const jobs: Promise<SourceResult>[] = [];
  const timed = async (id: string, fn: () => Promise<{ score: number; sentences?: SourceResult["sentences"] }>): Promise<SourceResult> => {
    const start = performance.now();
    try {
      const r = await fn();
      const res = { id, score: r.score, sentences: r.sentences, weight: sourceWeight(id), ms: Math.round(performance.now() - start) };
      opts.onSource?.(res);
      return res;
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      const res = { id, score: null, weight: sourceWeight(id), error: e instanceof Error ? e.message : String(e), ms: Math.round(performance.now() - start) };
      opts.onSource?.(res);
      return res;
    }
  };

  if (opts.llm && local.sentences.length) {
    const llm = opts.llm;
    jobs.push(timed("llm", () => judge(local.sentences.map((s) => s.text), llm, opts.signal, lang)));
  }
  for (const ext of opts.external ?? []) {
    const a = adapterById(ext.id);
    if (!a) continue;
    const post = opts.post;
    if (!post) continue;
    jobs.push(timed(a.id, () => a.detect(text, ext.creds, post, opts.signal)));
  }

  const sources = [localSrc, ...(await Promise.all(jobs))];
  const score = combine(sources);
  return {
    score,
    band: bandOf(score),
    sources,
    sentences: mergeSentences(local.sentences, sources),
    signals: local.signals,
    words: local.words,
    reliable: local.words >= MIN_WORDS,
    lang,
    partial: sources.some((s) => s.score === null),
  };
}

/** Instant, synchronous local-only result (used while typing and offline). */
export function detectInstant(text: string, lang?: Lang): DetectionResult {
  const local = detectLocal(text, lang);
  const sources: SourceResult[] = [{ id: "local", score: local.score, weight: sourceWeight("local") }];
  return {
    score: local.score,
    band: bandOf(local.score),
    sources,
    sentences: local.sentences,
    signals: local.signals,
    words: local.words,
    reliable: local.words >= MIN_WORDS,
    lang: local.lang,
    partial: false,
  };
}
