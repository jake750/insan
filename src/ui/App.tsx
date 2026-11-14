"use client";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { analyzeText } from "../analysis/metrics";
import { buildDoc, docText, findSeg, replaceParagraph, updateSeg, type Doc } from "../engine/doc";
import { alternatives, runPipeline } from "../engine/pipeline";
import { detectLang, wordCount } from "../engine/text";
import { EngineError, MODES, type DocBrief, type Mode, type PipelineStage } from "../engine/types";
import { CommandPalette, type Command } from "./CommandPalette";
import { Dialog } from "./Dialog";
import { copyText, exportDocx, exportPdf, exportText, importFile } from "./files";
import { addHistory, type HistoryItem } from "./history";
import { HistoryDialog } from "./HistoryDialog";
import { MODE_HINTS, MODE_LABELS, STRINGS, fmt, type UILang } from "./i18n";
import {
  IconAlert,
  IconCheck,
  IconCommand,
  IconCopy,
  IconDiff,
  IconDownload,
  IconEdit,
  IconHistory,
  IconMoon,
  IconRedo,
  IconRevert,
  IconSettings,
  IconSliders,
  IconSpark,
  IconStop,
  IconSun,
  IconTrash,
  IconUndo,
  IconUpload,
  Logo,
} from "./Icons";
import { InputEditor } from "./InputEditor";
import { OutputView } from "./OutputView";
import { ReportPanel } from "./Report";
import { SAMPLES } from "./samples";
import { SettingsDialog } from "./SettingsDialog";
import { useStore } from "./store";
import { TunePanel } from "./TunePanel";

type Pop =
  | { kind: "seg"; id: string; rect: DOMRect }
  | { kind: "para"; p: number; rect: DOMRect }
  | { kind: "sel"; ids: string[]; rect: DOMRect };

interface RunState {
  stage: PipelineStage;
  chunk: number;
  total: number;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

export default function App() {
  const store = useStore();
  const { options, setOptions, uiLang, theme, provider, keys, hydrated } = store;
  const t = STRINGS[uiLang];

  const [input, setInput] = useState("");
  const [doc, setDoc] = useState<Doc | null>(null);
  const [past, setPast] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [error, setError] = useState<EngineError | null>(null);
  const [retryIn, setRetryIn] = useState(0);
  const [brief, setBrief] = useState<DocBrief | null>(null);
  const [verdict, setVerdict] = useState<"ok" | "repaired" | "warn" | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [view, setView] = useState<"clean" | "diff">("clean");
  const [editing, setEditing] = useState<string | null>(null);
  const [pop, setPop] = useState<Pop | null>(null);
  const [alts, setAlts] = useState<string[] | "loading" | { error: string } | null>(null);
  const [dialog, setDialog] = useState<"settings" | "history" | "palette" | "shortcuts" | null>(null);
  const [tuneOpen, setTuneOpen] = useState(false);
  const [tab, setTab] = useState<"input" | "output">("input");
  const [showAi, setShowAi] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const streamRef = useRef("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const outRef = useRef<HTMLDivElement>(null);

  /* ---------- boot: settings, theme, language, service worker ---------- */
  useEffect(() => {
    store.hydrate();
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = uiLang;
    document.documentElement.dir = uiLang === "ar" ? "rtl" : "ltr";
    document.title = { ar: "إنسان — أنسنة النصوص", fr: "Insan — humanisez vos textes", en: "Insan — humanize your writing" }[uiLang];
  }, [uiLang]);

  // Keep the unsent draft for this tab only (sessionStorage dies with the tab; panic wipe clears it too).
  useEffect(() => {
    try {
      const d = sessionStorage.getItem("insan.draft");
      if (d) setInput(d);
    } catch {}
  }, []);
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        if (input) sessionStorage.setItem("insan.draft", input);
        else sessionStorage.removeItem("insan.draft");
      } catch {}
    }, 400);
    return () => clearTimeout(id);
  }, [input]);

  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, text }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 2600);
  }, []);

  /* ---------- derived ---------- */
  const lang = useMemo(() => detectLang(input || (doc ? docText(doc) : "")), [input, doc]);
  const outputText = useMemo(() => (doc ? docText(doc) : ""), [doc]);
  const deferredInput = useDeferredValue(input);
  const before = useMemo(() => (deferredInput.trim() ? analyzeText(deferredInput, detectLang(deferredInput)) : null), [deferredInput]);
  const after = useMemo(() => (outputText.trim() && streaming === null ? analyzeText(outputText, lang) : null), [outputText, streaming, lang]);
  const words = before?.words ?? 0;
  const busy = run !== null;
  const remoteNeedsKey = provider.kind === "anthropic" || !/\/\/(localhost|127\.0\.0\.1)/.test(provider.baseUrl);
  const hasModel = !remoteNeedsKey || !!keys[provider.kind].trim();
  const parts = Math.ceil(words / (provider.kind === "anthropic" ? 900 : 450));

  const errText = useCallback(
    (e: unknown) => {
      if (e instanceof EngineError) {
        const key = `err_${e.code}` as keyof typeof t;
        return fmt(t[key] ?? t.err_unknown, { m: e.message, s: e.retryAfter ?? 30 });
      }
      return fmt(t.err_unknown, { m: e instanceof Error ? e.message : String(e) });
    },
    [t],
  );

  /* ---------- doc history (undo / redo) ---------- */
  const commit = useCallback(
    (next: Doc) => {
      setPast((p) => (doc ? [...p, doc].slice(-200) : p));
      setFuture([]);
      setDoc(next);
    },
    [doc],
  );
  const undo = useCallback(() => {
    if (!past.length) return;
    setFuture((f) => (doc ? [doc, ...f] : f));
    setDoc(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  }, [past, doc]);
  const redo = useCallback(() => {
    if (!future.length) return;
    setPast((p) => (doc ? [...p, doc] : p));
    setDoc(future[0]);
    setFuture((f) => f.slice(1));
  }, [future, doc]);

  /* ---------- the rewrite ---------- */
  const humanize = useCallback(async () => {
    if (busy || !input.trim()) return;
    if (!hasModel) {
      setDialog("settings");
      return;
    }
    setError(null);
    setPop(null);
    setEditing(null);
    setVerdict(null);
    setWarnings([]);
    setTab("output");
    const ac = new AbortController();
    abortRef.current = ac;
    streamRef.current = "";
    setStreaming("");
    setRun({ stage: "analyzing", chunk: 0, total: 1 });
    try {
      const res = await runPipeline({
        input,
        options,
        provider: store.providerConfig(),
        signal: ac.signal,
        onEvent: (e) => {
          if (e.text !== undefined) {
            streamRef.current = e.text;
            setStreaming(e.text);
          }
          if (e.brief) setBrief(e.brief);
          setRun((r) => ({ stage: e.stage, chunk: e.chunk ?? r?.chunk ?? 0, total: e.totalChunks ?? r?.total ?? 1 }));
        },
      });
      commit(buildDoc(input, res.output));
      const left = res.chunks.flatMap((c) => c.issues.map((i) => i.detail));
      setWarnings(left);
      setVerdict(left.length ? "warn" : res.chunks.some((c) => c.repaired) ? "repaired" : options.verify ? "ok" : null);
      if (useStore.getState().saveHistory) addHistory({ input, output: res.output, mode: options.mode, lang }).catch(() => {});
    } catch (e) {
      const err = e instanceof EngineError ? e : new EngineError("unknown", e instanceof Error ? e.message : String(e));
      if (streamRef.current.trim()) commit(buildDoc(input, streamRef.current)); // keep what was written
      setError(err);
      if (err.code === "rate_limit") setRetryIn(err.retryAfter ?? 30);
    } finally {
      setStreaming(null);
      setRun(null);
      abortRef.current = null;
    }
  }, [busy, input, hasModel, options, store, commit, lang]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // follow the live stream, unless the reader has scrolled up to read
  useEffect(() => {
    const el = outRef.current;
    if (streaming === null || !el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [streaming]);

  useEffect(() => {
    if (retryIn <= 0) return;
    const id = setTimeout(() => setRetryIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [retryIn]);

  /* ---------- sentence & paragraph actions ---------- */
  const loadAlts = useCallback(
    async (unit: "sentence" | "paragraph", target: string, beforeText: string, afterText: string) => {
      setAlts("loading");
      try {
        const list = await alternatives({ target, before: beforeText, after: afterText, unit, options, provider: store.providerConfig(), brief });
        setAlts(list.length ? list : { error: t.err_unknown.replace("{m}", "no alternatives") });
      } catch (e) {
        setAlts({ error: errText(e) });
      }
    },
    [options, store, brief, errText, t],
  );

  const context = useCallback(
    (ids: string[]) => {
      if (!doc) return { target: "", before: "", after: "" };
      const flat = doc.flat();
      const i0 = flat.findIndex((s) => s.id === ids[0]);
      const i1 = flat.findIndex((s) => s.id === ids[ids.length - 1]);
      return {
        target: flat.slice(i0, i1 + 1).map((s) => s.text).join(" "),
        before: flat.slice(Math.max(0, i0 - 4), i0).map((s) => s.text).join(" "),
        after: flat.slice(i1 + 1, i1 + 5).map((s) => s.text).join(" "),
      };
    },
    [doc],
  );

  const onSeg = useCallback((id: string, el: HTMLElement) => {
    setAlts(null);
    setPop({ kind: "seg", id, rect: el.getBoundingClientRect() });
  }, []);
  const onParaVariants = useCallback(
    (p: number, el: HTMLElement) => {
      if (!doc) return;
      setPop({ kind: "para", p, rect: el.getBoundingClientRect() });
      const paraText = doc[p].map((s, i) => s.text + (i < doc[p].length - 1 ? s.sep || " " : "")).join("");
      const prev = doc[p - 1]?.map((s) => s.text).join(" ") ?? "";
      const next = doc[p + 1]?.map((s) => s.text).join(" ") ?? "";
      loadAlts("paragraph", paraText, prev, next);
    },
    [doc, loadAlts],
  );

  // selection inside the output → "Regenerate selection"
  useEffect(() => {
    const onUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !outRef.current || !doc || busy) return;
      const a = (sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement)?.closest("[data-seg]");
      const b = (sel.focusNode instanceof Element ? sel.focusNode : sel.focusNode?.parentElement)?.closest("[data-seg]");
      if (!a || !b || !outRef.current.contains(a)) return;
      const flat = doc.flat().map((s) => s.id);
      let i = flat.indexOf(a.getAttribute("data-seg")!);
      let j = flat.indexOf(b.getAttribute("data-seg")!);
      if (i < 0 || j < 0) return;
      if (i > j) [i, j] = [j, i];
      setAlts(null);
      setPop({ kind: "sel", ids: flat.slice(i, j + 1), rect: sel.getRangeAt(0).getBoundingClientRect() });
    };
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
    };
  }, [doc, busy]);

  const applyToSegs = (ids: string[], text: string) => {
    if (!doc) return;
    const first = findSeg(doc, ids[0]);
    if (!first) return;
    const set = new Set(ids.slice(1));
    const origs = doc.flat().filter((s) => ids.includes(s.id)).map((s) => s.orig).filter(Boolean).join(" ");
    const lastSep = doc.flat().find((s) => s.id === ids[ids.length - 1])?.sep ?? first.seg.sep;
    const next = doc.map((para) => para.filter((s) => !set.has(s.id)).map((s) => (s.id === ids[0] ? { ...s, text, orig: origs || s.orig, sep: lastSep, status: "edited" as const } : s)));
    commit(next);
  };

  /* ---------- files ---------- */
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = await importFile(f);
      setInput(text);
      setTab("input");
      toast(fmt(t.imported, { name: f.name }));
    } catch {
      toast(t.importFailed);
    }
  };
  const doExport = async (kind: "txt" | "md" | "docx" | "pdf") => {
    setExportOpen(false);
    if (!outputText) return toast(t.nothingToExport);
    if (kind === "txt" || kind === "md") exportText(outputText, kind);
    else if (kind === "docx") await exportDocx(outputText);
    else {
      toast(t.pdfPrintHint);
      exportPdf(outputText);
    }
  };
  const copyOut = async () => {
    if (!outputText) return toast(t.nothingToExport);
    await copyText(outputText);
    toast(t.copied);
  };

  /* ---------- keyboard ---------- */
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName);
    if (mod && e.key === "Enter") {
      e.preventDefault();
      busy ? stop() : humanize();
    } else if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setDialog((d) => (d === "palette" ? null : "palette"));
    } else if (mod && e.shiftKey && e.key.toLowerCase() === "d") {
      e.preventDefault();
      setView((v) => (v === "diff" ? "clean" : "diff"));
    } else if (mod && e.shiftKey && e.key.toLowerCase() === "c" && !inField) {
      e.preventDefault();
      copyOut();
    } else if (mod && e.key === "/") {
      e.preventDefault();
      setDialog("shortcuts");
    } else if (mod && e.key === "," ) {
      e.preventDefault();
      setDialog("settings");
    } else if (!inField && mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    } else if (!inField && mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
    } else if (e.key === "Escape") {
      if (pop) setPop(null);
      else if (busy) stop();
    } else if (e.altKey && /^Digit[1-9]$/.test(e.code)) {
      e.preventDefault();
      setOptions({ mode: MODES[Number(e.code.slice(5)) - 1] });
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  /* ---------- command palette ---------- */
  const setUi = (l: UILang) => store.set({ uiLang: l });
  const commands: Command[] = [
    { id: "run", label: t.humanize, hint: `${MOD} ↵`, run: humanize, disabled: busy || !input.trim() },
    { id: "stop", label: t.stop, hint: "Esc", run: stop, disabled: !busy },
    { id: "diff", label: view === "diff" ? t.clean : t.diff, hint: `${MOD} ⇧ D`, run: () => setView((v) => (v === "diff" ? "clean" : "diff")), disabled: !doc },
    { id: "copy", label: t.copy, hint: `${MOD} ⇧ C`, run: copyOut, disabled: !doc },
    { id: "undo", label: t.undo, hint: `${MOD} Z`, run: undo, disabled: !past.length },
    { id: "redo", label: t.redo, hint: `${MOD} ⇧ Z`, run: redo, disabled: !future.length },
    { id: "edit", label: t.editText, run: () => setEditing(outputText), disabled: !doc },
    { id: "x-txt", label: `${t.export}: ${t.exportTxt}`, run: () => doExport("txt"), disabled: !doc },
    { id: "x-md", label: `${t.export}: ${t.exportMd}`, run: () => doExport("md"), disabled: !doc },
    { id: "x-docx", label: `${t.export}: ${t.exportDocx}`, run: () => doExport("docx"), disabled: !doc },
    { id: "x-pdf", label: `${t.export}: ${t.exportPdf}`, run: () => doExport("pdf"), disabled: !doc },
    { id: "import", label: t.importFile, run: () => fileRef.current?.click() },
    { id: "tune", label: t.tune, run: () => setTuneOpen((o) => !o) },
    { id: "history", label: t.history, run: () => setDialog("history") },
    { id: "settings", label: t.settings, hint: `${MOD} ,`, run: () => setDialog("settings") },
    { id: "theme", label: t.toggleTheme, keywords: "dark light theme sombre clair", run: () => store.set({ theme: isDark ? "light" : "dark" }) },
    { id: "ui-en", label: `${t.switchLang}: English`, keywords: "english anglais language langue لغة", run: () => setUi("en") },
    { id: "ui-fr", label: `${t.switchLang}: Français`, keywords: "french francais language langue لغة فرنسية", run: () => setUi("fr") },
    { id: "ui-ar", label: `${t.switchLang}: العربية`, keywords: "arabic arabe language langue لغة", run: () => setUi("ar") },
    { id: "shortcuts", label: t.shortcuts, hint: `${MOD} /`, run: () => setDialog("shortcuts") },
    { id: "clear", label: t.clear, run: () => setInput(""), disabled: !input },
    ...MODES.map((m, i) => ({ id: `mode-${m}`, label: `${t.modes}: ${MODE_LABELS[uiLang][m]}`, hint: i < 9 ? `Alt ${i + 1}` : undefined, run: () => setOptions({ mode: m }) })),
    { id: "wipe", label: t.panicWipe, run: () => setDialog("settings") },
  ];

  const [systemDark, setSystemDark] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const h = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  const isDark = theme === "dark" || (theme === "system" && systemDark);

  /* ---------- popover placement ---------- */
  const popStyle = (rect: DOMRect): React.CSSProperties => {
    const w = Math.min(420, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, rect.left + rect.width / 2 - w / 2));
    const below = rect.bottom + 8;
    return below + 260 < window.innerHeight ? { left, top: below } : { left, bottom: window.innerHeight - rect.top + 8 };
  };

  const segInfo = pop?.kind === "seg" && doc ? findSeg(doc, pop.id) : null;

  /* ---------- render ---------- */
  const stageLabel: Record<PipelineStage, string> = {
    analyzing: t.stageAnalyzing,
    rewriting: t.stageRewriting,
    verifying: t.stageVerifying,
    repairing: t.stageRepairing,
    done: t.stageDone,
  };
  const stageOrder: PipelineStage[] = ["analyzing", "rewriting", "verifying"];

  // Render only after settings are read from this browser (no server/client mismatch, no flash).
  if (!hydrated) return <div className="shell" aria-busy="true" />;

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label={t.appName}>
          <Logo />
          <span className="brand-name">
            {uiLang === "ar" ? "إنسان" : "Insan"}
            <span>{uiLang === "ar" ? "Insan" : "إنسان"}</span>
          </span>
        </a>
        <button className="btn hide-sm" onClick={() => setDialog("palette")} aria-label={t.commandPalette}>
          <IconCommand size={16} /> <span className="kbd">{MOD} K</span>
        </button>
        <button className="btn btn-icon" onClick={() => setDialog("history")} aria-label={t.history} title={t.history}>
          <IconHistory />
        </button>
        <button className="btn btn-icon" onClick={() => store.set({ theme: isDark ? "light" : "dark" })} aria-label={t.toggleTheme} title={t.toggleTheme}>
          {isDark ? <IconSun /> : <IconMoon />}
        </button>
        <select className="btn btn-line" style={{ paddingInline: 8 }} value={uiLang} onChange={(e) => setUi(e.target.value as UILang)} aria-label={t.switchLang}>
          <option value="en">EN</option>
          <option value="fr">FR</option>
          <option value="ar">ع</option>
        </select>
        <button className="btn btn-icon" onClick={() => setDialog("settings")} aria-label={t.settings} title={t.settings}>
          <IconSettings />
        </button>
      </header>

      <div className="modebar">
        <div className="modes" role="toolbar" aria-label={t.modes}>
          {MODES.map((m) => (
            <button key={m} className="mode" aria-pressed={options.mode === m} title={MODE_HINTS[uiLang][m]} onClick={() => setOptions({ mode: m as Mode })}>
              {MODE_LABELS[uiLang][m]}
            </button>
          ))}
        </div>
        <label className="intensity">
          <span className="hide-sm">{t.lightTouch}</span>
          <input type="range" min={1} max={5} step={1} value={options.intensity} aria-label={t.intensity} aria-valuetext={`${options.intensity} / 5`} onChange={(e) => setOptions({ intensity: Number(e.target.value) })} />
          <span className="hide-sm">{t.fullRewrite}</span>
        </label>
        <button className={`btn ${tuneOpen ? "btn-line" : ""}`} aria-expanded={tuneOpen} onClick={() => setTuneOpen((o) => !o)}>
          <IconSliders size={16} /> {t.tune}
        </button>
      </div>

      <main className={`workspace${tuneOpen ? " with-tune" : ""}`} data-tab={tab}>
        <div className="seg-ctl mobile-tabs" role="tablist">
          <button role="tab" aria-pressed={tab === "input"} aria-selected={tab === "input"} onClick={() => setTab("input")}>{t.original}</button>
          <button role="tab" aria-pressed={tab === "output"} aria-selected={tab === "output"} onClick={() => setTab("output")}>{t.rewrite}</button>
        </div>

        {/* ---------- input ---------- */}
        <section
          className="pane pane-input"
          aria-label={t.original}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFile(e.dataTransfer.files[0]);
          }}
          style={dragging ? { outline: "2px dashed var(--teal)", outlineOffset: -6 } : undefined}
        >
          <div className="pane-head">
            <div className="pane-title">{t.original}</div>
            <input ref={fileRef} type="file" hidden accept=".txt,.md,.markdown,.docx,.pdf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            <button className="btn" onClick={() => fileRef.current?.click()} title=".txt .md .docx .pdf">
              <IconUpload size={16} /> <span className="hide-sm">{t.importFile}</span>
            </button>
            <button className="btn btn-icon" onClick={() => { setInput(""); inputRef.current?.focus(); }} disabled={!input} aria-label={t.clear} title={t.clear}>
              <IconTrash size={16} />
            </button>
          </div>
          {words > 1500 && (
            <div className="notice warn" role="note">
              {words > 20000 ? fmt(t.veryLongText, { w: words.toLocaleString(uiLang) }) : fmt(t.longText, { n: parts })}
            </div>
          )}
          <div className="pane-body">
            <InputEditor ref={inputRef} value={input} onChange={setInput} lang={lang} placeholder={t.inputPlaceholder} hits={showAi ? before?.aiHits ?? null : null} disabled={busy} label={t.original} />
            {!input && (
              <div style={{ position: "absolute", insetInline: 26, bottom: 22, zIndex: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span className="help" style={{ margin: 0 }}>{t.tryASample}</span>
                {(["en", "fr", "ar"] as const).map((l) => (
                  <button key={l} className="btn btn-line" style={{ height: 28 }} onClick={() => setInput(SAMPLES[l])}>
                    {t[`sample${l[0].toUpperCase()}${l[1]}` as "sampleEn"]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="pane-foot">
            <div className="stats" aria-live="polite">
              <span>{words.toLocaleString(uiLang)} {t.words}</span>
              <span className="hide-sm">{input.length.toLocaleString(uiLang)} {t.chars}</span>
              <span>{Math.max(words ? 1 : 0, Math.round(before?.readingMinutes ?? 0))} {t.minRead}</span>
            </div>
            {busy ? (
              <button className="btn btn-primary" onClick={stop}>
                <IconStop size={16} /> {t.stop} <span className="kbd hide-sm">Esc</span>
              </button>
            ) : (
              <button className="btn btn-primary" onClick={humanize} disabled={!input.trim()}>
                <IconSpark size={16} /> {t.humanize} <span className="kbd hide-sm">{MOD} ↵</span>
              </button>
            )}
          </div>
        </section>

        {/* ---------- output ---------- */}
        <section className="pane pane-output" aria-label={t.rewrite}>
          <div className="pane-head">
            <div className="pane-title">
              {t.rewrite}
              {verdict && !busy && (
                <span
                  className="chip"
                  style={{ color: verdict === "warn" ? "var(--warn)" : "var(--ok)", borderColor: "currentColor", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500 }}
                  title={warnings.join("\n")}
                >
                  {verdict === "warn" ? <IconAlert size={13} /> : <IconCheck size={13} />}
                  <span className="hide-sm">{verdict === "ok" ? t.verifiedOk : verdict === "repaired" ? t.verifiedRepaired : t.verifyWarn}</span>
                </span>
              )}
            </div>
            <button className="btn btn-icon" onClick={undo} disabled={!past.length || busy} aria-label={t.undo} title={`${t.undo} (${MOD} Z)`}>
              <IconUndo size={17} />
            </button>
            <button className="btn btn-icon" onClick={redo} disabled={!future.length || busy} aria-label={t.redo} title={`${t.redo} (${MOD} ⇧ Z)`}>
              <IconRedo size={17} />
            </button>
            <button className={`btn ${view === "diff" ? "btn-line" : ""}`} onClick={() => setView(view === "diff" ? "clean" : "diff")} disabled={!doc || busy || editing !== null} aria-pressed={view === "diff"}>
              <IconDiff size={16} /> <span className="hide-sm">{t.diff}</span>
            </button>
            <button className="btn btn-icon" onClick={() => (editing === null ? setEditing(outputText) : (commit(buildDoc(input, editing)), setEditing(null)))} disabled={!doc || busy} aria-label={editing === null ? t.editText : t.doneEditing} title={editing === null ? t.editText : t.doneEditing} aria-pressed={editing !== null}>
              {editing === null ? <IconEdit size={16} /> : <IconCheck size={16} />}
            </button>
          </div>
          {busy && run && (
            <>
              <div className="progress" aria-hidden="true">
                <i style={{ width: `${Math.min(100, ((run.chunk + (run.stage === "verifying" || run.stage === "repairing" ? 0.8 : 0.3)) / Math.max(1, run.total)) * 100)}%` }} />
              </div>
              <div className="stages" style={{ padding: "8px 16px 0" }} role="status">
                {stageOrder.filter((s) => s !== "verifying" || options.verify).map((s) => {
                  const cur = run.stage === "repairing" ? "verifying" : run.stage;
                  const state = s === cur ? "active" : stageOrder.indexOf(s) < stageOrder.indexOf(cur as PipelineStage) ? "done" : "todo";
                  return (
                    <span className="stage" data-state={state} key={s}>
                      <span className="dot" />
                      {s === cur && run.stage === "repairing" ? t.stageRepairing : stageLabel[s]}
                      {s === "rewriting" && run.total > 1 && ` (${Math.min(run.chunk + 1, run.total)} ${t.of} ${run.total})`}
                    </span>
                  );
                })}
              </div>
            </>
          )}
          {error && (
            <div className={`notice ${error.code === "aborted" ? "" : "error"}`} role="alert">
              <IconAlert size={16} />
              <div className="grow">{error.code === "rate_limit" ? fmt(t.err_rate_limit, { s: retryIn }) : errText(error)}</div>
              {(error.code === "auth" || error.code === "no_key" || error.code === "network" || error.code === "cors") && (
                <button className="btn btn-line" onClick={() => setDialog("settings")}>{t.openSettings}</button>
              )}
              {error.code !== "aborted" && error.code !== "auth" && error.code !== "no_key" && (
                <button className="btn btn-line" disabled={retryIn > 0} onClick={humanize}>{t.retry}</button>
              )}
            </div>
          )}
          <div className="pane-body" ref={outRef}>
            {editing !== null ? (
              <div className="editor" data-lang={lang}>
                <textarea dir="auto" value={editing} onChange={(e) => setEditing(e.target.value)} aria-label={t.rewrite} autoFocus />
              </div>
            ) : doc || streaming !== null ? (
              <OutputView
                doc={doc}
                streaming={streaming}
                view={view}
                input={input}
                lang={lang}
                activeId={pop?.kind === "seg" ? pop.id : null}
                showAi={showAi}
                variantsLabel={t.paragraphVariants}
                onSeg={onSeg}
                onParaVariants={onParaVariants}
              />
            ) : !hasModel ? (
              <div className="empty">
                <Logo size={36} />
                <h2>{t.noModelTitle}</h2>
                <p>{t.noModelBody}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  <button className="btn btn-primary" onClick={() => { store.setProvider({ kind: "anthropic", model: "claude-opus-5-5" }); setDialog("settings"); }}>
                    {t.addClaudeKey}
                  </button>
                  <button className="btn btn-line" style={{ height: 40 }} onClick={() => { store.setProvider({ kind: "openai", baseUrl: "http://localhost:11434/v1", model: "qwen3.5:4b", noThink: true }); setDialog("settings"); }}>
                    {t.useOllama}
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty">
                <h2>{t.outputEmptyTitle}</h2>
                <p>{t.outputEmptyBody}</p>
              </div>
            )}
          </div>
          <div className="pane-foot">
            <div className="stats">
              {after && (
                <>
                  <span>{after.words.toLocaleString(uiLang)} {t.words}</span>
                  <span className="hide-sm">{outputText.length.toLocaleString(uiLang)} {t.chars}</span>
                  {before && before.words > 0 && (
                    <span dir="ltr">{after.words >= before.words ? "+" : ""}{Math.round(((after.words - before.words) / before.words) * 100)}%</span>
                  )}
                </>
              )}
            </div>
            <button className="btn" onClick={copyOut} disabled={!doc || busy}>
              <IconCopy size={16} /> {t.copy}
            </button>
            <div style={{ position: "relative" }}>
              <button className="btn btn-line" onClick={() => setExportOpen((o) => !o)} disabled={!doc || busy} aria-haspopup="menu" aria-expanded={exportOpen}>
                <IconDownload size={16} /> {t.export}
              </button>
              {exportOpen && (
                <div className="menu" role="menu" onMouseLeave={() => setExportOpen(false)}>
                  {(["txt", "md", "docx", "pdf"] as const).map((k) => (
                    <button key={k} role="menuitem" onClick={() => doExport(k)}>
                      {t[`export${k[0].toUpperCase()}${k.slice(1)}` as "exportTxt"]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {tuneOpen && <TunePanel t={t} ui={uiLang} onClose={() => setTuneOpen(false)} />}

        <ReportPanel t={t} before={before} after={after} showAi={showAi} onToggleAi={setShowAi} />
      </main>

      <p className="foot-note">{t.privacyLine}</p>

      {/* ---------- popovers ---------- */}
      {pop && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 39 }} onMouseDown={() => setPop(null)} />
          <div className="popover" style={popStyle(pop.rect)} role="dialog" aria-label={pop.kind === "para" ? t.paragraphVariants : t.alternatives}>
            {pop.kind === "seg" && segInfo && (
              <>
                <div className="pop-label">{segInfo.seg.orig ? t.originalSentence : t.newlyWritten}</div>
                {segInfo.seg.orig && <div className="pop-orig" dir="auto">{segInfo.seg.orig}</div>}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button className="btn btn-line" onClick={() => { commit(updateSeg(doc!, pop.id, { status: "accepted" })); setPop(null); }}>
                    <IconCheck size={16} /> {t.keep}
                  </button>
                  {segInfo.seg.orig && segInfo.seg.orig !== segInfo.seg.text && (
                    <button className="btn btn-line" onClick={() => { commit(updateSeg(doc!, pop.id, { text: segInfo.seg.orig, status: "rejected" })); setPop(null); }}>
                      <IconRevert size={16} /> {t.revert}
                    </button>
                  )}
                  <button className="btn btn-line" disabled={alts === "loading"} onClick={() => { const c = context([pop.id]); loadAlts("sentence", c.target, c.before, c.after); }}>
                    <IconSpark size={16} /> {t.alternatives}
                  </button>
                </div>
              </>
            )}
            {pop.kind === "sel" && (
              <button className="btn btn-line" disabled={alts === "loading"} onClick={() => { const c = context(pop.ids); loadAlts("sentence", c.target, c.before, c.after); }}>
                <IconSpark size={16} /> {t.regenerate}
              </button>
            )}
            {pop.kind === "para" && <div className="pop-label">{t.paragraphVariants}</div>}
            {alts === "loading" && <p className="help" role="status">{t.loadingAlts}</p>}
            {alts && typeof alts === "object" && !Array.isArray(alts) && <p className="help" style={{ color: "var(--del)" }} role="alert">{alts.error}</p>}
            {Array.isArray(alts) &&
              alts.map((a, i) => (
                <button
                  key={i}
                  className="alt"
                  dir="auto"
                  onClick={() => {
                    if (pop.kind === "seg") applyToSegs([pop.id], a);
                    else if (pop.kind === "sel") applyToSegs(pop.ids, a);
                    else if (pop.kind === "para" && doc) commit(replaceParagraph(doc, pop.p, a));
                    setPop(null);
                    window.getSelection()?.removeAllRanges();
                  }}
                >
                  {a}
                </button>
              ))}
          </div>
        </>
      )}

      {/* ---------- dialogs ---------- */}
      {dialog === "settings" && (
        <SettingsDialog
          t={t}
          errText={errText}
          onClose={() => setDialog(null)}
          onWiped={() => {
            setInput("");
            setDoc(null);
            setPast([]);
            setFuture([]);
            setError(null);
            setVerdict(null);
            toast(STRINGS[useStore.getState().uiLang].wiped);
          }}
        />
      )}
      {dialog === "history" && (
        <HistoryDialog
          t={t}
          ui={uiLang}
          enabled={store.saveHistory}
          onClose={() => setDialog(null)}
          onOpen={(h: HistoryItem) => {
            setInput(h.input);
            commit(buildDoc(h.input, h.output));
            setDialog(null);
          }}
        />
      )}
      {dialog === "palette" && <CommandPalette t={t} commands={commands} onClose={() => setDialog(null)} />}
      {dialog === "shortcuts" && (
        <Dialog title={t.shortcuts} onClose={() => setDialog(null)} closeLabel={t.close}>
          <div className="dialog-body">
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                {[
                  [t.humanize, `${MOD} ↵`],
                  [t.stop, "Esc"],
                  [t.commandPalette, `${MOD} K`],
                  [t.diff, `${MOD} ⇧ D`],
                  [t.copy, `${MOD} ⇧ C`],
                  [t.undo, `${MOD} Z`],
                  [t.redo, `${MOD} ⇧ Z`],
                  [t.settings, `${MOD} ,`],
                  [t.modes, "Alt 1–9"],
                  [t.shortcuts, `${MOD} /`],
                ].map(([a, k]) => (
                  <tr key={a} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "8px 0" }}>{a}</td>
                    <td style={{ textAlign: "end" }}><span className="kbd">{k}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Dialog>
      )}

      <div className="toast-wrap" aria-live="polite">
        {toasts.map((x) => (
          <div className="toast" key={x.id}>{x.text}</div>
        ))}
      </div>
    </div>
  );
}
