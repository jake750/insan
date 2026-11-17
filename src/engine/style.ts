// Local style check run on every rewritten chunk. It names the exact leftovers a model missed
// (stock phrases, stock connectors, flat sentence rhythm, repeated openers) so the polish pass
// can fix them one by one. Concrete feedback works far better than a long "avoid" list,
// especially for small local models.
import { findAiPhrases } from "../analysis/metrics";
import { splitParagraphs, splitSentences, words } from "../analysis/sentences";
import type { Lang } from "./types";

/** Connectors that read as machine-written when they open a sentence. Natural ones (but, however, لكن) are not here. */
const STOCK_OPENERS: Record<Lang, string[]> = {
  en: ["moreover", "furthermore", "additionally", "in addition", "in conclusion", "in summary", "overall", "ultimately", "notably", "importantly", "in essence", "consequently"],
  fr: ["de plus", "en outre", "par ailleurs", "en conclusion", "en somme", "en définitive", "de surcroît", "ainsi", "dès lors"],
  ar: ["بالإضافة إلى ذلك", "علاوة على ذلك", "فضلاً عن ذلك", "فضلا عن ذلك", "إضافة إلى ذلك", "ختاماً", "ختاما", "في الختام", "وفي الختام", "وختاماً", "ومن ناحية أخرى", "وبالتالي"],
};

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي");

const stockOpener = (sentence: string, lang: Lang) => {
  const s = fold(sentence.replace(/^[\s"«“'(\-–—]+/, ""));
  return STOCK_OPENERS[lang].find((p) => {
    const f = fold(p);
    return s.startsWith(f) && !/[\p{L}\p{N}]/u.test(s.charAt(f.length));
  });
};

const firstWord = (s: string) => fold(words(s)[0] ?? "");

const cv = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return m ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) / m : 0;
};

export interface StyleReport {
  /** One concrete instruction per problem, ready to hand to the model. */
  issues: string[];
  /** Rough weight used to decide whether a polished version is actually better. */
  weight: number;
}

const short = (s: string) => (s.length > 70 ? `${s.slice(0, 67)}…` : s);

/** Find the machine-writing tells that survived a rewrite. Pure and fast; no network. */
export function styleIssues(text: string, lang: Lang): StyleReport {
  const issues: string[] = [];
  let weight = 0;

  // 1. stock phrases, each named once
  const phrases = [...new Set(findAiPhrases(text, lang).map((h) => h.text.trim().replace(/[,،]$/, "")))];
  if (phrases.length) {
    issues.push(`Replace these stock phrases with plain, specific wording (or cut them): ${phrases.map((p) => `"${p}"`).join(", ")}.`);
    weight += phrases.length * 2;
  }

  const paras = splitParagraphs(text).filter((p) => !/^(#|```|\||>|[-*+] |\d+[.)] )/.test(p));
  const sents = paras.flatMap((p) => splitSentences(p).map((s) => s.text)).filter((s) => words(s).length > 0);

  // 2. stock connectors opening sentences
  const openers = sents.map((s) => ({ s, o: stockOpener(s, lang) })).filter((x) => x.o);
  const notAlreadyNamed = openers.filter((x) => !phrases.some((p) => fold(p) === fold(x.o!)));
  if (notAlreadyNamed.length) {
    issues.push(`Do not open sentences with stock connectors. Rework: ${notAlreadyNamed.map((x) => `"${short(x.s)}"`).join("; ")}.`);
    weight += notAlreadyNamed.length * 2;
  }

  // 3. sentence rhythm: flat lengths across the chunk, or runs of near-equal sentences
  const lens = sents.map((s) => words(s).length);
  if (lens.length >= 5 && cv(lens) < 0.32) {
    issues.push(
      `Sentence lengths are too even (${lens.join(", ")} words). Make the rhythm uneven: at least one short sentence under 8 words and one longer one over 25, by splitting or joining existing sentences.`,
    );
    weight += 3;
  } else {
    for (let i = 0; i + 2 < lens.length; i++) {
      const run = lens.slice(i, i + 3);
      if (Math.max(...run) - Math.min(...run) <= 3 && Math.min(...run) >= 10) {
        issues.push(`Three sentences in a row have almost the same length (${run.join(", ")} words), starting at "${short(sents[i])}". Split or merge one of them.`);
        weight += 2;
        break;
      }
    }
  }

  // 4. consecutive sentences starting with the same word
  for (let i = 1; i < sents.length; i++) {
    const a = firstWord(sents[i - 1]);
    if (a && a.length > 1 && a === firstWord(sents[i])) {
      issues.push(`Two sentences in a row start with "${words(sents[i])[0]}". Start the second one differently: "${short(sents[i])}".`);
      weight += 1;
      break;
    }
  }

  return { issues, weight };
}
