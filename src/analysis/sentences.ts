// Sentence segmentation shared by the analysis and the editor (EN / FR / AR).

const ABBR = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|cf|al|Fig|No|p|pp|vol|Inc|Ltd|Co|M|Mme|Mlle|av|env|art|chap|n°)\.$/i;

export interface Span {
  text: string;
  start: number;
  end: number;
}

/** Split a paragraph into sentences, keeping trailing whitespace out of each span. */
export function splitSentences(par: string): Span[] {
  const spans: Span[] = [];
  const re = /[^.!?…؟。\n]+(?:[.!?…؟。]+["'”’»)\]]*|\n|$)/g;
  let m: RegExpExecArray | null;
  let pending: { start: number; text: string } | null = null;
  while ((m = re.exec(par))) {
    if (m[0] === "") {
      re.lastIndex++;
      continue;
    }
    const raw = m[0];
    const start: number = pending ? pending.start : m.index;
    const text: string = (pending ? pending.text : "") + raw;
    const trimmedEnd = text.replace(/\s+$/, "");
    // don't split after abbreviations, single initials, or decimals like 3.5
    const next = par.slice(m.index + raw.length, m.index + raw.length + 2);
    if ((ABBR.test(trimmedEnd) || /\b\p{Lu}\.$/u.test(trimmedEnd) || (/\d\.$/.test(trimmedEnd) && /^\d/.test(next))) && m.index + raw.length < par.length) {
      pending = { start, text };
      continue;
    }
    pending = null;
    const lead = text.length - text.replace(/^\s+/, "").length;
    const t = text.trim();
    if (t) spans.push({ text: t, start: start + lead, end: start + lead + t.length });
  }
  if (pending && pending.text.trim()) {
    const lead = pending.text.length - pending.text.replace(/^\s+/, "").length;
    spans.push({ text: pending.text.trim(), start: pending.start + lead, end: pending.start + lead + pending.text.trim().length });
  }
  return spans;
}

export const splitParagraphs = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

export const words = (s: string) => s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
