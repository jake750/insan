// Local "naturalness report": everything here runs in the browser, no network.
// These are writing-quality signals, not a detector verdict.
import { detectLang } from "../engine/text";
import type { Lang } from "../engine/types";
import { splitParagraphs, splitSentences, words } from "./sentences";

/* ---------------- AI-sounding phrases, per language ---------------- */
// Each entry is a regex source. Matched case-insensitively. Extend freely.
export const AI_PHRASES: Record<Lang, string[]> = {
  en: [
    "delv(?:e|es|ed|ing)", "tapestry", "testament to", "in the realm of", "ever[- ]evolving", "fast[- ]paced world",
    "in today'?s (?:digital |modern )?(?:world|age|landscape|society)", "it(?:'s| is) (?:important|worth|crucial) (?:to note|noting|to remember)",
    "it(?:'s| is) worth noting", "when it comes to", "in conclusion", "in summary", "all in all", "ultimately,",
    "moreover", "furthermore", "additionally", "navigat(?:e|ing) the (?:complexities|landscape|world)", "landscape of",
    "leverag(?:e|es|ed|ing)", "robust", "seamless(?:ly)?", "pivotal", "crucial role", "plays? a (?:vital|crucial|key|pivotal|significant) role",
    "multifaceted", "intricate", "game[- ]changer", "unlock(?:s|ing)? the (?:power|potential)", "harness(?:es|ing)? the power",
    "foster(?:s|ing)?", "elevate", "embark(?:s|ing)? on", "underscor(?:e|es|ed|ing)", "showcas(?:e|es|ed|ing)", "a myriad of", "myriad",
    "not only .{3,60}? but also", "it(?:'s| is) not just .{3,40}?, it(?:'s| is)", "in essence", "at the end of the day", "the future looks bright",
    "stands? as a", "serves? as a (?:testament|reminder)", "dive (?:deep|deeper) into", "a deep dive", "rich (?:history|tapestry)", "vibrant", "bustling", "meticulous(?:ly)?",
  ],
  fr: [
    "dans un monde en (?:constante |perpétuelle )?évolution", "à l'ère du numérique", "il est (?:important|essentiel|crucial) de (?:noter|souligner|rappeler)",
    "il convient de (?:noter|souligner)", "en conclusion", "en somme", "en définitive", "de plus,", "en outre", "par ailleurs", "joue un rôle (?:clé|crucial|essentiel|majeur|primordial)",
    "non seulement .{3,60}? mais (?:aussi|également)", "véritable", "incontournable", "primordial", "au cœur de", "paysage", "naviguer dans", "levier",
    "s'inscrit dans", "favoris(?:e|er|ant)", "un large éventail", "une myriade", "plonger dans", "force est de constater", "il va sans dire",
  ],
  ar: [
    "تجدر الإشارة إلى", "(?:و)?من الجدير بالذكر", "جدير بالذكر", "لا يخفى على أحد", "في عالمنا (?:المتسارع|اليوم|المعاصر)", "في عصرنا (?:الحالي|الحاضر|الراهن)",
    "في ظل", "يلعب دور(?:اً|ا)", "تلعب دور(?:اً|ا)", "دور(?:اً|ا) (?:محوري(?:اً|ا)|حيوي(?:اً|ا)|بارز(?:اً|ا))", "بالإضافة إلى ذلك", "علاوة على ذلك", "فضلاً عن ذلك",
    "ليس فقط .{2,50}? بل (?:أيضاً|أيضا)", "بشكل كبير", "بشكل عام", "ختام(?:اً|ا)،? يمكن القول", "في نهاية المطاف", "في نهاية اليوم", "على الجانب الآخر", "نسيج", "آفاق(?:اً|ا)? واسعة", "يُعدّ|يعد من أهم",
  ],
};

const compiled = new Map<Lang, RegExp>();
function phraseRegex(lang: Lang): RegExp {
  if (!compiled.has(lang)) {
    const b = "(?<![\\p{L}\\p{N}])"; // unicode-aware word start (\b ignores accented letters)
    compiled.set(lang, new RegExp(AI_PHRASES[lang].map((p) => `${b}(?:${p})`).join("|"), "giu"));
  }
  return compiled.get(lang)!;
}

export function findAiPhrases(text: string, lang: Lang): { start: number; end: number; text: string }[] {
  const re = phraseRegex(lang);
  return [...text.matchAll(re)].map((m) => ({ start: m.index!, end: m.index! + m[0].length, text: m[0] }));
}

/* ---------------- syllables & readability ---------------- */

function syllablesEn(w: string): number {
  w = w.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return Math.max(1, (w.match(/[aeiouy]{1,2}/g) ?? []).length);
}
function syllablesFr(w: string): number {
  w = w.toLowerCase().replace(/e?s?$/, (m) => (w.length > 3 ? "" : m));
  return Math.max(1, (w.match(/[aeiouyàâäéèêëîïôöùûüœæ]+/g) ?? []).length);
}

export interface Readability {
  score: number; // 0–100, higher = easier
  label: "very_easy" | "easy" | "fairly_easy" | "standard" | "fairly_hard" | "hard" | "very_hard";
  approximate: boolean;
}

function readLabel(s: number): Readability["label"] {
  if (s >= 90) return "very_easy";
  if (s >= 80) return "easy";
  if (s >= 70) return "fairly_easy";
  if (s >= 60) return "standard";
  if (s >= 50) return "fairly_hard";
  if (s >= 30) return "hard";
  return "very_hard";
}

/* ---------------- passive voice ---------------- */

const PASSIVE: Partial<Record<Lang, RegExp>> = {
  en: /\b(?:am|is|are|was|were|be|been|being|get|gets|got)\s+(?:\w+ly\s+)?(?:\w+ed|built|done|made|known|given|taken|seen|shown|written|found|held|kept|left|lost|paid|said|sent|told|thought|understood|brought|bought|caught|chosen|drawn|driven|eaten|fallen|forgotten|grown|hidden|meant|put|read|run|set|shut|sold|spent|spoken|stolen|taught|thrown|worn|won)\b/i,
  fr: /\b(?:est|sont|était|étaient|été|être|sera|seront|serait|seraient|fut|furent|soit|soient)\s+(?:\p{L}+ment\s+)?\p{L}+(?:é|ée|és|ées|is|ise|ises|it|ite|its|ites|u|ue|us|ues|ert|erte|erts|ertes)\b/iu,
};

/* ---------------- report ---------------- */

export interface AiHit {
  start: number;
  end: number;
  text: string;
}

export interface Report {
  lang: Lang;
  words: number;
  chars: number;
  sentences: number;
  paragraphs: number;
  readingMinutes: number;
  lengths: number[];
  meanLen: number;
  sdLen: number;
  /** coefficient of variation of sentence length — higher = more varied rhythm */
  burstiness: number;
  openers: { word: string; count: number }[];
  aiHits: AiHit[];
  passiveRatio: number | null;
  readability: Readability | null;
  /** moving-average type/token ratio over 50-word windows (0–1) */
  diversity: number;
}

export function analyzeText(text: string, langHint?: Lang): Report {
  const lang = langHint ?? detectLang(text);
  const paras = splitParagraphs(text);
  const sents = paras.flatMap((p) => splitSentences(p)).filter((s) => words(s.text).length > 0);
  const allWords = words(text);
  const lengths = sents.map((s) => words(s.text).length);
  const n = lengths.length || 1;
  const mean = lengths.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / n);

  // repeated sentence openers
  const openerCount = new Map<string, number>();
  for (const s of sents) {
    const first = words(s.text)[0]?.toLowerCase();
    if (!first) continue;
    const key = lang === "ar" ? first.replace(/^[وف](?=\p{L}{3,})/u, "") : first;
    openerCount.set(key, (openerCount.get(key) ?? 0) + 1);
  }
  const openers = [...openerCount]
    .filter(([, c]) => c >= 3 || (c >= 2 && c / n >= 0.2 && n >= 4))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word, count]) => ({ word, count }));

  // AI-sounding phrases
  const aiHits: AiHit[] = [];
  const re = phraseRegex(lang);
  re.lastIndex = 0;
  for (const m of text.matchAll(re)) aiHits.push({ start: m.index!, end: m.index! + m[0].length, text: m[0] });

  // passive voice
  const pre = PASSIVE[lang];
  const passiveRatio = pre && sents.length ? sents.filter((s) => pre.test(s.text)).length / sents.length : null;

  // readability
  let readability: Readability | null = null;
  if (allWords.length >= 10 && sents.length) {
    const wps = allWords.length / sents.length;
    if (lang === "en" || lang === "fr") {
      const syl = allWords.reduce((a, w) => a + (lang === "en" ? syllablesEn(w) : syllablesFr(w)), 0) / allWords.length;
      const score = lang === "en" ? 206.835 - 1.015 * wps - 84.6 * syl : 207 - 1.015 * wps - 73.6 * syl; // Flesch / Kandel–Moles
      const s = Math.max(0, Math.min(100, score));
      readability = { score: Math.round(s), label: readLabel(s), approximate: false };
    } else {
      // No standard formula works on unvocalised Arabic; approximate from sentence and word length.
      const avgChars = allWords.reduce((a, w) => a + w.length, 0) / allWords.length;
      const s = Math.max(0, Math.min(100, 118 - wps * 1.3 - (avgChars - 3.5) * 14));
      readability = { score: Math.round(s), label: readLabel(s), approximate: true };
    }
  }

  // lexical diversity (MATTR, 50-word window)
  const lw = allWords.map((w) => w.toLowerCase());
  let diversity = 0;
  if (lw.length) {
    const win = Math.min(50, lw.length);
    let total = 0;
    let count = 0;
    for (let i = 0; i + win <= lw.length; i += Math.max(1, Math.floor(win / 5))) {
      total += new Set(lw.slice(i, i + win)).size / win;
      count++;
    }
    diversity = count ? total / count : 0;
  }

  return {
    lang,
    words: allWords.length,
    chars: text.length,
    sentences: sents.length,
    paragraphs: paras.length,
    readingMinutes: allWords.length / (lang === "ar" ? 180 : 230),
    lengths,
    meanLen: mean,
    sdLen: sd,
    burstiness: mean ? sd / mean : 0,
    openers,
    aiHits,
    passiveRatio,
    readability,
    diversity,
  };
}
