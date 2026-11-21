// Native bridge for the Android / iOS app (Capacitor). On the web every export here is a no-op or null,
// so the same code runs in the browser, the installed PWA and the native app.
import type { HttpPost } from "../detection/types";

type Cap = { isNativePlatform: () => boolean; getPlatform: () => string; Plugins: Record<string, unknown> };
const cap = (): Cap | null => (typeof window !== "undefined" ? ((window as unknown as { Capacitor?: Cap }).Capacitor ?? null) : null);

export const isNative = () => !!cap()?.isNativePlatform();

/** Native HTTP (no CORS) for detector APIs inside the app; null on the web. */
export const nativePost: HttpPost | null =
  typeof window !== "undefined" && (window as unknown as { Capacitor?: Cap }).Capacitor?.isNativePlatform()
    ? async (url, headers, body) => {
        const { CapacitorHttp } = await import("@capacitor/core");
        const r = await CapacitorHttp.post({ url, headers, data: body, responseType: "json" });
        return { status: r.status, data: r.data };
      }
    : null;

/** Light haptic tap on key actions (native only). */
export async function haptic(kind: "light" | "success" = "light") {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    if (kind === "success") await Haptics.notification({ type: NotificationType.Success });
    else await Haptics.impact({ style: ImpactStyle.Light });
  } catch {}
}

/** Clipboard through the native plugin when available (more reliable inside the WebView). */
export async function nativeCopy(text: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { Clipboard } = await import("@capacitor/clipboard");
    await Clipboard.write({ string: text });
    return true;
  } catch {
    return false;
  }
}

/** Share the result out: native share sheet in the app, Web Share API in the browser. */
export async function shareText(text: string, title: string): Promise<"shared" | "unsupported" | "cancelled"> {
  try {
    if (isNative()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ text, title, dialogTitle: title });
      return "shared";
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ text, title });
      return "shared";
    }
    return "unsupported";
  } catch {
    return "cancelled";
  }
}

/* ---------- secure key storage (Android Keystore / iOS Keychain) ---------- */

const SECURE_KEY = "insan.keys";

export async function secureGet(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
    const v = await SecureStorage.get(SECURE_KEY, false, false);
    return typeof v === "string" ? v : v == null ? null : JSON.stringify(v);
  } catch {
    return null;
  }
}
export async function secureSet(value: string | null) {
  if (!isNative()) return;
  try {
    const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
    if (value === null) await SecureStorage.remove(SECURE_KEY, false);
    else await SecureStorage.set(SECURE_KEY, value, false, false);
  } catch {}
}

/* ---------- text shared into the app (Android "Share → Insan") ---------- */

interface ShareInPlugin {
  getSharedText(): Promise<{ text?: string | null }>;
  addListener(event: "shared", cb: (d: { text?: string }) => void): Promise<{ remove: () => void }>;
}

export async function onSharedText(cb: (text: string) => void): Promise<() => void> {
  const c = cap();
  if (!c?.isNativePlatform()) return () => {};
  try {
    const { registerPlugin } = await import("@capacitor/core");
    const ShareIn = registerPlugin<ShareInPlugin>("ShareIn");
    const first = await ShareIn.getSharedText();
    if (first.text) cb(first.text);
    const h = await ShareIn.addListener("shared", (d) => d.text && cb(d.text));
    return () => h.remove();
  } catch {
    return () => {};
  }
}

/** Status bar / navigation bar colours follow the theme (Android). */
export async function themeSystemBars(dark: boolean) {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: dark ? "#0a0f1a" : "#f1f3f8" });
  } catch {}
}

export async function hideSplash() {
  if (!isNative()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {}
}

/* ---------- in-app updates (Android APK from GitHub Releases) ---------- */

interface AppUpdatePlugin {
  info(): Promise<{ fromStore: boolean; canInstall: boolean }>;
  download(o: { url: string }): Promise<{ bytes: number }>;
  install(): Promise<{ needsPermission: boolean }>;
  addListener(event: "progress", cb: (d: { percent: number }) => void): Promise<{ remove: () => void }>;
}

async function appUpdate(): Promise<AppUpdatePlugin | null> {
  const c = cap();
  if (!c?.isNativePlatform() || c.getPlatform() !== "android") return null;
  const { registerPlugin } = await import("@capacitor/core");
  return registerPlugin<AppUpdatePlugin>("AppUpdate");
}

/** Can this Android copy update itself? False on iOS, the web, and Google Play installs (Play updates them). */
export async function androidCanSelfUpdate(): Promise<boolean> {
  try {
    const p = await appUpdate();
    if (!p) return false;
    return !(await p.info()).fromStore;
  } catch {
    return false; // an older native shell without the plugin
  }
}

/** Downloads the APK (progress 0–100), then opens Android's installer. "permission": the user must allow installs first. */
export async function androidUpdate(url: string, onProgress: (pct: number) => void): Promise<"installing" | "permission"> {
  const p = await appUpdate();
  if (!p) throw new Error("unsupported");
  const h = await p.addListener("progress", (d) => onProgress(d.percent));
  try {
    await p.download({ url });
  } finally {
    h.remove();
  }
  const r = await p.install();
  return r.needsPermission ? "permission" : "installing";
}

/** After the user allowed installs in Android settings: open the installer for the APK already downloaded. */
export async function androidInstallDownloaded(): Promise<"installing" | "permission"> {
  const p = await appUpdate();
  if (!p) throw new Error("unsupported");
  return (await p.install()).needsPermission ? "permission" : "installing";
}
