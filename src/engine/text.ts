// Language detection, protected items, and paragraph-aware chunking.
import type { Lang } from "./types";

/* ---------------- language ---------------- */

const FR_WORDS = new Set("le la les des est une et que pour dans avec sur pas qui ce du au aux sont nous vous mais leur cette ces être fait plus comme".split(" "));
const EN_WORDS = new Set("the and is of to in that for with it are this be on as by was have from or an they which you not".split(" "));

export function detectLang(text: string): Lang {
  const sample = text.slice(0, 5000);
  const arabic = (sample.match(/[؀-ۿݐ-ݿ]/g) ?? []).length;
  const latin = (sample.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  if (arabic > latin * 0.5) return "ar";
  let fr = 0;
  let en = 0;
  for (const w of sample.toLowerCase().split(/[^a-zà-ÿœæ']+/)) {
    if (FR_WORDS.has(w)) fr++;
    if (EN_WORDS.has(w)) en++;
  }
  fr += (sample.match(/[éèêàçùûôœ]/gi) ?? []).length * 0.3;
  return fr > en ? "fr" : "en";
}

export const isRTL = (lang: Lang) => lang === "ar";

/* ---------------- protection ---------------- */

/**
 * Items that are swapped for opaque placeholders before the model sees the text.
 * These can never be "rewritten" because the model never sees their content.
 */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /```[\s\S]*?```/g, // fenced code
  /`[^`\n]+`/g, // inline code
  /\bhttps?:\/\/[^\s)<>\]]+/g, // URLs
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, // emails
  /\[\d+(?:[,–-]\s*\d+)*\]/g, // numeric citations [1], [2-4]
  /\((?:[A-Z][A-Za-z'’-]+(?: et al\.)?(?:,? (?:&|and) [A-Z][A-Za-z'’-]+)?),? \d{4}[a-z]?(?:, p+\. ?\d+(?:[–-]\d+)?)?\)/g, // (Smith, 2020)
];

export interface Protected {
  text: string;
  map: Map<string, string>; // placeholder → original
}

export function protect(text: string, locked: string[]): Protected {
  const map = new Map<string, string>();
  let i = 0;
  let out = text;
  const swap = (m: string) => {
    const key = `⟦P${i++}⟧`;
    map.set(key, m);
    return key;
  };
  for (const re of PLACEHOLDER_PATTERNS) out = out.replace(re, swap);
  // Locked phrases that contain no letters a model could "improve" (codes, IDs) also become placeholders.
  for (const l of locked) {
    if (!l.trim() || /\p{L}{3,}/u.test(l)) continue;
    out = out.split(l).join(swap(l));
  }
  return { text: out, map };
}

export function unprotect(text: string, map: Map<string, string>): string {
  let out = text;
  for (const [k, v] of map) out = out.split(k).join(v);
  return out;
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export const normDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));

/** Strings the rewrite must contain verbatim: numbers, quotes, locked terms. Placeholders are checked separately. */
export function mustKeep(text: string, extra: string[]): string[] {
  const items = new Set<string>();
  for (const m of normDigits(text).matchAll(/\d+(?:[.,:/]\d+)*\s?%?/g)) items.add(m[0].trim());
  for (const m of text.matchAll(/«\s?([^»]{2,200}?)\s?»|“([^”]{2,200})”|"([^"\n]{2,200})"/g)) {
    const q = (m[1] ?? m[2] ?? m[3]).trim();
    if (q.split(/\s+/).length >= 3) items.add(q); // only real quotations, not "scare quotes"
  }
  for (const e of extra) if (e.trim() && text.includes(e.trim())) items.add(e.trim());
  return [...items];
}

/** Which must-keep items are missing from the rewrite (digits normalised, whitespace-insensitive). */
export function missingItems(rewrite: string, items: string[], placeholders: string[]): string[] {
  const hay = normDigits(rewrite).replace(/\s+/g, " ");
  const missing: string[] = [];
  for (const p of placeholders) if (!rewrite.includes(p)) missing.push(p);
  for (const it of items) {
    const needle = normDigits(it).replace(/\s+/g, " ");
    if (/^\d/.test(needle)) {
      // numbers: accept 1,000 / 1 000 / 1000, "45 %" / "45%" / "45 ٪" (any spacing, incl. narrow no-break space)
      const numNorm = (s: string) => s.replace(/٪/g, "%").replace(/(\d)[,٬](?=\d{3})/g, "$1").replace(/\s+/g, "");
      if (!numNorm(hay).includes(numNorm(needle))) missing.push(it);
    } else if (!hay.includes(needle)) missing.push(it);
  }
  return missing;
}

/* ---------------- chunking ---------------- */

/** Split into blocks on blank lines, keeping fenced code blocks whole. */
export function splitBlocks(text: string): string[] {
  const blocks: string[] = [];
  let buf: string[] = [];
  let inFence = false;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "") {
      if (buf.length) blocks.push(buf.join("\n"));
      buf = [];
    } else buf.push(line);
  }
  if (buf.length) blocks.push(buf.join("\n"));
  return blocks;
}

export const wordCount = (s: string) => (s.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

/**
 * Group blocks into chunks of at most `maxWords`. A heading always travels with the block after it,
 * so the model sees the heading's context.
 */
export function chunkBlocks(blocks: string[], maxWords: number): string[][] {
  const chunks: string[][] = [];
  let cur: string[] = [];
  let words = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const w = wordCount(b);
    const isHeading = /^#{1,6}\s/.test(b.trim());
    if (cur.length && words + w > maxWords && !(cur.length && /^#{1,6}\s/.test(cur[cur.length - 1].trim()))) {
      chunks.push(cur);
      cur = [];
      words = 0;
    }
    cur.push(b);
    words += w;
    if (isHeading) continue;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/** Blocks the model should not touch at all (pure code, pure placeholder, tables of numbers). */
export const isPassthrough = (block: string) =>
  /^\s*```[\s\S]*```\s*$/.test(block) || /^\s*(⟦P\d+⟧\s*)+$/.test(block) || /^\s*(-{3,}|\*{3,})\s*$/.test(block);
