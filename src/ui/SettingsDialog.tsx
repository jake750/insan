"use client";
import { useState } from "react";
import { makeChat } from "../engine/providers";
import { ANTHROPIC_MODELS, EngineError, GEMINI, isLocalEndpoint } from "../engine/types";
import { ADAPTERS, autoPost, proxiedPost } from "../detection/external";
import { nativePost } from "../native";
import { DSTRINGS } from "./detect/strings";
import { Dialog } from "./Dialog";
import { fmt, type Strings, type UILang } from "./i18n";
import { resetHistoryHandle } from "./history";
import { IconAlert, IconCheck } from "./Icons";
import { keyFor, panicWipe, useStore, type Theme } from "./store";

const ENDPOINTS = [
  { label: "Gemini (free key)", url: GEMINI.baseUrl, model: GEMINI.model, noThink: false },
  { label: "Ollama (local)", url: "http://localhost:11434/v1", model: "qwen3.5:4b", noThink: true },
  { label: "LM Studio (local)", url: "http://localhost:1234/v1", model: "", noThink: true },
  { label: "OpenAI", url: "https://api.openai.com/v1", model: "gpt-5.1", noThink: false },
  { label: "OpenRouter", url: "https://openrouter.ai/api/v1", model: "", noThink: false },
];

// ~75 words: long enough for every detector's minimum, short enough to cost almost nothing.
const DET_SAMPLE =
  "Remote work has changed how many teams operate. Some people enjoy the quiet and the time saved on commuting, while others miss the small talk and quick questions at the next desk. Managers have had to learn new habits, such as writing things down and trusting people to finish work without being watched. Whether it lasts depends on each company, but most agree that some flexibility is here to stay.";

export function SettingsDialog({ t, onClose, errText, onWiped }: { t: Strings; onClose: () => void; errText: (e: unknown) => string; onWiped: () => void }) {
  const s = useStore();
  const d = DSTRINGS[s.uiLang];
  const [show, setShow] = useState(false);
  const [test, setTest] = useState<{ state: "idle" | "busy" | "ok" | "err"; msg?: string }>({ state: "idle" });
  const [ollamaModels, setOllamaModels] = useState<string[] | null>(null);
  const [detTest, setDetTest] = useState<Record<string, { state: "busy" | "ok" | "err"; msg?: string } | undefined>>({});
  const kind = s.provider.kind;

  // Runs one detector on a short sample, so the user sees right away whether the key works.
  const testDetector = async (id: string) => {
    const a = ADAPTERS.find((x) => x.id === id);
    if (!a) return;
    const creds = s.keys.det[id] ?? {};
    if (a.fields.some((f) => !creds[f]?.trim())) return setDetTest((m) => ({ ...m, [id]: { state: "err", msg: d.keyMissing } }));
    setDetTest((m) => ({ ...m, [id]: { state: "busy" } }));
    const post = nativePost ?? (s.provider.useProxy ? proxiedPost(s.provider.proxyUrl) : autoPost(s.provider.proxyUrl));
    try {
      await a.detect(DET_SAMPLE, creds, post);
      setDetTest((m) => ({ ...m, [id]: { state: "ok" } }));
    } catch (e) {
      setDetTest((m) => ({ ...m, [id]: { state: "err", msg: e instanceof Error ? e.message : String(e) } }));
    }
  };

  const runTest = async () => {
    setTest({ state: "busy" });
    try {
      const chat = makeChat(s.providerConfig());
      await chat({ system: "Reply with the single word OK.", user: "ping", maxTokens: kind === "anthropic" ? 2000 : 30 });
      setTest({ state: "ok" });
    } catch (e) {
      setTest({ state: "err", msg: errText(e) });
    }
  };

  const loadOllama = async () => {
    try {
      const base = s.provider.baseUrl.replace(/\/v1\/?$/, "");
      const r = await fetch(`${base}/api/tags`);
      const j = await r.json();
      setOllamaModels((j.models ?? []).map((m: { name: string }) => m.name));
    } catch {
      setOllamaModels([]);
    }
  };

  return (
    <Dialog title={t.settings} onClose={onClose} closeLabel={t.close}>
      <div className="dialog-body">
        <p className="help" style={{ marginTop: 0 }}>{d.savedAuto}</p>
        <div className="section-title">{t.provider}</div>
        <div className="seg-ctl" role="group" aria-label={t.provider}>
          {(["anthropic", "openai"] as const).map((k) => (
            <button
              key={k}
              aria-pressed={kind === k}
              onClick={() => {
                s.setProvider({ kind: k, model: k === "anthropic" ? "claude-opus-5-5" : s.provider.model.startsWith("claude") ? "qwen3.5:4b" : s.provider.model });
                setTest({ state: "idle" });
              }}
            >
              {k === "anthropic" ? t.claude : t.openaiCompat}
            </button>
          ))}
        </div>

        {kind === "openai" && (
          <>
            <div>
              <span className="field-label">{t.endpointPresets}</span>
              <div className="chips">
                {ENDPOINTS.map((e) => (
                  <button
                    key={e.label}
                    className="btn btn-line"
                    style={{ height: 28 }}
                    onClick={() => {
                      s.setProvider({ baseUrl: e.url, model: e.model || s.provider.model, noThink: e.noThink });
                      setTest({ state: "idle" });
                      setOllamaModels(null);
                    }}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
            <label>
              <span className="field-label">{t.endpoint}</span>
              <input className="input" dir="ltr" value={s.provider.baseUrl} onChange={(e) => s.setProvider({ baseUrl: e.target.value })} />
              {/localhost|127\.0\.0\.1/.test(s.provider.baseUrl) && <div className="help">{t.ollamaHelp}</div>}            </label>
          </>
        )}

        <label>
          <span className="field-label">{t.apiKey}{kind === "openai" && isLocalEndpoint(s.provider.baseUrl) ? " (optional)" : ""}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              className="input"
              dir="ltr"
              type={show ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder={kind === "anthropic" ? t.apiKeyPh : "sk-…"}
              value={keyFor(s.keys, s.provider)}
              onChange={(e) => {
                s.setKey(kind, e.target.value);
                setTest({ state: "idle" });
              }}
            />
            <button className="btn btn-line" onClick={() => setShow(!show)}>{show ? t.hide : t.show}</button>
          </div>
          {kind === "anthropic" && <div className="help">{t.getKey}</div>}
          {kind === "openai" && s.provider.baseUrl.startsWith(GEMINI.baseUrl) && (
            <div className="help">
              {t.geminiHelp}{" "}
              <a href={GEMINI.keyUrl} target="_blank" rel="noopener noreferrer">{t.getGeminiKey}</a>
            </div>
          )}
        </label>

        <label className="check">
          <input type="checkbox" checked={s.rememberKey} onChange={(e) => s.set({ rememberKey: e.target.checked })} />
          <span>
            {t.rememberKey}
            <div className="help">{t.rememberKeyHelp}</div>
          </span>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: kind === "anthropic" ? "1fr 1fr" : "1fr", gap: 12 }}>
          <label>
            <span className="field-label">{t.model}</span>
            {kind === "anthropic" ? (
              <select className="select" value={s.provider.model} onChange={(e) => s.setProvider({ model: e.target.value })}>
                {ANTHROPIC_MODELS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <input className="input" dir="ltr" list="ollama-models" value={s.provider.model} onChange={(e) => s.setProvider({ model: e.target.value })} onFocus={() => ollamaModels === null && /11434/.test(s.provider.baseUrl) && loadOllama()} />
                <datalist id="ollama-models">
                  {(ollamaModels ?? []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            )}
          </label>
          {kind === "anthropic" && (
            <label>
              <span className="field-label">{t.effort}</span>
              <select className="select" value={s.provider.effort} onChange={(e) => s.setProvider({ effort: e.target.value as "low" | "medium" | "high" })}>
                <option value="low">{t.effortLow}</option>
                <option value="medium">{t.effortMedium}</option>
                <option value="high">{t.effortHigh}</option>
              </select>
            </label>
          )}
        </div>

        <details className="adv">
          <summary className="field-label">{t.advanced}</summary>
        {kind === "openai" && (
          <label className="check">
            <input type="checkbox" checked={s.provider.noThink} onChange={(e) => s.setProvider({ noThink: e.target.checked })} />
            <span>{t.noThink}</span>
          </label>
        )}

        <label className="check">
          <input type="checkbox" checked={s.provider.useProxy} onChange={(e) => s.setProvider({ useProxy: e.target.checked })} />
          <span>
            {t.useProxy}
            <div className="help">{t.useProxyHelp}</div>
          </span>
        </label>
        {s.provider.useProxy && (
          <label>
            <span className="field-label">{t.proxyUrl}</span>
            <input className="input" dir="ltr" value={s.provider.proxyUrl} onChange={(e) => s.setProvider({ proxyUrl: e.target.value })} />
          </label>
        )}
        </details>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-line" onClick={runTest} disabled={test.state === "busy"}>
            {test.state === "busy" ? t.testing : t.testConnection}
          </button>
          {test.state === "ok" && (
            <span className="up" style={{ display: "flex", gap: 4, alignItems: "center" }} role="status">
              <IconCheck size={16} /> {t.connectionOk}
            </span>
          )}
          {test.state === "err" && (
            <span style={{ color: "var(--del)", display: "flex", gap: 6, alignItems: "center", fontSize: 13 }} role="alert">
              <IconAlert size={16} /> {test.msg}
            </span>
          )}
        </div>

        <div className="section-title">{d.aiScore}</div>
        <label className="check">
          <input type="checkbox" checked={s.detect.autoCheck} onChange={(e) => s.setDetect({ autoCheck: e.target.checked })} />
          <span>
            {d.autoCheck}
            <div className="help">{d.autoCheckHelp}</div>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={s.detect.judge} onChange={(e) => s.setDetect({ judge: e.target.checked })} />
          <span>
            {d.useJudge}
            <div className="help">{d.useJudgeHelp}</div>
          </span>
        </label>
        <div>
          <div className="field-label">{d.detectors}</div>
          <p className="help" style={{ marginTop: 0 }}>{d.detectorsHelp}</p>
          <p className="help">{d.skipHint}</p>
          <div className="det-list">
            {ADAPTERS.map((a) => {
              const on = !!s.detect.enabled[a.id];
              return (
                <div className="det-item" key={a.id} data-on={on || undefined}>
                  <label className="check">
                    <input type="checkbox" checked={on} onChange={(e) => s.setDetect({ enabled: { ...s.detect.enabled, [a.id]: e.target.checked } })} />
                    <span>{a.label}</span>
                    <a className="help" href={a.site} target="_blank" rel="noopener noreferrer" style={{ marginInlineStart: "auto", marginTop: 0 }}>{d.getKey}</a>
                  </label>
                  {on && (
                    <>
                      <p className="help" style={{ marginTop: 0, whiteSpace: "pre-line" }}>{a.fields.includes("email") ? d.detStepsEmail : d.detSteps}</p>
                      {a.fields.map((f) => (
                        <label key={f}>
                          <span className="field-label">{f === "email" ? d.email : d.apiKey}</span>
                          <input
                            className="input"
                            dir="ltr"
                            type={f === "email" ? "email" : "password"}
                            inputMode={f === "email" ? "email" : "text"}
                            autoComplete="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            placeholder={f === "email" ? "name@example.com" : "••••••••"}
                            value={s.keys.det[a.id]?.[f] ?? ""}
                            onChange={(e) => {
                              s.setDetKey(a.id, f, e.target.value);
                              setDetTest((m) => (m[a.id] ? { ...m, [a.id]: undefined } : m));
                            }}
                          />
                        </label>
                      ))}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <button className="btn btn-line" onClick={() => testDetector(a.id)} disabled={detTest[a.id]?.state === "busy"}>
                          {detTest[a.id]?.state === "busy" ? d.testingKey : d.testKey}
                        </button>
                        {detTest[a.id]?.state === "ok" && (
                          <span className="up" style={{ display: "flex", gap: 4, alignItems: "center" }} role="status">
                            <IconCheck size={16} /> {d.keyOk}
                          </span>
                        )}
                        {detTest[a.id]?.state === "err" && (
                          <span style={{ color: "var(--del)", display: "flex", gap: 6, alignItems: "center", fontSize: 13 }} role="alert">
                            <IconAlert size={16} /> {detTest[a.id]?.msg}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="section-title">{t.interface}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>
            <span className="field-label">{t.language}</span>
            <select className="select" value={s.uiLang} onChange={(e) => s.set({ uiLang: e.target.value as UILang })}>
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
            </select>
          </label>
          <label>
            <span className="field-label">{t.theme}</span>
            <select className="select" value={s.theme} onChange={(e) => s.set({ theme: e.target.value as Theme })}>
              <option value="system">{t.themeSystem}</option>
              <option value="light">{t.themeLight}</option>
              <option value="dark">{t.themeDark}</option>
            </select>
          </label>
        </div>

        <div className="section-title">{t.privacy}</div>
        <label className="check">
          <input type="checkbox" checked={s.saveHistory} onChange={(e) => s.set({ saveHistory: e.target.checked })} />
          <span>
            {t.saveHistory}
            <div className="help">{t.saveHistoryHelp}</div>
          </span>
        </label>
        <div style={{ border: "1px solid var(--del-soft)", background: "var(--del-soft)", borderRadius: 10, padding: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 600 }}>{t.panicWipe}</div>
            <div className="help">{t.panicWipeHelp}</div>
          </div>
          <button
            className="btn btn-line btn-danger"
            onClick={async () => {
              if (!confirm(t.panicConfirm)) return;
              resetHistoryHandle();
              await panicWipe();
              onWiped();
              onClose();
            }}
          >
            {t.panicWipe}
          </button>
        </div>
        <p className="help" style={{ margin: 0 }}>{fmt(t.privacyLine, {})}</p>
      </div>
    </Dialog>
  );
}

export const isEngineError = (e: unknown): e is EngineError => e instanceof EngineError;
