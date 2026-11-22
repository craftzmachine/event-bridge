// Expenses, their proof images and handovers, kept on this device in IndexedDB (screenshots are too big for
// localStorage). Phase 4 moves this to the server; until then a handover pack is how they move between people.
import { useCallback, useEffect, useState } from "react";
import type { Expense } from "../lib/expenses";
import type { Advance } from "../lib/advances";
import type { ReceivedHandover, SentHandover } from "../lib/handover";

const DB = "event-bridge";
// 2: the "advances" store (staff advances)
const VERSION = 2;
const CATEGORIES = "event-bridge.expense-categories.v1";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("expenses")) db.createObjectStore("expenses", { keyPath: "id" }).createIndex("eventId", "eventId");
      if (!db.objectStoreNames.contains("proofs")) db.createObjectStore("proofs");
      if (!db.objectStoreNames.contains("sent")) db.createObjectStore("sent", { keyPath: "id" }).createIndex("eventId", "eventId");
      if (!db.objectStoreNames.contains("received")) db.createObjectStore("received", { keyPath: "id" });
      if (!db.objectStoreNames.contains("advances")) db.createObjectStore("advances", { keyPath: "id" }).createIndex("eventId", "eventId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("This browser can't store expenses (IndexedDB is unavailable, for example in a private window)."));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
const db = () => (dbPromise ??= open());

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve((req ? req.result : undefined) as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("The change couldn't be saved."));
      }),
  );
}

export const listExpenses = (eventId?: string) =>
  run<Expense[]>("expenses", "readonly", (s) => (eventId ? s.index("eventId").getAll(eventId) : s.getAll()));
export const putExpense = (e: Expense) => run<void>("expenses", "readwrite", (s) => s.put(e));
export const putExpenses = (list: Expense[]) => run<void>("expenses", "readwrite", (s) => void list.forEach((e) => s.put(e)));
export const getProof = (fileId: string) => run<Blob | undefined>("proofs", "readonly", (s) => s.get(fileId));
export const putProof = (fileId: string, blob: Blob) => run<void>("proofs", "readwrite", (s) => s.put(blob, fileId));

export const listSent = (eventId: string) => run<SentHandover[]>("sent", "readonly", (s) => s.index("eventId").getAll(eventId));
export const putSent = (h: SentHandover) => run<void>("sent", "readwrite", (s) => s.put(h));
export const listReceived = () => run<ReceivedHandover[]>("received", "readonly", (s) => s.getAll());
export const getReceived = (id: string) => run<ReceivedHandover | undefined>("received", "readonly", (s) => s.get(id));
export const putReceived = (h: ReceivedHandover) => run<void>("received", "readwrite", (s) => s.put(h));

export const listAdvances = (eventId?: string) =>
  run<Advance[]>("advances", "readonly", (s) => (eventId ? s.index("eventId").getAll(eventId) : s.getAll()));
export const putAdvance = (a: Advance) => run<void>("advances", "readwrite", (s) => s.put(a));
export const putAdvances = (list: Advance[]) => run<void>("advances", "readwrite", (s) => void list.forEach((a) => s.put(a)));

/**
 * After a reconciled handover: removes this event's expenses and their images from this device, and its closed
 * advances. Open advances stay, since money is still out.
 */
export async function clearEvent(eventId: string) {
  const list = await listExpenses(eventId);
  await run<void>("proofs", "readwrite", (s) => void list.forEach((e) => e.proof && s.delete(e.proof.fileId)));
  await run<void>("expenses", "readwrite", (s) => void list.forEach((e) => s.delete(e.id)));
  const closed = (await listAdvances(eventId)).filter((a) => a.closed);
  await run<void>("advances", "readwrite", (s) => void closed.forEach((a) => s.delete(a.id)));
}

/** Removes a received handover and its copies of the images. */
export async function deleteReceived(h: ReceivedHandover) {
  await run<void>("proofs", "readwrite", (s) => void h.pack.expenses.forEach((e) => e.proof && s.delete(receivedFileId(h.id, e.proof.fileId))));
  await run<void>("received", "readwrite", (s) => s.delete(h.id));
}

/** A received pack's images are stored under their own keys, apart from this device's own proof. */
export const receivedFileId = (handoverId: string, fileId: string) => `rx:${handoverId}:${fileId}`;

/** One event's expenses, reloaded after every change. */
export function useEventExpenses(eventId: string) {
  const [list, setList] = useState<Expense[] | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(() => {
    listExpenses(eventId)
      .then((l) => {
        setList(l);
        setError("");
      })
      .catch((e: Error) => {
        setList([]);
        setError(e.message);
      });
  }, [eventId]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const save = useCallback(
    async (e: Expense) => {
      await putExpense(e);
      refresh();
    },
    [refresh],
  );
  return { list, error, refresh, save };
}

/** One event's staff advances, reloaded after every change. */
export function useEventAdvances(eventId: string) {
  const [list, setList] = useState<Advance[]>([]);
  const refresh = useCallback(() => {
    listAdvances(eventId).then((l) => setList(l.sort((a, b) => a.createdAt.localeCompare(b.createdAt)))).catch(() => setList([]));
  }, [eventId]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const save = useCallback(
    async (a: Advance) => {
      await putAdvance(a);
      refresh();
    },
    [refresh],
  );
  return { list, refresh, save };
}

/** Every event's expense count on this device, for the links on the Studio cards and the dashboard. */
export function useExpenseCounts() {
  const [counts, setCounts] = useState<Map<string, { count: number; missingProof: number }>>(new Map());
  useEffect(() => {
    listExpenses()
      .then((all) => {
        const m = new Map<string, { count: number; missingProof: number }>();
        for (const e of all) {
          if (e.removed) continue;
          const c = m.get(e.eventId) ?? { count: 0, missingProof: 0 };
          c.count++;
          if (!e.proof) c.missingProof++;
          m.set(e.eventId, c);
        }
        setCounts(m);
      })
      .catch(() => setCounts(new Map()));
  }, []);
  return counts;
}

export function readCustomCategories(): { id: string; label: string }[] {
  try {
    const x = JSON.parse(localStorage.getItem(CATEGORIES) ?? "[]");
    return Array.isArray(x) ? x.filter((c) => c && typeof c.id === "string" && typeof c.label === "string") : [];
  } catch {
    return [];
  }
}

export function writeCustomCategories(list: { id: string; label: string }[]) {
  try {
    localStorage.setItem(CATEGORIES, JSON.stringify(list));
  } catch {
    /* storage blocked: the category lasts for this visit */
  }
}
