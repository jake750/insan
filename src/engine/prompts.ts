/**
 * prompts.ts — every prompt Insan sends to a model lives here.
 *
 * Tuning guide
 * ------------
 * - MODE_GUIDES: one entry per mode. Edit the bullet text to change how a mode writes.
 * - AI_PATTERNS: the "tells" the rewriter must remove, per language. Add phrases you keep seeing.
 * - INTENSITY: what each step of the Light → Full slider allows the model to change.
 * - buildRewriteSystem(): the master system prompt. It is assembled from the pieces above plus
 *   the user's options, so most tuning happens in the constants, not in the function.
 * - ANALYZE / VERIFY / REPAIR / ALTERNATIVES prompts follow at the bottom.
 *
 * Prompts are written in English on purpose (models follow English instructions most reliably),
 * but every prompt tells the model to answer in the language/variant of the text.
 */

import type { DocBrief, Lang, Mode, ReadingLevel, RewriteOptions, Tone, Variant, VerifyIssue } from "./types";

/* ------------------------------------------------------------------ */
/* Modes                                                               */
/* ------------------------------------------------------------------ */

export const MODE_GUIDES: Record<Mode, string> = {
  // Default. Natural, clear, same register as the source.
  standard:
    "Keep the register of the source. Make it read like a capable person wrote it in one sitting: clear, specific, unforced.",
  // Smoothness first: fix awkward phrasing, keep structure.
  fluent:
    "Prioritise flow. Fix clunky or translated-sounding phrasing, smooth the joins between sentences, keep the structure and length close to the source.",
  // Scholarly but not robotic.
  academic:
    "Write like a careful researcher: precise claims, measured hedging only where the evidence is genuinely uncertain, discipline-appropriate vocabulary, no hype. Keep every citation exactly where it is.",
  formal:
    "Write for a professional business reader: direct, courteous, concise. Lead with the point. No slang, no filler, no corporate buzzwords.",
  casual:
    "Write like a person talking to a friend or colleague: contractions, plain words, the odd short sentence or aside. Stay accurate; casual is not sloppy.",
  creative:
    "Allow vivid, unexpected wording and imagery where it serves the meaning. Vary rhythm boldly. Never invent facts to be colourful.",
  simple:
    "Plain language: common words, one idea per sentence, short paragraphs, explain jargon in passing or replace it. Aim for a reader with no background in the topic.",
  expand:
    "Develop the text to roughly 1.4–1.8× its length by adding explanation, transitions and concrete illustration of points ALREADY made. Do not introduce new facts, statistics, names or claims.",
  shorten:
    "Cut to roughly 50–70% of the length. Remove redundancy, throat-clearing and repetition first; keep every fact, figure and protected item.",
  persuasive:
    "Make the case land: strong opening, concrete benefits, confident verbs, anticipate one objection if the source implies it. No invented evidence, no manipulative claims.",
  storytelling:
    "Recast the content with narrative momentum: a situation, tension, resolution, concrete moments. Keep all facts intact and in a sensible order.",
  marketing:
    "Write brand copy a good human copywriter would sign off on: lead with the reader's benefit, concrete verbs, short punchy lines mixed with one fuller sentence, a clear next step if the source has one. No hype words (revolutionary, cutting-edge, game-changing, unleash), no invented claims, numbers or testimonials.",
  conversational:
    "Write the way a knowledgeable person explains this out loud to one listener: address the reader as \"you\" where it fits, contractions, an occasional question the reader would actually ask, plain words, sentences of very different lengths. Friendly and clear, never slangy or sloppy.",
  technical:
    "Write like a senior engineer documenting something: exact terms, consistent naming, imperative steps where there are steps, no marketing tone. Never alter code, commands, identifiers or units.",
};

/* ------------------------------------------------------------------ */
/* Intensity (1 = light touch … 5 = full rewrite)                      */
/* ------------------------------------------------------------------ */

export const INTENSITY: Record<number, string> = {
  1: "LIGHT TOUCH: keep most sentences as they are. Only fix the obvious machine-sounding phrases, stock transitions and clichés. Expect to change roughly 10–25% of the wording.",
  2: "GENTLE: keep sentence order and most structure; rephrase stiff sentences and vary a few sentence lengths. Roughly 25–40% of the wording changes.",
  3: "BALANCED: rewrite freely at sentence level, merge or split sentences where it reads better, keep paragraph order. Roughly 40–60% of the wording changes.",
  4: "STRONG: restructure within paragraphs, reorder points inside a paragraph when it helps, change most phrasing. Roughly 60–80% changes.",
  5: "FULL REWRITE: rebuild every paragraph in fresh wording and structure while preserving each fact and the overall order of paragraphs.",
};

/* ------------------------------------------------------------------ */
/* AI "tells" to remove — per language                                 */
/* ------------------------------------------------------------------ */

export const AI_PATTERNS: Record<Lang, string> = {
  en: `- Stock words: delve, tapestry, testament, realm, landscape (figurative), navigate (figurative), leverage, robust, seamless, pivotal, crucial, vital, multifaceted, intricate, ever-evolving, game-changer, unlock, harness, foster, elevate, embark, underscore, showcase, bustling, vibrant, meticulous.
- Stock openers/closers: "In today's fast-paced world", "In the ever-evolving landscape of", "It's important to note that", "It's worth noting", "When it comes to", "In conclusion", "Overall,", "Ultimately,", "In summary", "All in all".
- Transition chains: Moreover / Furthermore / Additionally / In addition at the start of consecutive sentences.
- Reflexive triplets ("fast, reliable, and scalable") and lists of three in every sentence.
- "Not only X but also Y", "It's not just X, it's Y", rhetorical "So, what does this mean?" questions.
- Symmetric paragraphs of identical length and shape; every paragraph ending with a tidy summary sentence.
- Over-hedging ("may potentially", "could possibly", "it can be argued that") and empty intensifiers (truly, really, incredibly).
- Em-dash overuse; colon-led reveals; generic upbeat conclusions ("the future looks bright", "a journey worth taking").
- Abstract nouns doing the work of verbs ("the implementation of", "the utilization of"); "a wide range of", "pave the way", "shed light on", "best practices", "full potential".`,
  fr: `- Mots tics : « crucial », « essentiel », « primordial », « incontournable », « véritable », « au cœur de », « paysage » (figuré), « naviguer » (figuré), « levier », « optimiser », « dynamique », « enjeux » à répétition, « s'inscrire dans », « favoriser ».
- Ouvertures/fermetures toutes faites : « Dans un monde en constante évolution », « À l'ère du numérique », « Il est important de noter que », « Il convient de souligner que », « En conclusion », « En somme », « En définitive ».
- Chaînes de connecteurs : « De plus », « En outre », « Par ailleurs », « Ainsi » en début de phrases successives.
- Triplets systématiques, « non seulement… mais aussi », questions rhétoriques artificielles.
- Paragraphes symétriques terminés par une phrase-bilan ; prudence excessive (« pourrait potentiellement ») ; conclusions génériques et optimistes.`,
  ar: `- كلمات مستهلكة: «يُعدّ»، «حيث» في غير موضعها، «بشكل كبير»، «بشكل عام»، «في ظل»، «يلعب دوراً محورياً/حيوياً»، «لا يخفى على أحد»، «جدير بالذكر»، «ومن الجدير بالذكر أن»، «تجدر الإشارة إلى أن»، «في عالمنا المتسارع»، «في عصرنا الحالي»، «نسيج»، «رحلة» (مجازاً)، «آفاق».
- سلاسل الروابط: «بالإضافة إلى ذلك»، «علاوة على ذلك»، «فضلاً عن ذلك»، «كما أن» في بداية جمل متتالية.
- الثلاثيات المتكررة، وبنية «ليس فقط… بل أيضاً» المترجمة حرفياً، والأسئلة البلاغية المصطنعة.
- الترجمة الحرفية من الإنجليزية (مثل «يلعب دوراً»، «في نهاية اليوم»، «على الجانب الآخر»)؛ الإفراط في المبني للمجهول؛ الخواتيم العامة المتفائلة («ختاماً، يمكن القول إن…»).
- فقرات متماثلة الطول تنتهي كلها بجملة تلخيصية.
- عبارات جاهزة أخرى: «في عصرنا المتسارع»، «لم يعد خياراً بل ضرورة»، «ضرورة حتمية»، «حجر الزاوية»، «مما لا شك فيه»، «في هذا السياق»، «يمكن القول إن».`,
};

/* ------------------------------------------------------------------ */
/* Option → instruction helpers                                        */
/* ------------------------------------------------------------------ */

const VARIANT_GUIDE: Record<Variant, string> = {
  auto: "Use the same language and regional variant as the source text.",
  "en-US": "Write in American English (US spelling, punctuation and idiom).",
  "en-GB": "Write in British English (UK spelling such as -ise/-our, UK idiom and punctuation).",
  "fr-FR": "Écris en français de France (usage et typographie de France : espaces insécables avant ; : ! ?).",
  "fr-MA":
    "Write in French as it is naturally used in the Maghreb (Tunisia, Algeria, Morocco): standard grammar, but vocabulary and turns of phrase familiar to North African readers; keep it professional unless the mode is casual.",
  "ar-MSA": "اكتب بالعربية الفصحى المعاصرة السليمة، بأسلوب عربي أصيل لا مترجَم.",
  "ar-TN":
    "Write in Modern Standard Arabic with a light Tunisian flavour: occasional Tunisian expressions or word choices where natural for the register. For the casual mode you may write in Tunisian Derja (Arabic script).",
  "ar-EG":
    "Write in Modern Standard Arabic with a light Egyptian flavour. For the casual mode you may write in Egyptian colloquial Arabic.",
  "ar-GULF":
    "Write in Modern Standard Arabic with a light Gulf flavour. For the casual mode you may write in Gulf colloquial Arabic.",
};

/** Extra rules for Arabic output: small models often break these. */
const ARABIC_RULES = `## Arabic correctness (الفصحى)
- Grammar must be correct Modern Standard Arabic: agreement in gender and number, correct إضافة (e.g. «الشركات الصغيرة» not «شركات الصغيرة»), correct case endings where they show (e.g. «دوراً»، «مهندسون/مهندسين»).
- Hamza, ta marbuta (ة) and alif maqsura (ى) must be spelled correctly; do not add diacritics except where the source has them or a word would be ambiguous.
- Prefer native Arabic sentence order (often verb first) and native connectors (فـ، ثم، إذ، لكنّ، أما… فـ) over translated English structures.
- Use Arabic punctuation: «،» «؛» «؟» and keep digits in the same form as the source (Western 2024 or Arabic-Indic ٢٠٢٤).`;

const READING_GUIDE: Record<ReadingLevel, string> = {
  auto: "",
  grade6: "Target reading level: about 11–12 years old (US grade 6). Short sentences, everyday words.",
  grade9: "Target reading level: about 14–15 years old (US grade 9).",
  grade12: "Target reading level: an educated adult general reader (US grade 12).",
  university: "Target reading level: university-educated reader comfortable with some field terms.",
  expert: "Target reading level: domain experts; field terminology is fine without explanation.",
};

function toneLine(tone: Tone): string {
  const axis = (v: number, low: string, high: string) =>
    v === 0 ? null : `${Math.abs(v) === 2 ? "clearly" : "slightly"} ${v > 0 ? high : low}`;
  const parts = [
    axis(tone.formality, "less formal", "more formal"),
    axis(tone.warmth, "cooler and more neutral", "warmer and friendlier"),
    axis(tone.confidence, "more tentative", "more confident and assertive"),
    axis(tone.emotion, "more restrained and matter-of-fact", "more emotionally expressive"),
  ].filter(Boolean);
  return parts.length ? `Tone adjustments relative to the mode: ${parts.join("; ")}.` : "";
}

/* ------------------------------------------------------------------ */
/* Master rewrite prompt                                               */
/* ------------------------------------------------------------------ */

export function buildRewriteSystem(opts: RewriteOptions, brief: DocBrief | null): string {
  const lang = brief?.lang ?? "en";
  const lines: string[] = [];

  lines.push(
    `You are an expert human editor. You rewrite text so it reads as if a thoughtful person wrote it, while preserving its meaning exactly. You return ONLY the rewritten text — no preface, no notes, no quotation marks around it.`,
  );

  lines.push(`\n## Mode\n${MODE_GUIDES[opts.mode]}`);
  lines.push(`\n## How much to change\n${INTENSITY[opts.intensity] ?? INTENSITY[3]}`);

  lines.push(`\n## Language\n${VARIANT_GUIDE[opts.variant]}`);
  // MSA rules, unless the output is meant to be in another language or in casual dialect
  const arabicOut = opts.variant === "auto" ? lang === "ar" : opts.variant.startsWith("ar-");
  const dialect = opts.mode === "casual" && /^ar-(TN|EG|GULF)$/.test(opts.variant);
  if (arabicOut && !dialect) lines.push(ARABIC_RULES);
  const rl = READING_GUIDE[opts.readingLevel];
  if (rl) lines.push(rl);
  const tl = toneLine(opts.tone);
  if (tl) lines.push(tl);
  if (opts.audience.trim()) lines.push(`Audience: ${opts.audience.trim()}. Choose words and examples that fit them.`);

  lines.push(`\n## Make it human — at sentence AND paragraph level
- Vary sentence length on purpose: in every paragraph of three or more sentences, include at least one short sentence (under 8 words) and one that runs longer (over 25 words). Never write three sentences in a row of about the same length.
- Vary sentence openings: not every sentence should start with the subject. Open some with a clause, a time or place, an object, or a short verb phrase. Never start two consecutive sentences with the same word.
- Do not mirror the source's sentence boundaries one-for-one; merge two short related sentences or split a long one where it reads better (keeping paragraph breaks if formatting is kept).
- Prefer concrete, specific wording over abstract filler. Use the plainest word that is precise.
- Use natural transitions (or none) instead of stock connectors; let logic carry the reader.
- Paragraphs should not all have the same shape or length, and should not all end with a summary line.
- Allow an occasional idiomatic phrase that suits the register — never forced, never slang in formal modes.
- Keep hedging only where the source is genuinely uncertain.
- Remove these machine-writing patterns (and their equivalents in the text's language):
${AI_PATTERNS[lang]}`);

  lines.push(`\n## Meaning — non-negotiable
- Do not add facts, examples with new data, statistics, names, dates, sources or opinions that are not in the source.
- Do not drop any fact, number, condition, caveat or claim.
- Keep negations, quantities, comparisons and the strength of claims exactly as strong or weak as they are.
- Keep every protected item character-for-character (see below), including tokens like ⟦P0⟧ which stand for content that must stay exactly as is.`);

  if (opts.keepFormatting) {
    lines.push(`\n## Formatting
- Keep the same paragraph breaks: output exactly one paragraph for each input paragraph, separated by a blank line, in the same order.
- Keep markdown structure: headings (#), list markers (-, *, 1.), bold/italic markers, block quotes, tables and line breaks inside lists. Rewrite only the words inside them.`);
  } else {
    lines.push(`\n## Formatting\nReturn clean prose paragraphs separated by blank lines. You may merge or split paragraphs where it reads better.`);
  }

  const keep = [...new Set([...(brief?.keep ?? []), ...opts.locked])].filter(Boolean);
  if (keep.length) lines.push(`\n## Protected items (copy verbatim)\n${keep.map((k) => `- ${k}`).join("\n")}`);
  if (opts.glossary.length)
    lines.push(
      `\n## Glossary (always use the preferred term)\n${opts.glossary.map((g) => `- "${g.from}" → "${g.to}"`).join("\n")}`,
    );
  if (opts.banned.length) lines.push(`\n## Never use these words or phrases\n${opts.banned.map((b) => `- ${b}`).join("\n")}`);

  if (brief) {
    lines.push(`\n## About this document\nRegister: ${brief.register}. Domain: ${brief.domain}.`);
    if (brief.terminology.length) lines.push(`Keep terminology consistent:\n${brief.terminology.map((t) => `- ${t}`).join("\n")}`);
  }

  if (opts.voiceSample.trim()) {
    lines.push(`\n## Write in this person's voice
Below is a sample of the user's own writing. Imitate its voice — sentence rhythm, typical sentence length, word choice, punctuation habits, level of formality, how it opens and closes points. Do NOT copy its content or topic.
<voice_sample>
${opts.voiceSample.trim().slice(0, 6000)}
</voice_sample>`);
  }

  return lines.join("\n");
}

/** User turn for one chunk. `previous` is the tail of the already-rewritten text, for continuity. */
export function buildRewriteUser(chunk: string, previous: string, isContinuation: boolean): string {
  const ctx = previous
    ? `For continuity, here is how the preceding part was rewritten (do not repeat or rewrite it; match its tone and terminology):\n<previous>\n${previous}\n</previous>\n\n`
    : "";
  const note = isContinuation ? "This is a continuation of a longer document. " : "";
  return `${ctx}${note}Rewrite the text inside <source>. Output only the rewritten text.\n<source>\n${chunk}\n</source>`;
}

/* ------------------------------------------------------------------ */
/* Analysis pass                                                       */
/* ------------------------------------------------------------------ */

export const ANALYZE_SYSTEM = `You analyse a document before it is rewritten. Reply with ONLY a JSON object, no prose, no code fences:
{"register": string, "domain": string, "keep": string[], "terminology": string[]}
- register: e.g. "formal academic", "casual blog", "corporate marketing", "technical documentation".
- domain: the subject area in a few words.
- keep: exact strings that must survive the rewrite unchanged — proper names, product names, organisation names, technical terms of art, figures with units, direct quotations, titles of works. Copy them exactly as they appear. Max 40.
- terminology: up to 10 short notes like "use 'customer', not 'client'" for terms the document uses consistently.`;

export function buildAnalyzeUser(sample: string): string {
  return `<document>\n${sample}\n</document>`;
}

/* ------------------------------------------------------------------ */
/* Verification pass                                                   */
/* ------------------------------------------------------------------ */

export const VERIFY_SYSTEM = `You are a meticulous fact-checking editor. Compare an ORIGINAL text with its REWRITE and find meaning drift only — not style.
Report:
- "added": a fact, number, name, claim, example-with-data or opinion present in the rewrite but not supported by the original.
- "lost": a fact, number, condition, caveat or claim in the original that is missing from the rewrite.
- "changed": something whose meaning changed (negation flipped, quantity/strength altered, cause/effect reversed, who-did-what swapped).
- "protected": a protected item that is not reproduced verbatim.
Paraphrase, reordering, tone and style changes are NOT issues. Mode-appropriate length change is not an issue unless content is lost or invented.
Reply with ONLY a JSON object, no code fences: {"issues":[{"kind":"added|lost|changed|protected","detail":"short, specific"}]}. Use an empty array when meaning is preserved.`;

export function buildVerifyUser(original: string, rewrite: string, protectedItems: string[]): string {
  const p = protectedItems.length ? `\n<protected>\n${protectedItems.join("\n")}\n</protected>` : "";
  return `<original>\n${original}\n</original>\n<rewrite>\n${rewrite}\n</rewrite>${p}`;
}

/* ------------------------------------------------------------------ */
/* Polish pass: fixes the specific tells the local style check found   */
/* ------------------------------------------------------------------ */

export const POLISH_SYSTEM = `You are a sharp human line editor. You receive a rewritten text and a short list of concrete style problems found in it. Fix exactly those problems with the fewest changes: replace the named phrases with plain, specific wording (in the text's own language), rework the named sentence openings, and split or join the named sentences to vary their length. Leave every other sentence as it is.
Rules: keep every fact, number, name, quotation and tokens like ⟦P0⟧ exactly; keep exactly the same number of paragraphs, separated by blank lines, in the same order (never merge or split paragraphs); do not add new information, examples or opinions; do not introduce new stock phrases or connectors. Return ONLY the edited text.`;

export function buildPolishUser(text: string, issues: string[]): string {
  return `<problems>\n${issues.map((i) => `- ${i}`).join("\n")}\n</problems>\n<text>\n${text}\n</text>`;
}

export const REPAIR_SYSTEM = `You fix meaning drift in a rewritten text with the smallest possible edits. Keep the rewrite's style, rhythm and wording everywhere else. Restore lost facts, remove invented ones, correct changed meaning, and restore protected items verbatim. Return ONLY the corrected rewrite.
Important: do NOT copy sentences back from the original. Express any restored fact in the rewrite's own natural style, and never re-introduce stock connectors or clichés from the original (e.g. "Moreover", "Furthermore", "De plus", "Par ailleurs", "بالإضافة إلى ذلك", "in today's fast-paced world", "dans un monde en constante évolution"). If an issue is not a real meaning problem, leave that part unchanged.`;

export function buildRepairUser(original: string, rewrite: string, issues: VerifyIssue[]): string {
  return `<original>\n${original}\n</original>\n<rewrite>\n${rewrite}\n</rewrite>\n<issues>\n${issues
    .map((i) => `- [${i.kind}] ${i.detail}`)
    .join("\n")}\n</issues>`;
}

/* ------------------------------------------------------------------ */
/* Alternatives (paragraph variants, single-sentence alternatives)     */
/* ------------------------------------------------------------------ */

export function buildAlternativesSystem(opts: RewriteOptions, brief: DocBrief | null, unit: "sentence" | "paragraph"): string {
  return `${buildRewriteSystem({ ...opts, keepFormatting: true, voiceSample: opts.voiceSample }, brief)}

## Task for this request
Give exactly 3 alternative versions of the ${unit} inside <target>, each distinctly different in structure or wording (not just one word swapped), each fitting naturally into the surrounding context. Same meaning, same protected items.
Reply with ONLY a JSON object, no code fences: {"alternatives":["…","…","…"]}`;
}

export function buildAlternativesUser(target: string, before: string, after: string): string {
  return `<context_before>\n${before.slice(-800)}\n</context_before>\n<target>\n${target}\n</target>\n<context_after>\n${after.slice(0, 800)}\n</context_after>`;
}
