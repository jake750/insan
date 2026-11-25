// Style fingerprint ("بصمة أسلوبك"): the model reads a few of the user's own texts once and writes a short profile of how
// they write. The profile (not the texts) is then sent with every rewrite: cheaper than a raw sample and
// steadier, because it names the habits instead of hoping the model notices them.
import { makeChat, stripThinking } from "./providers";
import { EngineError, type ProviderConfig } from "./types";
import { wordCount } from "./text";

/** Enough text to show habits, not so much that one call gets slow or costly. */
export const STYLE_MIN_WORDS = 120;
const STYLE_MAX_WORDS = 3000;

export const STYLE_SYSTEM = `You are a stylometry expert. You receive texts written by one person. Describe HOW this person writes so another writer could imitate them on any topic. Ignore what the texts are about.
Write a compact style fingerprint, in the same language as the texts, as short bullet points under these headings:
- Sentences: typical length, rhythm and variation, how they open.
- Words: register, favourite words and turns of phrase, dialect or mixed languages, what they avoid.
- Punctuation and layout: commas, dashes, exclamation marks, emoji, paragraph length, lists.
- Voice: person (I/we/you), directness, humour, warmth, certainty, how they argue and conclude.
- Never: habits this writer clearly does not have (e.g. formal connectors, hedging, rhetorical questions).
Then add "Examples:" with 2 or 3 short verbatim excerpts (under 40 words each) that best show the style.
Be specific and concrete; no generic praise. Under 250 words in total. Reply with the fingerprint only.`;

/** Ask the selected model for a style fingerprint of `samples`. */
export async function learnStyle(provider: ProviderConfig, samples: string, signal?: AbortSignal): Promise<string> {
  const text = samples.trim();
  if (wordCount(text) < STYLE_MIN_WORDS) throw new EngineError("bad_request", "too_short");
  const chat = makeChat(provider);
  const user = `<texts>\n${text.split(/\s+/).slice(0, STYLE_MAX_WORDS).join(" ")}\n</texts>`;
  const raw = await chat({ system: STYLE_SYSTEM, user, maxTokens: provider.kind === "anthropic" ? 12000 : 2500, signal });
  const profile = stripThinking(raw)
    .trim()
    .replace(/^```\w*\n?|\n?```$/g, "")
    .trim();
  if (!profile) throw new EngineError("unknown", "The model returned an empty response.");
  return profile.slice(0, 4000);
}
