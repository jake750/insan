/**
 * Minimal stateless proxy, for providers that block direct browser calls (CORS).
 *
 * - Forwards POST /api/proxy/<path> to <x-insan-target>/<path> and streams the response back.
 * - Stores nothing, logs nothing, sets no cookies.
 * - Only HTTPS targets on the allowlist are reachable (no open proxy / SSRF).
 *   Configure with INSAN_PROXY_HOSTS="api.anthropic.com,api.openai.com,…"; INSAN_PROXY_DISABLED=1 turns it off.
 * - Per-IP rate limit (INSAN_PROXY_RPM, default 60 requests a minute) and a 2 MB body cap, so a public
 *   deployment can't be used as a free relay. Counters live in memory only and hold no request content.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// model providers, then the optional AI detectors (GPTZero, Sapling, Originality.ai, Copyleaks)
const DEFAULT_HOSTS =
  "api.anthropic.com,api.openai.com,openrouter.ai,generativelanguage.googleapis.com,api.groq.com,api.mistral.ai,api.deepseek.com,api.together.xyz," +
  "api.gptzero.me,api.sapling.ai,api.originality.ai,id.copyleaks.com,api.copyleaks.com";
const ALLOWED = new Set(
  (process.env.INSAN_PROXY_HOSTS ?? DEFAULT_HOSTS)
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);

const RPM = Math.max(1, Number(process.env.INSAN_PROXY_RPM) || 60);
const MAX_BODY = 2 * 1024 * 1024;
const hits = new Map<string, { n: number; reset: number }>();

/** Fixed one-minute window per client address. Returns seconds to wait, or 0 when allowed. */
function rateLimit(ip: string, now = Date.now()): number {
  if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  const h = hits.get(ip);
  if (!h || h.reset <= now) {
    hits.set(ip, { n: 1, reset: now + 60_000 });
    return 0;
  }
  if (h.n >= RPM) return Math.ceil((h.reset - now) / 1000);
  h.n++;
  return 0;
}

// Request headers worth forwarding; everything else (cookies, client IP, user agent…) is dropped.
const PASS = ["content-type", "authorization", "x-api-key", "anthropic-version", "anthropic-beta", "accept", "x-oai-api-key"];
const BACK = ["content-type", "retry-after", "request-id", "x-request-id"];

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (process.env.INSAN_PROXY_DISABLED === "1") return new Response("Proxy disabled", { status: 404 });
  let base: URL;
  try {
    base = new URL(req.headers.get("x-insan-target") ?? "");
  } catch {
    return new Response("Missing or invalid x-insan-target", { status: 400 });
  }
  if (base.protocol !== "https:" || !ALLOWED.has(base.hostname.toLowerCase())) {
    return new Response("Target not allowed", { status: 403 });
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const wait = rateLimit(ip);
  if (wait) {
    return new Response(JSON.stringify({ error: { message: "Too many requests through the proxy. Wait a moment." } }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(wait) },
    });
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return new Response("Request too large", { status: 413 });
  const { path } = await params;
  const url = `${base.origin}${base.pathname.replace(/\/$/, "")}/${path.map(encodeURIComponent).join("/")}`;
  const headers = new Headers();
  for (const h of PASS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const init: RequestInit & { duplex: "half" } = { method: "POST", headers, body: req.body, duplex: "half", cache: "no-store" };
  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch {
    return new Response(JSON.stringify({ error: { message: "Proxy could not reach the provider" } }), { status: 502, headers: { "content-type": "application/json" } });
  }
  const out = new Headers({ "cache-control": "no-store" });
  for (const h of BACK) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export function GET() {
  return new Response("POST only", { status: 405 });
}
