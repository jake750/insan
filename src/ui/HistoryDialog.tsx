"use client";
import { useEffect, useState } from "react";
import { Dialog } from "./Dialog";
import { clearHistory, deleteHistory, listHistory, type HistoryItem } from "./history";
import { MODE_LABELS, type Strings, type UILang } from "./i18n";
import { IconTrash } from "./Icons";
import type { Mode } from "../engine/types";

export function HistoryDialog({ t, ui, enabled, onClose, onOpen }: { t: Strings; ui: UILang; enabled: boolean; onClose: () => void; onOpen: (h: HistoryItem) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const refresh = () => listHistory(q).then(setItems).catch(() => setItems([]));
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const dateFmt = new Intl.DateTimeFormat(ui, { dateStyle: "medium", timeStyle: "short" });

  return (
    <Dialog title={t.history} onClose={onClose} closeLabel={t.close}>
      <div className="dialog-body">
        {!enabled && <div className="notice" style={{ margin: 0 }}>{t.historyOff}</div>}
        <input className="input" type="search" placeholder={t.searchHistory} aria-label={t.searchHistory} value={q} onChange={(e) => setQ(e.target.value)} />
        {items && items.length === 0 && <p className="help" style={{ margin: 0 }}>{t.historyEmpty}</p>}
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {items?.map((h) => (
            <li key={h.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <button className="btn" style={{ flex: 1, height: "auto", padding: 0, display: "block", textAlign: "start", whiteSpace: "normal" }} onClick={() => onOpen(h)}>
                <div className="help" style={{ margin: 0 }}>
                  {dateFmt.format(h.createdAt)} ({MODE_LABELS[ui][h.mode as Mode] ?? h.mode})
                </div>
                <div dir="auto" style={{ color: "var(--ink)", fontFamily: "var(--font-text)", fontSize: 14.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {h.output}
                </div>
              </button>
              <button className="btn btn-icon btn-danger" aria-label={t.delete} title={t.delete} onClick={() => deleteHistory(h.id).then(refresh)}>
                <IconTrash size={16} />
              </button>
            </li>
          ))}
        </ul>
        {items && items.length > 0 && (
          <button className="btn btn-line btn-danger" style={{ alignSelf: "flex-start" }} onClick={() => clearHistory().then(refresh)}>
            {t.wipeHistory}
          </button>
        )}
      </div>
    </Dialog>
  );
}
