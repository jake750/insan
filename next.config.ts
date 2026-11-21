import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

// The app compares this with the latest GitHub release to offer in-app updates (src/ui/update.ts).
const env = { NEXT_PUBLIC_APP_VERSION: JSON.parse(readFileSync("./package.json", "utf8")).version as string };

// Strict privacy headers: no third-party anything. connect-src allows https/http
// because the user chooses their own model endpoint (Anthropic, OpenAI-compatible, local Ollama).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:* ws://localhost:*",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

// CAP=1 builds a static export into .next-native/ for the Android/iOS app (scripts/build-native.mjs).
// The app shell is served from the device, so there are no server headers or API routes there.
const native = process.env.CAP === "1";

const config: NextConfig = native
  ? { output: "export", distDir: ".next-native", images: { unoptimized: true }, poweredByHeader: false, env }
  : {
  // route.web.ts files (the stateless proxy) exist only in the web build; the native export skips them
  pageExtensions: ["tsx", "ts", "web.ts"],
  env,
  poweredByHeader: false,
  // STANDALONE=1: self-contained server for the Windows setup (scripts/build-pc.mjs), no node_modules needed
  ...(process.env.STANDALONE === "1" ? { output: "standalone" as const } : {}),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
    ];
  },
};
export default config;
