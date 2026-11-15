/**
 * Minimal stateless proxy, for providers that block direct browser calls (CORS).
 *
 * - Forwards POST /api/proxy/<path> to <x-insan-target>/<path> and streams the response back.
 * - Stores nothing, logs nothing, sets no cookies.
 * - Only HTTPS targets on the allowlist are reachable (no open proxy / SSRF).
 *   Configure with INSAN_PROXY_HOSTS="api.anthropic.com,api.openai.com,…"; INSAN_PROXY_DISABLED=1 turns it off.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// model providers, then the optional AI detectors (GPTZero, Sapling, Originality.ai, Copyleaks)
const DEFAULT_HOSTS =
  "api.anthropic.com,api.openai.com,openrouter.ai,api.groq.com,api.mistral.ai,api.deepseek.com,api.together.xyz," +
  "api.gptzero.me,api.sapling.ai,api.originality.ai,id.copyleaks.com,api.copyleaks.com";
const ALLOWED = new Set(
  (process.env.INSAN_PROXY_HOSTS ?? DEFAULT_HOSTS)
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);

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
