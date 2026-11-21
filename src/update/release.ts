// Latest-release lookup shared by the app (update banner) and the PC update route.
// Reads the public GitHub Releases API; no key, no tracking. Only this repository's own assets are used.

export const REPO = "jake750/insan";
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;

export interface Release {
  version: string;
  page: string;
  /** Android APK (installs over the GitHub-distributed app). */
  apk?: string;
  /** Windows setup (installs over the PC app). */
  exe?: string;
}

/** True when `a` is a newer x.y.z version than `b`. Anything unparsable is never newer. */
export function isNewer(a: string, b: string): boolean {
  const p = (v: string) => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
    return m ? m.slice(1).map(Number) : null;
  };
  const x = p(a), y = p(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

/** Turns a GitHub "latest release" API response into a Release, keeping only this repo's own assets. */
export function parseRelease(json: unknown): Release | null {
  const r = json as { tag_name?: string; html_url?: string; draft?: boolean; prerelease?: boolean; assets?: { name?: string; browser_download_url?: string }[] };
  if (!r || typeof r.tag_name !== "string" || r.draft || r.prerelease) return null;
  const version = r.tag_name.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) return null;
  const own = (r.assets ?? []).filter((a) => typeof a.browser_download_url === "string" && a.browser_download_url.startsWith(DOWNLOAD_PREFIX));
  const find = (name: string) => own.find((a) => a.name === name)?.browser_download_url;
  return {
    version,
    page: typeof r.html_url === "string" && r.html_url.startsWith(`https://github.com/${REPO}/`) ? r.html_url : RELEASES_PAGE,
    apk: find(`Insan-${version}-android.apk`),
    exe: find(`Insan-Setup-${version}.exe`),
  };
}

export async function fetchLatest(signal?: AbortSignal): Promise<Release | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { accept: "application/vnd.github+json" },
    cache: "no-store",
    signal,
  });
  if (!res.ok) return null;
  return parseRelease(await res.json());
}
