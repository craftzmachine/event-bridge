// A list kept in this browser's localStorage, for the office apps (vendors, leads, team tasks, questionnaires).
// Like proposals, it stays on this device; each app offers a JSON export and import to move it.
import { useCallback, useEffect, useState } from "react";

export function readList<T>(key: string, isItem: (x: unknown) => x is T): T[] {
  try {
    const x = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(x) ? x.filter(isItem) : [];
  } catch {
    return [];
  }
}

export function writeList<T>(key: string, list: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* storage full or blocked: the change lasts for this visit */
  }
}

/** The list, saved on every change. `update` builds on the latest list, so quick successive edits don't overwrite each other. */
export function useStoredList<T extends { id: string }>(key: string, isItem: (x: unknown) => x is T) {
  const [list, setList] = useState<T[]>(() => readList(key, isItem));
  useEffect(() => {
    writeList(key, list);
  }, [key, list]);
  // another tab changed it
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setList(readList(key, isItem));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, isItem]);
  const save = useCallback((item: T) => setList((l) => (l.some((x) => x.id === item.id) ? l.map((x) => (x.id === item.id ? item : x)) : [item, ...l])), []);
  const update = useCallback((id: string, fn: (item: T) => T) => setList((l) => l.map((x) => (x.id === id ? fn(x) : x))), []);
  const remove = useCallback((id: string) => setList((l) => l.filter((x) => x.id !== id)), []);
  /** adds imported items, replacing ones with the same id; returns how many came in */
  const importMany = useCallback((items: T[]) => {
    setList((l) => [...items, ...l.filter((x) => !items.some((y) => y.id === x.id))]);
    return items.length;
  }, []);
  return { list, save, update, remove, importMany };
}

/** Downloads a list as a JSON file, for moving it to another device. */
export function downloadList(fileName: string, format: string, items: unknown[]) {
  const blob = new Blob([JSON.stringify({ format, v: 1, exportedAt: new Date().toISOString(), items }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Reads a file made by downloadList (or a bare list); null when it isn't one. */
export async function readListFile<T>(file: File, format: string, isItem: (x: unknown) => x is T): Promise<T[] | null> {
  try {
    const x = JSON.parse(await file.text());
    const items = Array.isArray(x) ? x : x?.format === format ? x.items : null;
    return Array.isArray(items) ? items.filter(isItem) : null;
  } catch {
    return null;
  }
}
