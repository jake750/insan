/**
 * In-app update for the Windows app (Insan-Setup.exe), which runs this server as InsanServer.exe on
 * 127.0.0.1. Everywhere else (Vercel, `npm start`, the source-zip install) it answers { enabled: false }.
 *
 * GET  → { enabled, version } so the page can tell whether it may update itself, and later that the
 *        new version is running.
 * POST → looks up the latest release itself (the page cannot choose the URL), downloads that release's
 *        Insan-Setup-X.Y.Z.exe from this repository, then starts it silently in a detached helper that
 *        runs the installer (which stops this server) and starts the new server. The open window reloads
 *        once GET reports the new version.
 */
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fetchLatest, isNewer } from "../../../update/release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const isPcApp = () => process.platform === "win32" && /^InsanServer\.exe$/i.test(basename(process.execPath));
let busy = false;

export function GET() {
  return Response.json({ enabled: isPcApp(), version: VERSION }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  if (!isPcApp()) return Response.json({ error: "Updates from here only work in the Windows app." }, { status: 404 });
  // only the app's own page may ask (blocks other websites from poking the local server)
  const site = req.headers.get("sec-fetch-site");
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if ((site && site !== "same-origin") || (origin && host && new URL(origin).host !== host)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (busy) return Response.json({ error: "An update is already running." }, { status: 409 });
  busy = true;
  try {
    const rel = await fetchLatest();
    if (!rel || !isNewer(rel.version, VERSION) || !rel.exe) {
      busy = false;
      return Response.json({ error: "No newer version to install." }, { status: 409 });
    }
    const res = await fetch(rel.exe, { redirect: "follow" });
    if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
    const dir = await mkdtemp(join(tmpdir(), "insan-update-"));
    const setup = join(dir, `Insan-Setup-${rel.version}.exe`);
    await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(setup));

    // InsanServer.exe sits in the install folder next to launch.ps1
    const app = dirname(process.execPath);
    const ps = [
      `$ErrorActionPreference = 'SilentlyContinue'`,
      `Start-Sleep -Milliseconds 800`,
      `Start-Process -FilePath '${setup.replace(/'/g, "''")}' -ArgumentList '/SILENT','/SUPPRESSMSGBOXES','/NORESTART','/NOCANCEL' -Wait`,
      `& '${join(app, "launch.ps1").replace(/'/g, "''")}' -ServerOnly`,
      `Remove-Item -LiteralPath '${dir.replace(/'/g, "''")}' -Recurse -Force`,
    ].join("; ");
    spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command", ps], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return Response.json({ ok: true, version: rel.version });
  } catch (e) {
    busy = false;
    return Response.json({ error: e instanceof Error ? e.message : "The update failed." }, { status: 502 });
  }
}
