// Local statistical detector: runs in the browser, offline, nothing leaves the device.
import { findAiPhrases } from "../analysis/metrics";
import { splitSentences, words } from "../analysis/sentences";
import { detectLang } from "../engine/text";
import type { Lang } from "../engine/types";
import { HEDGES, SENTENCE_LOCAL_MIX, SIGNALS, TRANSITIONS } from "./config";
import type { Reason, SentenceScore, SignalId, SignalScore } from "./types";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const norm = (id: SignalId, raw: number) => {
  const { human, ai } = SIGNALS[id];
  return clamp01((raw - human) / (ai - human));
};
const cv = (xs: number[]) => {
  if (!xs.length) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (!m) return 0;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) / m;
};

/** Lower-case, unify Arabic letter forms and strip diacritics/tatweel so list matching is robust. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[’`]/g, "'");
}

const startsWithAny = (sentence: string, list: string[]) => {
  const s = fold(sentence).replace(/^[\s"«“'(\-–—]+/, "");
  return list.find((p) => {
    const f = fold(p);
    if (!s.startsWith(f)) return false;
    const next = s.charAt(f.length);
    return !next || !/[\p{L}\p{N}]/u.test(next);
  });
};
const containsAll = (sentence: string, list: string[]) => {
  const s = ` ${fold(sentence)} `;
  return list.filter((p) => new RegExp(`(?<![\\p{L}\\p{N}])${fold(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u").test(s));
};

interface Sent {
  text: string;
  start: number;
  end: number;
  words: number;
  para: number;
}

/** Sentences with offsets into the full text (paragraph-aware, RTL-safe: works on logical order). */
export function sentencesOf(text: string): Sent[] {
  const out: Sent[] = [];
  const re = /\S[\s\S]*?(?=\n\s*\n|$)/g; // paragraphs, keeping offsets
  let m: RegExpExecArray | null;
  let p = 0;
  while ((m = re.exec(text))) {
    for (const s of splitSentences(m[0])) {
      const w = words(s.text).length;
      if (w) out.push({ text: s.text, start: m.index + s.start, end: m.index + s.end, words: w, para: p });
    }
    p++;
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  return out;
}

const EXPRESSIVE = /[—–;:()?!…"“”«»؛؟]|\.\.\./g; // includes the Arabic semicolon and question mark

export interface LocalResult {
  score: number;
  signals: SignalScore[];
  sentences: SentenceScore[];
  words: number;
  lang: Lang;
}

export function detectLocal(text: string, langHint?: Lang): LocalResult {
  const lang = langHint ?? detectLang(text);
  const sents = sentencesOf(text);
  const allWords = words(text);
  const nw = allWords.length || 1;
  const ns = sents.length || 1;
  const paraLens = new Map<number, number>();
  sents.forEach((s) => paraLens.set(s.para, (paraLens.get(s.para) ?? 0) + s.words));

  // per-sentence evidence
  const firstWords = sents.map((s) => fold(words(s.text)[0] ?? "").replace(/^[وف](?=\p{L}{3,})/u, ""));
  const firstCount = new Map<string, number>();
  firstWords.forEach((w) => w && firstCount.set(w, (firstCount.get(w) ?? 0) + 1));
  const cliches = sents.map((s) => findAiPhrases(s.text, lang).map((h) => h.text));
  const transitions = sents.map((s) => startsWithAny(s.text, TRANSITIONS[lang]));
  const hedges = sents.map((s) => containsAll(s.text, HEDGES[lang]));

  const lengths = sents.map((s) => s.words);
  const mattr = (() => {
    const lw = allWords.map((w) => fold(w));
    if (!lw.length) return 0;
    const win = Math.min(50, lw.length);
    let total = 0;
    let count = 0;
    for (let i = 0; i + win <= lw.length; i += Math.max(1, Math.floor(win / 5))) {
      total += new Set(lw.slice(i, i + win)).size / win;
      count++;
    }
    return count ? total / count : 0;
  })();

  const raw: Record<SignalId, number> = {
    burstiness: cv(lengths),
    diversity: mattr,
    openers: sents.length ? firstWords.filter((w) => w && (firstCount.get(w) ?? 0) > 1).length / ns : 0,
    cliches: (cliches.reduce((a, c) => a + c.length, 0) / nw) * 100,
    transitions: transitions.filter(Boolean).length / ns,
    punctuation: ((text.match(EXPRESSIVE) ?? []).length / nw) * 100,
    paragraphs: cv([...paraLens.values()]),
    hedging: hedges.reduce((a, h) => a + h.length, 0) / ns,
  };

  const signals: SignalScore[] = (Object.keys(SIGNALS) as SignalId[]).map((id) => {
    const units = id === "paragraphs" ? paraLens.size : sents.length;
    const used = units >= SIGNALS[id].minUnits && allWords.length >= 12;
    return { id, raw: raw[id], value: norm(id, raw[id]), weight: SIGNALS[id].weight, used };
  });
  const usedW = signals.filter((s) => s.used).reduce((a, s) => a + s.weight, 0);
  const docScore = usedW ? (signals.filter((s) => s.used).reduce((a, s) => a + s.value * s.weight, 0) / usedW) * 100 : 0;

  // sentence heat: document prior + the sentence's own evidence
  const meanLen = lengths.reduce((a, b) => a + b, 0) / ns;
  const sentences: SentenceScore[] = sents.map((s, i) => {
    const reasons: Reason[] = [];
    let ev = 0;
    for (const c of cliches[i]) {
      reasons.push({ code: "cliche", arg: c });
      ev += 0.45;
    }
    if (transitions[i]) {
      reasons.push({ code: "transition", arg: transitions[i]! });
      ev += 0.35;
    }
    for (const h of hedges[i]) {
      reasons.push({ code: "hedge", arg: h });
      ev += 0.2;
    }
    // a run of near-average sentences is the "even" chatbot rhythm
    const evenNeighbour = [sents[i - 1], sents[i + 1]].filter(Boolean).every((n) => Math.abs(n!.words - meanLen) / (meanLen || 1) < 0.25);
    if (sents.length >= 4 && Math.abs(s.words - meanLen) / (meanLen || 1) < 0.2 && evenNeighbour) {
      reasons.push({ code: "uniform" });
      ev += 0.15;
    }
    const own = clamp01(ev) * 100;
    const score = Math.round((1 - SENTENCE_LOCAL_MIX) * docScore + SENTENCE_LOCAL_MIX * Math.max(own, docScore * 0.6));
    return { start: s.start, end: s.end, text: s.text, score: Math.max(0, Math.min(100, score)), reasons };
  });

  return { score: Math.round(docScore), signals, sentences, words: allWords.length, lang };
}
