"use client";
// "A new version is available" bar. On Android (GitHub APK) and in the Windows app it downloads and
// installs the update without leaving Insan; a source install gets a link to the release page.
// The web version needs none of this: every visit already loads the latest build.
import { useEffect, useRef, useState } from "react";
import { androidCanSelfUpdate, androidInstallDownloaded, androidUpdate, isNative } from "../native";
import { fetchLatest, isNewer, type Release } from "../update/release";
import { Logo } from "./Icons";
import type { Strings } from "./i18n";

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

type Channel = "android" | "pc" | "link";
type Phase = "available" | "downloading" | "permission" | "installing" | "error";

const LATER_KEY = "insan.update.later";
const DAY = 24 * 60 * 60 * 1000;

function snoozed(version: string): boolean {
  try {
    const s = JSON.parse(localStorage.getItem(LATER_KEY) || "null");
    return !!s && s.version === version && s.until > Date.now();
  } catch {
    return false;
  }
}

async function detectChannel(): Promise<Channel | null> {
  if (isNative()) return (await androidCanSelfUpdate()) ? "android" : null;
  try {
    const r = await fetch("/api/update", { cache: "no-store" });
    if (r.ok && (await r.json()).enabled) return "pc";
  } catch {}
  // installed from the source zip (served on this computer): no self-update, but point to the release
  return /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "link" : null;
}

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

/** Result of a check: "found" shows the bar; "web" = the web version, which is always the latest build. */
export type CheckResult = "found" | "latest" | "offline" | "web";

// the mounted banner registers its check here, so Settings can run one on demand
let runCheck: ((manual: boolean) => Promise<CheckResult>) | null = null;

/** "Check for updates" button: checks now, even if the user chose "Later" for this version. */
export function checkForUpdates(): Promise<CheckResult> {
  return runCheck ? runCheck(true) : Promise.resolve("offline");
}

/** Coming back to the app re-checks, at most this often. */
const RECHECK = 10 * 60 * 1000;

export function UpdateBanner({ t }: { t: Strings }) {
  const [rel, setRel] = useState<Release | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [phase, setPhase] = useState<Phase>("available");
  const [pct, setPct] = useState(0);
  const [hidden, setHidden] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false); // downloading or installing: never replace the bar under the user
  const channelRef = useRef<Channel | null | undefined>(undefined);
  const lastCheck = useRef(0);

  useEffect(() => {
    const ac = new AbortController();
    const check = async (manual: boolean): Promise<CheckResult> => {
      lastCheck.current = Date.now();
      if (channelRef.current === undefined) channelRef.current = await detectChannel();
      const ch = channelRef.current;
      if (!ch) return "web";
      if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
      const r = await fetchLatest(ac.signal).catch(() => undefined);
      if (r === undefined) return "offline";
      if (!r || !isNewer(r.version, APP_VERSION)) return "latest";
      if ((ch === "android" && !r.apk) || (ch === "pc" && !r.exe)) return "latest"; // files still uploading
      if (!manual && snoozed(r.version)) return "found";
      if (!busyRef.current) {
        setChannel(ch);
        setRel(r);
        setPhase("available");
        setHidden(false);
      }
      return "found";
    };
    runCheck = check;
    void check(false);
    // every time Insan comes back to the front (phone app resumed, PC tab focused), look again
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheck.current > RECHECK) void check(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      runCheck = null;
      ac.abort();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      if (poll.current) clearInterval(poll.current);
    };
  }, []);

  if (!rel || !channel || hidden) return null;

  const later = () => {
    try {
      localStorage.setItem(LATER_KEY, JSON.stringify({ version: rel.version, until: Date.now() + DAY }));
    } catch {}
    setHidden(true);
  };

  const update = async () => {
    setPhase("downloading");
    setPct(0);
    try {
      if (channel === "android") {
        setPhase((await androidUpdate(rel.apk!, setPct)) === "permission" ? "permission" : "installing");
      } else {
        const r = await fetch("/api/update", { method: "POST" });
        if (!r.ok) throw new Error();
        setPhase("installing");
        // the installer stops this server and starts the new one; reload once it answers with the new version
        const started = Date.now();
        poll.current = setInterval(async () => {
          try {
            const v = await (await fetch("/api/update", { cache: "no-store" })).json();
            if (v.version === rel.version) location.reload();
          } catch {}
          if (Date.now() - started > 4 * 60 * 1000) {
            if (poll.current) clearInterval(poll.current);
            setPhase("error");
          }
        }, 2000);
      }
    } catch {
      setPhase("error");
    }
  };

  const resume = async () => {
    try {
      setPhase((await androidInstallDownloaded()) === "permission" ? "permission" : "installing");
    } catch {
      setPhase("error");
    }
  };

  const working = phase === "downloading" || phase === "installing";
  busyRef.current = working;
  const msg =
    phase === "downloading"
      ? channel === "pc"
        ? t.updateDownloadingPc
        : fill(t.updateDownloading, { p: pct })
      : phase === "installing"
        ? channel === "pc"
          ? t.updateInstallingPc
          : t.updateInstallingAndroid
        : phase === "permission"
          ? t.updateAllow
          : phase === "error"
            ? t.updateFailed
            : fill(t.updateAvailable, { v: rel.version });

  return (
    <div className="update-bar" role="status" aria-live="polite">
      <Logo size={22} busy={working} />
      <div className="update-text">
        <span>{msg}</span>
        {phase === "downloading" && channel === "android" && (
          <div className="progress" aria-hidden="true">
            <i style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="update-actions">
        {phase === "available" &&
          (channel === "link" ? (
            <a className="btn btn-primary" href={rel.page} target="_blank" rel="noopener noreferrer">
              {t.updateDownload}
            </a>
          ) : (
            <button className="btn btn-primary" onClick={update}>
              {t.updateNow}
            </button>
          ))}
        {phase === "permission" && (
          <button className="btn btn-primary" onClick={resume}>
            {t.updateContinue}
          </button>
        )}
        {phase === "error" && (
          <a className="btn btn-line" href={rel.page} target="_blank" rel="noopener noreferrer">
            {t.updateDownload}
          </a>
        )}
        {!working && (
          <button className="btn" onClick={later}>
            {t.updateLater}
          </button>
        )}
      </div>
    </div>
  );
}
