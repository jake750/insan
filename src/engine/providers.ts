// Model providers. Requests go straight from the browser to the provider the user picked
// (or through the optional stateless proxy). Nothing is logged anywhere.
import Anthropic from "@anthropic-ai/sdk";
import { EngineError, type ProviderConfig } from "./types";

export interface ChatRequest {
  system: string;
  user: string;
  maxTokens: number;
  signal?: AbortSignal;
  onText?: (delta: string) => void;
}

export type Chat = (req: ChatRequest) => Promise<string>;

function absolute(url: string): string {
  if (typeof window === "undefined") return url;
  return new URL(url, window.location.origin).toString().replace(/\/$/, "");
}

/** True inside the Capacitor app (Android/iOS), where CapacitorHttp bypasses CORS. */
function nativeHttp(): boolean {
  if (typeof window === "undefined") return false;
  const c = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!c?.isNativePlatform?.();
}

/** Remove <think>…</think> blocks some local reasoning models emit inline. */
export function stripThinking(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>\s*/g, "").replace(/^[\s\S]*?<\/think>\s*/, "");
}

/* ---------------- Anthropic (official SDK) ---------------- */

// Models that support the server-side refusal fallback beta.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-2"]);

function anthropicChat(cfg: ProviderConfig): Chat {
  if (!cfg.apiKey.trim()) throw new EngineError("no_key", "Add your Anthropic API key in Settings.");
  const client = new Anthropic({
    apiKey: cfg.apiKey.trim(),
    dangerouslyAllowBrowser: true, // bring-your-own-key: the key never leaves this browser except to Anthropic
    maxRetries: 2,
    ...(cfg.useProxy
      ? { baseURL: absolute(cfg.proxyUrl), defaultHeaders: { "x-insan-target": "https://api.anthropic.com" } }
      : {}),
  });

  return async ({ system, user, maxTokens, signal, onText }) => {
    const fallback = FALLBACK_MODELS.has(cfg.model);
    try {
      const stream = client.beta.messages.stream(
        {
          model: cfg.model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
          output_config: { effort: cfg.effort },
          ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        },
        { signal },
      );
      let text = "";
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          text += ev.delta.text;
          onText?.(ev.delta.text);
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal")
        throw new EngineError("refusal", "The model declined to rewrite this text. Try a different mode or model.");
      return text;
    } catch (e) {
      throw normaliseAnthropic(e, signal);
    }
  };
}

function normaliseAnthropic(e: unknown, signal?: AbortSignal): EngineError {
  if (e instanceof EngineError) return e;
  if (signal?.aborted) return new EngineError("aborted", "Stopped.");
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return new EngineError("auth", "Anthropic rejected the API key. Check it in Settings.");
  if (e instanceof Anthropic.RateLimitError) {
    const ra = Number(e.headers?.get?.("retry-after"));
    return new EngineError("rate_limit", "Rate limit reached.", Number.isFinite(ra) ? ra : 30);
  }
  if (e instanceof Anthropic.APIConnectionError)
    return new EngineError("network", "Could not reach Anthropic. Check your connection or proxy setting.");
  if (e instanceof Anthropic.InternalServerError) return new EngineError("overloaded", "The provider is overloaded. Try again shortly.");
  if (e instanceof Anthropic.BadRequestError) return new EngineError("bad_request", e.message);
  if (e instanceof Anthropic.APIUserAbortError) return new EngineError("aborted", "Stopped.");
  return new EngineError("unknown", e instanceof Error ? e.message : String(e));
}

/* ---------------- OpenAI-compatible (OpenAI, OpenRouter, Ollama, LM Studio…) ---------------- */

function openaiChat(cfg: ProviderConfig): Chat {
  const base = cfg.baseUrl.trim().replace(/\/$/, "");
  if (!base) throw new EngineError("bad_request", "Set the endpoint URL in Settings.");
  const isLocal = /\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(base + "/");
  if (!isLocal && !cfg.apiKey.trim()) throw new EngineError("no_key", "Add the API key for this endpoint in Settings.");

  return async ({ system, user, maxTokens, signal, onText }) => {
    const url = cfg.useProxy && !isLocal ? `${absolute(cfg.proxyUrl)}/chat/completions` : `${base}/chat/completions`;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (cfg.apiKey.trim()) headers.authorization = `Bearer ${cfg.apiKey.trim()}`;
    if (cfg.useProxy && !isLocal) headers["x-insan-target"] = base;
    const body: Record<string, unknown> = {
      model: cfg.model,
      stream: true,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };
    if (cfg.noThink) {
      body.reasoning_effort = "none"; // Ollama maps this to think:false
      body.think = false;
    }

    // Inside the Android/iOS app: native HTTP (no CORS), non-streaming, the reply arrives in one piece.
    if (nativeHttp() && !isLocal) {
      const { CapacitorHttp } = await import("@capacitor/core");
      if (signal?.aborted) throw new EngineError("aborted", "Stopped.");
      const r = await CapacitorHttp.post({ url: `${base}/chat/completions`, headers, data: { ...body, stream: false }, responseType: "json" }).catch(() => {
        throw new EngineError("network", "Could not reach the endpoint. Check your connection.");
      });
      if (signal?.aborted) throw new EngineError("aborted", "Stopped.");
      const data = typeof r.data === "string" ? JSON.parse(r.data || "{}") : r.data;
      if (r.status >= 400) {
        const msg = data?.error?.message ?? data?.error ?? `HTTP ${r.status}`;
        if (r.status === 401 || r.status === 403) throw new EngineError("auth", `The endpoint rejected the key: ${msg}`);
        if (r.status === 429) throw new EngineError("rate_limit", "Rate limit reached.", 30);
        throw new EngineError(r.status >= 500 ? "overloaded" : "bad_request", String(msg));
      }
      const out = stripThinking(String(data?.choices?.[0]?.message?.content ?? ""));
      onText?.(out);
      return out;
    }

    let res: Response;
    try {
      res = await fetchWithRetry(url, { method: "POST", headers, body: JSON.stringify(body), signal });
    } catch (e) {
      if (signal?.aborted) throw new EngineError("aborted", "Stopped.");
      throw new EngineError(
        isLocal ? "cors" : "network",
        isLocal
          ? "Could not reach the local model. Is Ollama running, and does OLLAMA_ORIGINS allow this site?"
          : "Could not reach the endpoint (network or CORS). Try enabling the proxy in Settings.",
      );
    }
    if (!res.ok) throw await httpError(res);

    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    let inThink = false;
    for (;;) {
      const { value, done } = await reader.read().catch((e) => {
        if (signal?.aborted) throw new EngineError("aborted", "Stopped.");
        throw e;
      });
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let delta = "";
        try {
          delta = JSON.parse(data).choices?.[0]?.delta?.content ?? "";
        } catch {
          continue;
        }
        if (!delta) continue;
        // hide inline <think> blocks from the live stream
        if (delta.includes("<think>")) inThink = true;
        text += delta;
        if (!inThink) onText?.(delta);
        if (inThink && delta.includes("</think>")) inThink = false;
      }
    }
    return stripThinking(text);
  };
}

async function fetchWithRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
  for (let i = 0; ; i++) {
    const res = await fetch(url, init);
    if ((res.status === 429 || res.status >= 500) && i < tries - 1) {
      const ra = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(ra) && ra > 0 && ra < 20 ? ra * 1000 : 1500 * 2 ** i;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    return res;
  }
}

async function httpError(res: Response): Promise<EngineError> {
  let msg = `${res.status} ${res.statusText}`;
  try {
    const j = await res.json();
    msg = j?.error?.message ?? j?.error ?? msg;
  } catch {
    /* ignore */
  }
  if (res.status === 401 || res.status === 403) return new EngineError("auth", `The endpoint rejected the key: ${msg}`);
  if (res.status === 429) return new EngineError("rate_limit", "Rate limit reached.", Number(res.headers.get("retry-after")) || 30);
  if (res.status >= 500) return new EngineError("overloaded", `Provider error: ${msg}`);
  return new EngineError("bad_request", String(msg));
}

export function makeChat(cfg: ProviderConfig): Chat {
  return cfg.kind === "anthropic" ? anthropicChat(cfg) : openaiChat(cfg);
}

/** Parse a JSON object out of a model reply that may have fences or chatter around it. */
export function parseJsonReply<T>(raw: string): T | null {
  const s = stripThinking(raw);
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
