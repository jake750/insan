"use client";
import { useState } from "react";
import { makeChat } from "../engine/providers";
import { ANTHROPIC_MODELS, EngineError } from "../engine/types";
import { Dialog } from "./Dialog";
import { fmt, type Strings, type UILang } from "./i18n";
import { resetHistoryHandle } from "./history";
import { IconAlert, IconCheck } from "./Icons";
import { panicWipe, useStore, type Theme } from "./store";

const ENDPOINTS = [
  { label: "Ollama (local)", url: "http://localhost:11434/v1", model: "qwen3.5:4b", noThink: true },
  { label: "LM Studio (local)", url: "http://localhost:1234/v1", model: "", noThink: true },
  { label: "OpenAI", url: "https://api.openai.com/v1", model: "gpt-5.1", noThink: false },
  { label: "OpenRouter", url: "https://openrouter.ai/api/v1", model: "", noThink: false },
];

export function SettingsDialog({ t, onClose, errText, onWiped }: { t: Strings; onClose: () => void; errText: (e: unknown) => string; onWiped: () => void }) {
  const s = useStore();
  const [show, setShow] = useState(false);
  const [test, setTest] = useState<{ state: "idle" | "busy" | "ok" | "err"; msg?: string }>({ state: "idle" });
  const [ollamaModels, setOllamaModels] = useState<string[] | null>(null);
  const kind = s.provider.kind;

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
              {/localhost|127\.0\.0\.1/.test(s.provider.baseUrl) && <div className="help">{t.ollamaHelp}</div>}
            </label>
          </>
        )}

        <label>
          <span className="field-label">{t.apiKey}{kind === "openai" && /localhost|127\.0\.0\.1/.test(s.provider.baseUrl) ? " (optional)" : ""}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              className="input"
              dir="ltr"
              type={show ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder={kind === "anthropic" ? t.apiKeyPh : "sk-…"}
              value={s.keys[kind]}
              onChange={(e) => {
                s.setKey(kind, e.target.value);
                setTest({ state: "idle" });
              }}
            />
            <button className="btn btn-line" onClick={() => setShow(!show)}>{show ? t.hide : t.show}</button>
          </div>
          {kind === "anthropic" && <div className="help">{t.getKey}</div>}
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
