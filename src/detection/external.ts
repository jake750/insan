// External AI detectors, bring-your-own-key. All off by default.
// Requests go from this device straight to the detector (or, on the web, through the stateless proxy
// when a detector blocks browser calls). Nothing is stored. To add a detector, add an adapter here.
//
// Response shapes follow each provider's public API docs at the time of writing; parsing is defensive
// so small changes don't break the app, and a failed parse shows up as a "partial" result, not a crash.
import type { ExternalAdapter, HttpPost } from "./types";

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const fail = (status: number, data: unknown): never => {
  const msg =
    (data as { error?: { message?: string } | string; message?: string; detail?: string })?.message ??
    (data as { detail?: string })?.detail ??
    (typeof (data as { error?: unknown })?.error === "string" ? (data as { error: string }).error : (data as { error?: { message?: string } })?.error?.message);
  if (status === 401 || status === 403) throw new Error(`Key rejected (${status})`);
  if (status === 429) throw new Error("Rate limit or out of credits (429)");
  throw new Error(msg ? `${msg} (${status})` : `HTTP ${status}`);
};

export const gptzero: ExternalAdapter = {
  id: "gptzero",
  label: "GPTZero",
  site: "https://gptzero.me/developers",
  fields: ["key"],
  hosts: ["api.gptzero.me"],
  async detect(text, creds, post, signal) {
    const r = await post("https://api.gptzero.me/v2/predict/text", { "x-api-key": creds.key, "content-type": "application/json", accept: "application/json" }, { document: text, multilingual: true }, signal);
    if (r.status >= 300) fail(r.status, r.data);
    const doc = (r.data as { documents?: Record<string, unknown>[] })?.documents?.[0] ?? {};
    const cp = doc.class_probabilities as { ai?: number; mixed?: number } | undefined;
    const p = cp && num(cp.ai) !== null ? (cp.ai ?? 0) + 0.5 * (cp.mixed ?? 0) : num(doc.completely_generated_prob) ?? num(doc.average_generated_prob);
    if (p === null) throw new Error("Unexpected response");
    const sentences = ((doc.sentences as { sentence?: string; generated_prob?: number }[]) ?? [])
      .filter((s) => s.sentence && num(s.generated_prob) !== null)
      .map((s) => ({ text: s.sentence!, score: Math.round(s.generated_prob! * 100) }));
    return { score: Math.round(p * 100), sentences };
  },
};

export const sapling: ExternalAdapter = {
  id: "sapling",
  label: "Sapling",
  site: "https://sapling.ai/api_settings",
  fields: ["key"],
  hosts: ["api.sapling.ai"],
  async detect(text, creds, post, signal) {
    const r = await post("https://api.sapling.ai/api/v1/aidetect", { "content-type": "application/json" }, { key: creds.key, text, sent_scores: true }, signal);
    if (r.status >= 300) fail(r.status, r.data);
    const d = r.data as { score?: number; sentence_scores?: { sentence?: string; score?: number }[] };
    if (num(d?.score) === null) throw new Error("Unexpected response");
    return {
      score: Math.round(d.score! * 100),
      sentences: (d.sentence_scores ?? []).filter((s) => s.sentence && num(s.score) !== null).map((s) => ({ text: s.sentence!, score: Math.round(s.score! * 100) })),
    };
  },
};

export const originality: ExternalAdapter = {
  id: "originality",
  label: "Originality.ai",
  site: "https://originality.ai/api-documentation",
  fields: ["key"],
  hosts: ["api.originality.ai"],
  async detect(text, creds, post, signal) {
    const r = await post("https://api.originality.ai/api/v1/scan/ai", { "X-OAI-API-KEY": creds.key, "content-type": "application/json", accept: "application/json" }, { content: text, storeScan: "false" }, signal);
    if (r.status >= 300) fail(r.status, r.data);
    const d = r.data as { score?: { ai?: number }; ai?: { confidence?: { AI?: number } }; blocks?: { text?: string; result?: { fake?: number } }[] };
    const p = num(d?.score?.ai) ?? num(d?.ai?.confidence?.AI);
    if (p === null) throw new Error("Unexpected response");
    return {
      score: Math.round(p * 100),
      sentences: (d.blocks ?? []).filter((b) => b.text && num(b.result?.fake) !== null).map((b) => ({ text: b.text!, score: Math.round(b.result!.fake! * 100) })),
    };
  },
};

export const copyleaks: ExternalAdapter = {
  id: "copyleaks",
  label: "Copyleaks",
  site: "https://api.copyleaks.com/dashboard",
  fields: ["email", "key"],
  hosts: ["id.copyleaks.com", "api.copyleaks.com"],
  async detect(text, creds, post, signal) {
    const login = await post("https://id.copyleaks.com/v3/account/login/api", { "content-type": "application/json" }, { email: creds.email, key: creds.key }, signal);
    if (login.status >= 300) fail(login.status, login.data);
    const token = (login.data as { access_token?: string })?.access_token;
    if (!token) throw new Error("Login failed");
    const scanId = `insan-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const r = await post(`https://api.copyleaks.com/v2/writer-detector/${scanId}/check`, { authorization: `Bearer ${token}`, "content-type": "application/json" }, { text, sandbox: false, explain: false }, signal);
    if (r.status >= 300) fail(r.status, r.data);
    const d = r.data as { summary?: { ai?: number } };
    if (num(d?.summary?.ai) === null) throw new Error("Unexpected response");
    return { score: Math.round(d.summary!.ai! * 100) };
  },
};

export const ADAPTERS: ExternalAdapter[] = [gptzero, sapling, originality, copyleaks];
export const adapterById = (id: string) => ADAPTERS.find((a) => a.id === id);

/** Plain browser POST; parses JSON when it can. */
export const browserPost: HttpPost = async (url, headers, body, signal) => {
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  const txt = await res.text();
  let data: unknown = txt;
  try {
    data = JSON.parse(txt);
  } catch {}
  return { status: res.status, data };
};

/** POST through the app's own stateless proxy (for detectors that block browser calls). */
export const proxiedPost =
  (proxyUrl: string): HttpPost =>
  async (url, headers, body, signal) => {
    const u = new URL(url);
    const base = new URL(proxyUrl, typeof window !== "undefined" ? window.location.origin : "http://localhost").toString().replace(/\/$/, "");
    return browserPost(`${base}${u.pathname}`, { ...headers, "x-insan-target": u.origin }, body, signal);
  };

/**
 * Web default: call the detector directly, and when the browser blocks it (CORS shows up as a TypeError
 * from fetch) retry once through the app's own stateless proxy. Inside the native app use nativePost instead.
 */
export const autoPost =
  (proxyUrl: string): HttpPost =>
  async (url, headers, body, signal) => {
    try {
      return await browserPost(url, headers, body, signal);
    } catch (e) {
      if (signal?.aborted || !(e instanceof TypeError)) throw e;
      return proxiedPost(proxyUrl)(url, headers, body, signal);
    }
  };
