"use client";
// Optional local history in IndexedDB. Never leaves the browser.
import { openDB, type IDBPDatabase } from "idb";

export interface HistoryItem {
  id: string;
  createdAt: number;
  input: string;
  output: string;
  mode: string;
  lang: string;
  /** Local AI-likeness of the input and the output when it was saved (0–100). */
  scoreIn?: number;
  scoreOut?: number;
}

/** Only the most recent conversions are kept; older ones are dropped on save. */
export const HISTORY_LIMIT = 100;

let dbp: Promise<IDBPDatabase> | null = null;
const db = () =>
  (dbp ??= openDB("insan", 1, {
    upgrade(d) {
      d.createObjectStore("history", { keyPath: "id" });
    },
  }));

export async function addHistory(item: Omit<HistoryItem, "id" | "createdAt">) {
  const d = await db();
  await d.put("history", { ...item, id: crypto.randomUUID(), createdAt: Date.now() });
  const all = (await d.getAll("history")) as HistoryItem[];
  if (all.length > HISTORY_LIMIT) {
    const old = all.sort((a, b) => b.createdAt - a.createdAt).slice(HISTORY_LIMIT);
    const tx = d.transaction("history", "readwrite");
    await Promise.all([...old.map((h) => tx.store.delete(h.id)), tx.done]);
  }
}

export async function listHistory(query = ""): Promise<HistoryItem[]> {
  const d = await db();
  const all = (await d.getAll("history")) as HistoryItem[];
  const q = query.trim().toLowerCase();
  return all
    .filter((h) => !q || h.input.toLowerCase().includes(q) || h.output.toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteHistory(id: string) {
  await (await db()).delete("history", id);
}

export async function clearHistory() {
  await (await db()).clear("history");
}

/** Called by panic wipe so a fresh DB handle is opened next time. */
export function resetHistoryHandle() {
  dbp?.then((d) => d.close()).catch(() => {});
  dbp = null;
}
