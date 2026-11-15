// LLM judge: asks the user's own model to rate each sentence for AI-likeness.
// It uses the same key and provider as the rewriter; nothing new is sent anywhere else.
import { makeChat, parseJsonReply } from "../engine/providers";
import type { ProviderConfig } from "../engine/types";

/*
 * The judge prompt. Kept short and literal so small local models can follow it.
 * - Sentences are numbered so the reply can't drift out of alignment.
 * - Scores are anchored with concrete descriptions, which keeps models from giving everything 50.
 * - The reason is one line, in the text's language, naming the concrete tell.
 */
export const JUDGE_SYSTEM = `You are an editor who spots machine-written prose. Rate how AI-generated each numbered sentence reads, from 0 to 100.

Anchors:
- 0–20: clearly human — specific, uneven, personal, concrete detail, natural asides.
- 21–50: could be either — plain and competent, nothing telling.
- 51–80: probably AI — stock phrases, tidy connectors (Moreover, Furthermore, De plus, علاوة على ذلك), vague abstraction, balanced lists of three, hedging.
- 81–100: almost certainly AI — several tells at once, generic summary, "In conclusion"-style wrap-ups.

Judge the writing, not the topic. Do not rewrite anything.
Reply with JSON only, no prose, exactly in this shape:
{"overall": <0-100>, "sentences": [{"i": <number>, "score": <0-100>, "reason": "<one short line naming the tell, in the same language as the text>"}]}`;

const LANG_NAME: Record<string, string> = { en: "English", fr: "French", ar: "Arabic" };

export function buildJudgeUser(sentences: string[], lang?: string): string {
  const name = lang ? LANG_NAME[lang] : undefined;
  return `Rate these sentences. They are consecutive parts of one text.${name ? ` Write every reason in ${name}.` : ""}\n\n${sentences.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
}

const MAX_SENTENCES = 120;

export async function judge(sentences: string[], provider: ProviderConfig, signal?: AbortSignal, lang?: string): Promise<{ score: number; sentences: { text: string; score: number; reason?: string }[] }> {
  const chat = makeChat(provider);
  const list = sentences.slice(0, MAX_SENTENCES);
  const raw = await chat({
    system: JUDGE_SYSTEM,
    user: buildJudgeUser(list, lang),
    maxTokens: provider.kind === "anthropic" ? 16000 : Math.max(800, list.length * 60),
    signal,
  });
  return parseJudge(raw, list);
}

/** Strict-ish parse of the judge reply; throws when there is nothing usable. */
export function parseJudge(raw: string, list: string[]): { score: number; sentences: { text: string; score: number; reason?: string }[] } {
  const parsed = parseJsonReply<{ overall?: unknown; sentences?: { i?: unknown; score?: unknown; reason?: unknown }[] }>(raw);
  const clampScore = (x: unknown) => {
    const n = Number(x);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
  };
  const sents = (Array.isArray(parsed?.sentences) ? parsed!.sentences : [])
    .map((s) => ({ i: Number(s?.i) - 1, score: clampScore(s?.score), reason: typeof s?.reason === "string" ? s.reason.slice(0, 160) : undefined }))
    .filter((s) => s.score !== null && s.i >= 0 && s.i < list.length)
    .map((s) => ({ text: list[s.i], score: s.score!, reason: s.reason }));
  let overall = clampScore(parsed?.overall);
  if (overall === null && sents.length) overall = Math.round(sents.reduce((a, s) => a + s.score, 0) / sents.length);
  if (overall === null) throw new Error("The model did not return a usable rating.");
  return { score: overall, sentences: sents };
}
