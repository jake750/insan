// Shared types for the rewriting engine.

export type Mode =
  | "standard"
  | "fluent"
  | "academic"
  | "formal"
  | "casual"
  | "creative"
  | "simple"
  | "expand"
  | "shorten"
  | "persuasive"
  | "storytelling"
  | "technical"
  | "marketing"
  | "conversational";

export const MODES: Mode[] = [
  "standard",
  "fluent",
  "academic",
  "formal",
  "casual",
  "creative",
  "simple",
  "expand",
  "shorten",
  "persuasive",
  "storytelling",
  "technical",
  "marketing",
  "conversational",
];

export type Lang = "en" | "fr" | "ar";

/** Language variant the output should follow. "auto" = follow the input. */
export type Variant =
  | "auto"
  | "en-US"
  | "en-GB"
  | "fr-FR"
  | "fr-MA" // French as used in the Maghreb
  | "ar-MSA"
  | "ar-TN"
  | "ar-EG"
  | "ar-GULF";

export const VARIANTS: Variant[] = ["auto", "en-US", "en-GB", "fr-FR", "fr-MA", "ar-MSA", "ar-TN", "ar-EG", "ar-GULF"];

export type ReadingLevel = "auto" | "grade6" | "grade9" | "grade12" | "university" | "expert";
export const READING_LEVELS: ReadingLevel[] = ["auto", "grade6", "grade9", "grade12", "university", "expert"];

/** -2 … +2 for each tone axis; 0 means "leave as the mode implies". */
export interface Tone {
  formality: number;
  warmth: number;
  confidence: number;
  emotion: number;
}

export interface GlossaryEntry {
  from: string;
  to: string;
}

export interface RewriteOptions {
  mode: Mode;
  /** 1 = light touch … 5 = full rewrite */
  intensity: number;
  tone: Tone;
  readingLevel: ReadingLevel;
  audience: string;
  voiceSample: string;
  variant: Variant;
  locked: string[];
  glossary: GlossaryEntry[];
  banned: string[];
  keepFormatting: boolean;
  /** Second LLM pass that checks meaning and repairs drift. */
  verify: boolean;
  /** Local style check after each chunk; a targeted polish pass fixes any tells it finds. */
  polish: boolean;
}

export const DEFAULT_OPTIONS: RewriteOptions = {
  mode: "standard",
  intensity: 3,
  tone: { formality: 0, warmth: 0, confidence: 0, emotion: 0 },
  readingLevel: "auto",
  audience: "",
  voiceSample: "",
  variant: "auto",
  locked: [],
  glossary: [],
  banned: [],
  keepFormatting: true,
  verify: true,
  polish: true,
};

export type ProviderKind = "anthropic" | "openai";

export interface ProviderConfig {
  kind: ProviderKind;
  /** API key. Empty is allowed for local OpenAI-compatible servers (Ollama). */
  apiKey: string;
  model: string;
  /** Base URL for OpenAI-compatible endpoints (…/v1). Ignored for Anthropic. */
  baseUrl: string;
  /** Route requests through the stateless proxy instead of calling the provider directly. */
  useProxy: boolean;
  proxyUrl: string;
  /** Anthropic effort level. */
  effort: "low" | "medium" | "high";
  /** Ask OpenAI-compatible reasoning models (e.g. Qwen on Ollama) not to think; faster on small machines. */
  noThink: boolean;
}

/** Google's OpenAI-compatible Gemini endpoint; a free key comes from Google AI Studio in about a minute. */
export const GEMINI = { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-flash-latest", keyUrl: "https://aistudio.google.com/apikey" } as const;

/** Local servers (Ollama, LM Studio) work without an API key. */
export const isLocalEndpoint = (baseUrl: string) => /\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(baseUrl.trim() + "/");

export const ANTHROPIC_MODELS =["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2"];

export const DEFAULT_PROVIDER: ProviderConfig = {
  kind: "anthropic",
  apiKey: "",
  model: "claude-opus-5-5",
  baseUrl: "http://localhost:11434/v1",
  useProxy: false,
  proxyUrl: "/api/proxy",
  effort: "medium",
  noThink: true,
};

/** Result of the analysis pass. */
export interface DocBrief {
  lang: Lang;
  register: string;
  domain: string;
  /** Names, terms and figures the model flagged as must-not-change. */
  keep: string[];
  /** Short consistent-terminology notes carried across chunks. */
  terminology: string[];
}

export interface VerifyIssue {
  kind: "added" | "lost" | "changed" | "protected";
  detail: string;
}

export interface ChunkResult {
  index: number;
  original: string;
  rewritten: string;
  issues: VerifyIssue[];
  repaired: boolean;
}

export type PipelineStage = "analyzing" | "rewriting" | "polishing" | "verifying" | "repairing" | "done";

export interface PipelineEvent {
  stage: PipelineStage;
  chunk?: number;
  totalChunks?: number;
  /** Full text of the current output so far (all chunks joined). */
  text?: string;
  brief?: DocBrief;
  issues?: VerifyIssue[];
  note?: string;
}

/** Normalised provider error so the UI can show a designed state for each. */
export class EngineError extends Error {
  constructor(
    public code: "no_key" | "auth" | "rate_limit" | "network" | "cors" | "refusal" | "overloaded" | "bad_request" | "aborted" | "unknown",
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
