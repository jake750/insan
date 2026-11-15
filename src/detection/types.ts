// Shared types for the AI-likeness detector. Every score here is an estimate, never a verdict.
import type { Lang } from "../engine/types";

export type Band = "low" | "mixed" | "high";

/** Why a sentence looks machine-written. Local reasons are codes (translated in the UI); judge reasons are free text. */
export type Reason =
  | { code: "cliche"; arg: string }
  | { code: "transition"; arg: string }
  | { code: "hedge"; arg: string }
  | { code: "uniform" }
  | { code: "text"; arg: string; source: string };

export interface SentenceScore {
  /** offsets into the scored text */
  start: number;
  end: number;
  text: string;
  /** 0–100, higher = more AI-like */
  score: number;
  reasons: Reason[];
}

export type SignalId = "burstiness" | "diversity" | "openers" | "cliches" | "transitions" | "punctuation" | "paragraphs" | "hedging";

export interface SignalScore {
  id: SignalId;
  /** 0–1 AI-likeness after normalisation */
  value: number;
  /** the measured value before normalisation, for display */
  raw: number;
  weight: number;
  /** false when the text is too short for this signal to mean anything (weight was dropped) */
  used: boolean;
}

export type SourceId = "local" | "llm" | "gptzero" | "sapling" | "originality" | "copyleaks" | (string & {});

export interface SourceResult {
  id: SourceId;
  /** 0–100, null when the source failed */
  score: number | null;
  weight: number;
  sentences?: { text: string; score: number; reason?: string }[];
  error?: string;
  ms?: number;
}

export interface DetectionResult {
  /** weighted ensemble, 0–100 */
  score: number;
  band: Band;
  sources: SourceResult[];
  sentences: SentenceScore[];
  signals: SignalScore[];
  words: number;
  /** false under the minimum word count: the number is shown but flagged as unreliable */
  reliable: boolean;
  lang: Lang;
  /** true when at least one enabled source failed */
  partial: boolean;
}

/** Minimal fetch-like function so the app can swap in native HTTP (no CORS) inside the Android/iOS app. */
export type HttpPost = (url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal) => Promise<{ status: number; data: unknown }>;

export interface ExternalAdapter {
  id: SourceId;
  label: string;
  /** where the user gets a key */
  site: string;
  /** credential fields, e.g. ["key"] or ["email", "key"] */
  fields: ("key" | "email")[];
  /** hosts this adapter talks to (added to the proxy allowlist) */
  hosts: string[];
  detect(text: string, creds: Record<string, string>, post: HttpPost, signal?: AbortSignal): Promise<{ score: number; sentences?: { text: string; score: number }[] }>;
}
