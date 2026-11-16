"use client";
// Detection state for the app: instant local scores while typing, full checks (judge + external detectors) on demand.
import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { detect, detectInstant, type DetectionResult } from "../../detection";
import { autoPost, proxiedPost } from "../../detection/external";
import type { HttpPost } from "../../detection/types";
import type { Lang } from "../../engine/types";
import { nativePost } from "../../native";
import { useStore } from "../store";

export interface Full {
  text: string;
  result: DetectionResult;
}

export function useDetection(input: string, output: string, lang: Lang, streaming: boolean) {
  const dInput = useDeferredValue(input);
  const inLocal = useMemo(() => (dInput.trim() ? detectInstant(dInput, lang) : null), [dInput, lang]);
  const outLocal = useMemo(() => (output.trim() && !streaming ? detectInstant(output, lang) : null), [output, streaming, lang]);
  const [full, setFull] = useState<{ input?: Full; output?: Full }>({});
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ac = useRef<AbortController | null>(null);

  /** Are any network sources switched on? (If not, the local score is already the full answer.) */
  const hasRemote = useCallback(() => {
    const s = useStore.getState();
    return s.detect.judge || Object.values(s.detect.enabled).some(Boolean);
  }, []);

  const run = useCallback(
    async (texts: { input?: string; output?: string }) => {
      const s = useStore.getState();
      const provider = s.providerConfig();
      const llm = s.detect.judge && (provider.apiKey.trim() || provider.kind === "openai") ? provider : null;
      const external = Object.entries(s.detect.enabled)
        .filter(([, on]) => on)
        .map(([id]) => ({ id, creds: s.keys.det[id] ?? {} }));
      const post: HttpPost = nativePost ?? (s.provider.useProxy ? proxiedPost(s.provider.proxyUrl) : autoPost(s.provider.proxyUrl));
      ac.current?.abort();
      const ctl = new AbortController();
      ac.current = ctl;
      setChecking(true);
      setError(null);
      try {
        const next: { input?: Full; output?: Full } = {};
        for (const k of ["input", "output"] as const) {
          const text = texts[k];
          if (!text?.trim()) continue;
          next[k] = { text, result: await detect(text, { lang, llm, external, post, signal: ctl.signal }) };
        }
        if (!ctl.signal.aborted) setFull((f) => ({ ...f, ...next }));
      } catch (e) {
        if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (ac.current === ctl) setChecking(false);
      }
    },
    [lang],
  );

  // a full result only counts while the text it scored is still the current text
  const inRes = full.input && full.input.text === input ? full.input.result : inLocal;
  const outRes = full.output && full.output.text === output ? full.output.result : outLocal;
  return { inRes, outRes, checking, error, run, hasRemote, reset: () => setFull({}) };
}
