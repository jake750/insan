"use client";
// App settings. Everything lives in this browser only (localStorage / sessionStorage).
import { create } from "zustand";
import { DEFAULT_OPTIONS, DEFAULT_PROVIDER, type ProviderConfig, type RewriteOptions } from "../engine/types";
import type { UILang } from "./i18n";
import { isNative, secureGet, secureSet } from "../native";

export interface Preset {
  id: string;
  name: string;
  options: RewriteOptions;
}

export type Theme = "system" | "light" | "dark";

interface Persisted {
  options: RewriteOptions;
  provider: Omit<ProviderConfig, "apiKey">;
  /** keys per provider kind, so switching providers doesn't lose either */
  rememberKey: boolean;
  uiLang: UILang;
  theme: Theme;
  saveHistory: boolean;
  presets: Preset[];
  onboarded: boolean;
  detect: DetectSettings;
}

export interface DetectSettings {
  /** run the enabled detectors after every rewrite */
  autoCheck: boolean;
  /** ask the user's model to rate sentences */
  judge: boolean;
  /** sentences at or above this score are "flagged" */
  threshold: number;
  /** which external detectors are on (all off by default) */
  enabled: Record<string, boolean>;
}

export type Keys = { anthropic: string; openai: string; det: Record<string, Record<string, string>> };
const NO_KEYS = (): Keys => ({ anthropic: "", openai: "", det: {} });

interface State extends Persisted {
  keys: Keys;
  hydrated: boolean;
  setOptions: (p: Partial<RewriteOptions>) => void;
  setProvider: (p: Partial<ProviderConfig>) => void;
  setKey: (kind: "anthropic" | "openai", key: string) => void;
  setDetKey: (id: string, field: string, value: string) => void;
  setDetect: (p: Partial<DetectSettings>) => void;
  set: (p: Partial<Persisted>) => void;
  hydrate: () => void;
  providerConfig: () => ProviderConfig;
}

const SETTINGS_KEY = "insan.settings";
const KEY_KEY = "insan.keys";

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

function detectUILang(): UILang {
  const l = typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "en";
  return l === "ar" || l === "fr" ? l : "en";
}

const defaults = (): Persisted => ({
  options: DEFAULT_OPTIONS,
  provider: (({ apiKey: _k, ...rest }) => rest)(DEFAULT_PROVIDER),
  rememberKey: true,
  uiLang: detectUILang(),
  theme: "system",
  saveHistory: false,
  presets: [],
  onboarded: false,
  detect: { autoCheck: true, judge: false, threshold: 60, enabled: {} },
});

let lastSecure = "";
// Keystore writes are async; run them one after another so the newest value is always written last.
let secureChain: Promise<void> = Promise.resolve();
let secureNext: { v: string | null } | null = null;
function queueSecure(v: string | null) {
  const first = secureNext === null;
  secureNext = { v };
  if (!first) return; // a write is already queued; it will pick up this newer value
  secureChain = secureChain.then(async () => {
    const next = secureNext!;
    secureNext = null;
    await secureSet(next.v);
  });
}
let secureReady = false; // true once the Keystore read has finished (so empty keys never overwrite it)

function persist(s: State) {
  if (!s.hydrated) return;
  const p: Persisted = {
    options: s.options,
    provider: s.provider,
    rememberKey: s.rememberKey,
    uiLang: s.uiLang,
    theme: s.theme,
    saveHistory: s.saveHistory,
    presets: s.presets,
    onboarded: s.onboarded,
    detect: s.detect,
  };
  safe(() => localStorage.setItem(SETTINGS_KEY, JSON.stringify(p)), undefined);
  const keys = JSON.stringify(s.keys);
  // In the Android/iOS app keys live in the Keystore/Keychain, never in WebView storage.
  if (isNative()) {
    if (secureReady && keys !== lastSecure) {
      lastSecure = keys;
      queueSecure(s.rememberKey ? keys : null);
    }
    safe(() => {
      localStorage.removeItem(KEY_KEY);
      sessionStorage.removeItem(KEY_KEY);
    }, undefined);
    return;
  }
  safe(() => {
    if (s.rememberKey) {
      localStorage.setItem(KEY_KEY, keys);
      sessionStorage.removeItem(KEY_KEY);
    } else {
      sessionStorage.setItem(KEY_KEY, keys);
      localStorage.removeItem(KEY_KEY);
    }
  }, undefined);
}

export const useStore = create<State>((set, get) => ({
  ...defaults(),
  keys: NO_KEYS(),
  hydrated: false,
  setOptions: (p) => set((s) => ({ options: { ...s.options, ...p } })),
  setProvider: (p) => set((s) => ({ provider: { ...s.provider, ...p } })),
  setKey: (kind, key) => set((s) => ({ keys: { ...s.keys, [kind]: key } })),
  setDetKey: (id, field, value) => set((s) => ({ keys: { ...s.keys, det: { ...s.keys.det, [id]: { ...s.keys.det[id], [field]: value } } } })),
  setDetect: (p) => set((s) => ({ detect: { ...s.detect, ...p } })),
  set: (p) => set(p),
  hydrate: () => {
    const saved = safe(() => JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null"), null) as Partial<Persisted> | null;
    const keys = safe(
      () => JSON.parse(localStorage.getItem(KEY_KEY) ?? sessionStorage.getItem(KEY_KEY) ?? "null"),
      null,
    ) as Partial<Keys> | null;
    const d = defaults();
    set({
      ...d,
      ...(saved ?? {}),
      options: { ...d.options, ...(saved?.options ?? {}), tone: { ...d.options.tone, ...(saved?.options?.tone ?? {}) } },
      provider: { ...d.provider, ...(saved?.provider ?? {}) },
      detect: { ...d.detect, ...(saved?.detect ?? {}), enabled: { ...(saved?.detect?.enabled ?? {}) } },
      keys: { anthropic: keys?.anthropic ?? "", openai: keys?.openai ?? "", det: keys?.det ?? {} },
      hydrated: true,
    });
    if (isNative()) {
      void secureGet().then((raw) => {
        const k = safe(() => JSON.parse(raw ?? "null"), null) as Partial<Keys> | null;
        const merged: Keys = { anthropic: k?.anthropic ?? "", openai: k?.openai ?? "", det: k?.det ?? {} };
        lastSecure = JSON.stringify(merged);
        secureReady = true;
        if (k) set({ keys: merged });
      });
    }
  },
  providerConfig: () => {
    const s = get();
    return { ...s.provider, apiKey: s.keys[s.provider.kind] };
  },
}));

useStore.subscribe((s) => persist(s));

/** Everything this app stored in this browser, gone. */
export async function panicWipe() {
  safe(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("insan.")) localStorage.removeItem(k);
    for (const k of Object.keys(sessionStorage)) if (k.startsWith("insan.")) sessionStorage.removeItem(k);
  }, undefined);
  await safe(async () => {
    const dbs = (await indexedDB.databases?.()) ?? [{ name: "insan" }];
    await Promise.all(
      dbs.filter((d) => d.name?.startsWith("insan")).map(
        (d) =>
          new Promise<void>((res) => {
            const r = indexedDB.deleteDatabase(d.name!);
            r.onsuccess = r.onerror = r.onblocked = () => res();
          }),
      ),
    );
  }, Promise.resolve());
  await safe(async () => {
    if ("caches" in window) for (const k of await caches.keys()) await caches.delete(k);
  }, Promise.resolve());
  await secureSet(null);
  lastSecure = "";
  useStore.setState({ ...defaults(), keys: NO_KEYS(), hydrated: true });
  // the store subscription just re-saved the defaults; remove them so nothing at all is left behind
  safe(() => {
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(KEY_KEY);
    sessionStorage.removeItem(KEY_KEY);
  }, undefined);
}
