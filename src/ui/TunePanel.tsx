"use client";
import { useRef, useState } from "react";
import { DEFAULT_OPTIONS, READING_LEVELS, VARIANTS, type Tone } from "../engine/types";
import { LEVEL_LABELS, MODE_LABELS, VARIANT_LABELS, fmt, type Strings, type UILang } from "./i18n";
import { IconTrash, IconX } from "./Icons";
import { useStore } from "./store";
import { STYLE_MIN_WORDS, learnStyle } from "../engine/fingerprint";
import { EngineError } from "../engine/types";
import { wordCount } from "../engine/text";

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

export function TunePanel({ t, ui, onClose, embedded }: { t: Strings; ui: UILang; onClose: () => void; embedded?: boolean }) {
  const { options, setOptions, presets, set } = useStore();
  const [name, setName] = useState("");
  // keep raw text for list fields so typing newlines feels natural
  const [lockedRaw, setLockedRaw] = useState(options.locked.join("\n"));
  const [glossRaw, setGlossRaw] = useState(options.glossary.map((g) => `${g.from} => ${g.to}`).join("\n"));
  const [bannedRaw, setBannedRaw] = useState(options.banned.join("\n"));

  const toneAxes: [keyof Tone, string][] = [
    ["formality", t.formality],
    ["warmth", t.warmth],
    ["confidence", t.confidence],
    ["emotion", t.emotion],
  ];

  const syncRaw = (o: typeof options) => {
    setLockedRaw(o.locked.join("\n"));
    setGlossRaw(o.glossary.map((g) => `${g.from} => ${g.to}`).join("\n"));
    setBannedRaw(o.banned.join("\n"));
  };

  return (
    <aside className={embedded ? "tune embedded" : "pane tune"} aria-label={t.tune}>
      <div className="pane-head" hidden={embedded}>
        <div className="pane-title">{t.tune}</div>
        <button className="btn btn-icon" onClick={onClose} aria-label={t.close} title={t.close}>
          <IconX />
        </button>
      </div>
      <div className="tune-body">
        <section>
          <h3>{t.tone}</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {toneAxes.map(([k, label]) => (
              <label className="slider-row" key={k}>
                <span>{label}</span>
                <input
                  type="range"
                  min={-2}
                  max={2}
                  step={1}
                  value={options.tone[k]}
                  aria-valuetext={String(options.tone[k])}
                  onChange={(e) => setOptions({ tone: { ...options.tone, [k]: Number(e.target.value) } })}
                />
              </label>
            ))}
          </div>
        </section>

        <label>
          <span className="field-label">{t.readingLevel}</span>
          <select className="select" value={options.readingLevel} onChange={(e) => setOptions({ readingLevel: e.target.value as typeof options.readingLevel })}>
            {READING_LEVELS.map((l) => (
              <option key={l} value={l}>{LEVEL_LABELS[ui][l]}</option>
            ))}
          </select>
        </label>

        <label>
          <span className="field-label">{t.variant}</span>
          <select className="select" value={options.variant} onChange={(e) => setOptions({ variant: e.target.value as typeof options.variant })}>
            {VARIANTS.map((v) => (
              <option key={v} value={v}>{VARIANT_LABELS[ui][v]}</option>
            ))}
          </select>
        </label>

        <label>
          <span className="field-label">{t.audience}</span>
          <input className="input" value={options.audience} placeholder={t.audiencePh} onChange={(e) => setOptions({ audience: e.target.value })} />
        </label>

        <StyleSection t={t} />

        <label>
          <span className="field-label">{t.locked}</span>
          <textarea
            className="textarea"
            dir="auto"
            rows={3}
            value={lockedRaw}
            placeholder={t.lockedPh}
            onChange={(e) => {
              setLockedRaw(e.target.value);
              setOptions({ locked: lines(e.target.value) });
            }}
          />
        </label>

        <label>
          <span className="field-label">{t.glossary}</span>
          <textarea
            className="textarea"
            dir="auto"
            rows={3}
            value={glossRaw}
            placeholder={t.glossaryPh}
            onChange={(e) => {
              setGlossRaw(e.target.value);
              setOptions({
                glossary: lines(e.target.value)
                  .map((l) => l.split(/\s*(?:=>|→|->)\s*/))
                  .filter((p) => p.length === 2 && p[0] && p[1])
                  .map(([from, to]) => ({ from, to })),
              });
            }}
          />
        </label>

        <label>
          <span className="field-label">{t.banned}</span>
          <textarea
            className="textarea"
            dir="auto"
            rows={2}
            value={bannedRaw}
            placeholder={t.bannedPh}
            onChange={(e) => {
              setBannedRaw(e.target.value);
              setOptions({ banned: lines(e.target.value) });
            }}
          />
        </label>

        <label className="check">
          <input type="checkbox" checked={options.keepFormatting} onChange={(e) => setOptions({ keepFormatting: e.target.checked })} />
          <span>{t.keepFormatting}</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={options.verify} onChange={(e) => setOptions({ verify: e.target.checked })} />
          <span>{t.verifyPass}</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={options.polish} onChange={(e) => setOptions({ polish: e.target.checked })} />
          <span>{t.polishPass}</span>
        </label>

        <section>
          <h3>{t.presets}</h3>
          {presets.length === 0 && <p className="help" style={{ marginTop: 0 }}>{t.noPresets}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {presets.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  className="btn btn-line"
                  style={{ flex: 1, justifyContent: "flex-start" }}
                  onClick={() => {
                    setOptions(p.options);
                    syncRaw(p.options);
                  }}
                >
                  {p.name}
                  <span className="help" style={{ margin: 0 }}>{MODE_LABELS[ui][p.options.mode]}</span>
                </button>
                <button className="btn btn-icon btn-danger" aria-label={`${t.delete} ${p.name}`} onClick={() => set({ presets: presets.filter((x) => x.id !== p.id) })}>
                  <IconTrash size={16} />
                </button>
              </div>
            ))}
          </div>
          <form
            style={{ display: "flex", gap: 6, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              set({ presets: [...presets, { id: crypto.randomUUID(), name: name.trim(), options }] });
              setName("");
            }}
          >
            <input className="input" value={name} placeholder={t.presetName} aria-label={t.presetName} onChange={(e) => setName(e.target.value)} />
            <button className="btn btn-line" type="submit" disabled={!name.trim()}>{t.save}</button>
          </form>
        </section>

        <button
          className="btn"
          style={{ alignSelf: "flex-start" }}
          onClick={() => {
            setOptions({ ...DEFAULT_OPTIONS, mode: options.mode });
            syncRaw(DEFAULT_OPTIONS);
          }}
        >
          {t.reset}
        </button>
      </div>
    </aside>
  );
}

/** "Your style fingerprint": paste your own texts once; Insan learns how you write and uses it in every rewrite. */
function StyleSection({ t }: { t: Strings }) {
  const { options, setOptions, style, set } = useStore();
  const [state, setState] = useState<{ busy: boolean; err: string }>({ busy: false, err: "" });
  const [open, setOpen] = useState(!style.profile);
  const ac = useRef<AbortController | null>(null);
  const words = wordCount(options.voiceSample);

  const learn = async () => {
    setState({ busy: true, err: "" });
    ac.current = new AbortController();
    try {
      const profile = await learnStyle(useStore.getState().providerConfig(), options.voiceSample, ac.current.signal);
      set({ style: { profile, on: true, learnedAt: Date.now() } });
      setOpen(false);
      setState({ busy: false, err: "" });
    } catch (e) {
      const err = e instanceof EngineError ? (e.code === "aborted" ? "" : e.code === "no_key" || e.code === "auth" ? t.styleNoModel : e.message) : String(e);
      setState({ busy: false, err });
    }
  };

  return (
    <section className="style-print" aria-label={t.styleTitle}>
      <span className="field-label">{t.styleTitle}</span>
      {style.profile ? (
        <>
          <label className="check">
            <input type="checkbox" checked={style.on} onChange={(e) => set({ style: { ...style, on: e.target.checked } })} />
            <span>{t.styleOn}</span>
          </label>
          <details className="style-profile">
            <summary>{t.styleSee}</summary>
            <div dir="auto">{style.profile}</div>
          </details>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="btn btn-line" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{t.styleRelearn}</button>
            <button className="btn" onClick={() => set({ style: { profile: "", on: true, learnedAt: 0 } })}>
              <IconTrash size={15} /> {t.styleDelete}
            </button>
          </div>
        </>
      ) : (
        <div className="help">{t.styleIntro}</div>
      )}
      {open && (
        <>
          <textarea
            className="textarea"
            dir="auto"
            rows={5}
            value={options.voiceSample}
            placeholder={t.stylePh}
            aria-label={t.stylePh}
            onChange={(e) => setOptions({ voiceSample: e.target.value })}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {state.busy ? (
              <button className="btn btn-line" onClick={() => ac.current?.abort()}>{t.styleLearning}</button>
            ) : (
              <button className="btn btn-primary" onClick={learn} disabled={words < STYLE_MIN_WORDS}>{t.styleLearn}</button>
            )}
            <span className="help">{words < STYLE_MIN_WORDS ? fmt(t.styleNeed, { n: STYLE_MIN_WORDS - words }) : fmt(t.styleWords, { n: words })}</span>
          </div>
        </>
      )}
      {state.err && <div className="help" role="alert" style={{ color: "var(--warn)" }}>{state.err}</div>}
    </section>
  );
}
