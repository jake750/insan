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
}

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
