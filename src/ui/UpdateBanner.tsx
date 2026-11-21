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

export function UpdateBanner({ t }: { t: Strings }) {
  const [rel, setRel] = useState<Release | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [phase, setPhase] = useState<Phase>("available");
  const [pct, setPct] = useState(0);
  const [hidden, setHidden] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const ac = new AbortController();
    (async () => {
      const ch = await detectChannel();
      if (!ch) return;
      const r = await fetchLatest(ac.signal).catch(() => null);
      if (!r || !isNewer(r.version, APP_VERSION) || snoozed(r.version)) return;
      if ((ch === "android" && !r.apk) || (ch === "pc" && !r.exe)) return; // assets still uploading
      setChannel(ch);
      setRel(r);
    })();
    return () => {
      ac.abort();
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
