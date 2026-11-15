// Detector configuration. Every number that shapes a score lives here, so it can be tuned in one place.
//
// HOW THE LOCAL SCORE WORKS
// Each signal is measured on the text, then mapped linearly to 0–1 "AI-likeness" between two anchors:
//   value = clamp((raw - human) / (ai - human), 0, 1)
// `human` is where typical human writing sits, `ai` is where typical chatbot prose sits.
// The local score is the weighted mean of the signals (weights below), × 100.
// Signals that need more text than is available are dropped and the remaining weights renormalised.
//
// HOW THE FINAL SCORE WORKS
// Final = weighted mean of the sources that answered (local always does). Failed sources are skipped and
// reported, the remaining weights renormalised. External detectors carry more weight than the local
// heuristics because they are trained classifiers; the LLM judge sits in between.
import type { Band, SignalId, SourceId } from "./types";

export interface SignalConfig {
  weight: number;
  /** raw value typical of human writing */
  human: number;
  /** raw value typical of AI writing */
  ai: number;
  /** minimum sentences (or paragraphs for "paragraphs") before the signal counts */
  minUnits: number;
}

export const SIGNALS: Record<SignalId, SignalConfig> = {
  // coefficient of variation of sentence length. People mix short and long sentences; chatbots keep them even.
  burstiness: { weight: 0.2, human: 0.62, ai: 0.22, minUnits: 4 },
  // moving-average type/token ratio (50-word windows). On long texts chatbot prose reuses a narrower vocabulary,
  // but on short passages rhetorical human repetition beats it, so this is a weak signal with a small weight.
  diversity: { weight: 0.04, human: 0.86, ai: 0.72, minUnits: 6 },
  // share of sentences whose first word repeats another sentence's first word.
  openers: { weight: 0.06, human: 0.08, ai: 0.4, minUnits: 4 },
  // stock "AI" phrases per 100 words (lists in src/analysis/metrics.ts, editable).
  cliches: { weight: 0.24, human: 0.2, ai: 3.2, minUnits: 1 },
  // sentences that open with a connector (Moreover, However, De plus, علاوة على ذلك…), as a share.
  transitions: { weight: 0.16, human: 0.06, ai: 0.42, minUnits: 3 },
  // expressive punctuation per 100 words (— ; : ( ) ? ! … quotes). Low = the flat comma-and-period style.
  punctuation: { weight: 0.08, human: 3.2, ai: 0.4, minUnits: 3 },
  // coefficient of variation of paragraph length. Chatbots write same-sized paragraphs.
  paragraphs: { weight: 0.06, human: 0.55, ai: 0.12, minUnits: 3 },
  // hedges and filler qualifiers per sentence ("it is important to", "can help", "generally"…).
  hedging: { weight: 0.1, human: 0.05, ai: 0.4, minUnits: 3 },
};

/** Default weight of each source in the final ensemble. */
export const SOURCE_WEIGHTS: Record<string, number> = {
  local: 1,
  llm: 1.5,
  gptzero: 3,
  sapling: 2,
  originality: 3,
  copyleaks: 3,
};
export const sourceWeight = (id: SourceId) => SOURCE_WEIGHTS[id] ?? 2;

/** Bands shown on the gauge. */
export const BANDS: { band: Band; max: number }[] = [
  { band: "low", max: 30 },
  { band: "mixed", max: 60 },
  { band: "high", max: 100 },
];
export const bandOf = (score: number): Band => BANDS.find((b) => score <= b.max)?.band ?? "high";

/** Under this many words the score is shown but marked unreliable. */
export const MIN_WORDS = 50;

/** Default threshold for "Re-humanize flagged sentences". */
export const DEFAULT_FLAG_THRESHOLD = 60;

/** How much a sentence's own evidence moves it away from the document score (0 = all document, 1 = all sentence). */
export const SENTENCE_LOCAL_MIX = 0.6;

/** Sentence-opening connectors, per language. Matched at the start of a sentence only. */
export const TRANSITIONS: Record<"en" | "fr" | "ar", string[]> = {
  en: [
    "moreover", "furthermore", "additionally", "in addition", "however", "therefore", "thus", "consequently", "overall",
    "in conclusion", "in summary", "ultimately", "notably", "importantly", "similarly", "likewise", "conversely", "nevertheless",
    "on the other hand", "as a result", "for instance", "for example", "in essence", "indeed", "firstly", "secondly", "lastly", "finally",
  ],
  fr: [
    "de plus", "en outre", "par ailleurs", "cependant", "toutefois", "néanmoins", "ainsi", "par conséquent", "en conclusion", "en somme",
    "en effet", "d'une part", "d'autre part", "enfin", "premièrement", "deuxièmement", "finalement", "également", "de surcroît", "en définitive", "dès lors",
  ],
  ar: [
    "بالإضافة إلى ذلك", "علاوة على ذلك", "فضلاً عن ذلك", "فضلا عن ذلك", "ومن ناحية أخرى", "من ناحية أخرى", "لذلك", "وبالتالي", "بالتالي", "ومع ذلك",
    "في الختام", "ختاماً", "ختاما", "إضافة إلى ذلك", "كما", "أولاً", "ثانياً", "أخيراً", "وأخيراً", "ومن ثم", "من ثم", "وعليه", "لكن", "ولكن",
  ],
};

/** Hedges and filler qualifiers. Counted anywhere in a sentence. */
export const HEDGES: Record<"en" | "fr" | "ar", string[]> = {
  en: [
    "it is important to", "it's important to", "it is essential to", "it is crucial to", "can help", "may help", "could potentially", "potentially",
    "generally", "typically", "often", "various", "a variety of", "a range of", "in many cases", "to some extent", "arguably", "can be seen as", "plays a role",
  ],
  fr: [
    "il est important de", "il est essentiel de", "il est crucial de", "peut aider", "potentiellement", "généralement", "souvent", "divers", "diverses",
    "une variété de", "dans de nombreux cas", "dans une certaine mesure", "permet de", "contribue à", "joue un rôle",
  ],
  ar: [
    "من المهم", "من الضروري", "يمكن أن", "قد يساعد", "يساهم في", "تساهم في", "بشكل عام", "عادةً", "عادة", "غالباً", "غالبا", "مختلف", "العديد من", "إلى حد ما", "يلعب دور", "تلعب دور",
  ],
};
