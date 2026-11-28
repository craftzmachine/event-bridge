// Venue drawings under floor plans, kept in their own IndexedDB database (images are too big for localStorage, and
// the expenses database keeps its own version). They stay on this device: a plan moved elsewhere keeps the backdrop's
// position and scale and asks for the image again.
import { useEffect, useState } from "react";

const DB = "event-bridge-backdrops";
const STORE = "images";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const saveBackdrop = (id: string, blob: Blob) => run("readwrite", (s) => s.put(blob, id)).then(() => undefined);
export const loadBackdrop = (id: string) => run<Blob | undefined>("readonly", (s) => s.get(id) as IDBRequest<Blob | undefined>);

/** an object URL for the stored image; "missing" when it isn't on this device */
export function useBackdropUrl(id: string | undefined): string | "missing" | null {
  const [url, setUrl] = useState<string | "missing" | null>(null);
  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    let live = true;
    let made: string | null = null;
    loadBackdrop(id)
      .then((blob) => {
        if (!live) return;
        if (!blob) return setUrl("missing");
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => live && setUrl("missing"));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);
  return url;
}
