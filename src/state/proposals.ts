import { useCallback, useEffect, useState } from "react";
import type { Brand, CatalogElement, Line, Proposal } from "../types";
import { generateQuoteRef, QUOTE_REF_PATTERN } from "../lib/quoteRef";
import type { BackupState } from "../lib/backup";

const KEY = "proposal-builder.proposals.v1";

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** `takenRefs`: references already in use, so the new one is unique. */
export function newProposal(brand: Brand, takenRefs: Iterable<string> = [], venue?: { venue: string; location: string }): Proposal {
  const now = new Date();
  return {
    id: uid(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    client: { name: "", contact: "", date: "", dates: [], venue: venue?.venue ?? "", location: venue?.location ?? "" },
    ref: generateQuoteRef(takenRefs, now),
    eventType: null,
    style: null,
    lines: [],
    coordinationPct: brand.coordinationPct,
    grandTotal: null,
    terms: [...brand.terms],
    notes: "",
    status: "draft",
  };
}

export function lineFromElement(e: CatalogElement): Line {
  return {
    uid: uid(),
    elementId: e.id,
    name: e.name,
    category: e.category,
    unit: e.unit,
    qty: e.defaultQty,
    rate: e.defaultPrice,
    notes: "",
    optional: false,
    upgrades: (e.upgrades ?? []).map((u) => ({ ...u, mode: "off" as const })),
    ...(e.perGuest ? { perGuest: e.perGuest } : {}),
  };
}

export function customLine(category: string): Line {
  return { uid: uid(), elementId: null, name: "Custom element", category, unit: "lump sum", qty: 1, rate: 0, notes: "", optional: false, upgrades: [] };
}

/**
 * Gives every proposal a unique quotation reference: drafts saved before references
 * existed get one dated from when they were created, and a repeated reference
 * (e.g. from an import) is replaced on the newer proposal.
 */
export function ensureUniqueRefs(list: Proposal[]): Proposal[] {
  const seen = new Set<string>();
  const byAge = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const fixed = new Map<string, string>();
  for (const p of byAge) {
    let ref = p.ref?.trim();
    if (!ref || seen.has(ref)) {
      const created = new Date(p.createdAt);
      ref = generateQuoteRef(seen, isNaN(created.getTime()) ? new Date() : created);
      fixed.set(p.id, ref);
    }
    seen.add(ref);
  }
  return fixed.size ? list.map((p) => (fixed.has(p.id) ? { ...p, ref: fixed.get(p.id)! } : p)) : list;
}

export const isGeneratedRef = (ref: string) => QUOTE_REF_PATTERN.test(ref);

function read(): Proposal[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? ensureUniqueRefs(list) : [];
  } catch {
    return [];
  }
}

function write(list: Proposal[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked — the session keeps working in memory */
  }
}

export function isProposal(x: unknown): x is Proposal {
  const p = x as Proposal;
  return !!p && typeof p.id === "string" && !!p.client && Array.isArray(p.lines) && Array.isArray(p.terms);
}

export function useProposals() {
  const [list, setList] = useState<Proposal[]>(read);
  useEffect(() => write(list), [list]);

  const save = useCallback((p: Proposal) => {
    const next = { ...p, updatedAt: new Date().toISOString() };
    setList((l) => (l.some((x) => x.id === p.id) ? l.map((x) => (x.id === p.id ? next : x)) : [next, ...l]));
  }, []);
  const remove = useCallback((id: string) => setList((l) => l.filter((x) => x.id !== id)), []);
  const duplicate = useCallback(
    (p: Proposal) => {
      const now = new Date();
      const copy: Proposal = {
        ...structuredClone(p),
        id: uid(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        ref: generateQuoteRef(list.map((x) => x.ref), now),
        client: { ...p.client, name: p.client.name ? `${p.client.name} (copy)` : "" },
        // a copy is a new quotation: it starts as a draft, not linked to the original's share
        status: "draft",
        statusAt: undefined,
        sentAt: undefined,
        shareId: undefined,
      };
      setList((l) => [copy, ...l]);
      return copy;
    },
    [list],
  );
  /** Adds imported proposals; ones with an existing id are replaced. */
  const importMany = useCallback((items: Proposal[]) => {
    setList((l) => {
      const ids = new Set(items.map((x) => x.id));
      return ensureUniqueRefs([...items, ...l.filter((x) => !ids.has(x.id))]);
    });
  }, []);
  const refs = list.map((p) => p.ref);

  return { list, refs, save, remove, duplicate, importMany };
}

export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const BACKUP_KEY = "event-bridge.last-backup.v1";

/** When "Back up all" last ran and any "Remind me later", kept per device. */
export function readBackupState(): BackupState {
  try {
    const s = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "null") as BackupState | null;
    return s && typeof s === "object" ? { at: Number(s.at) || undefined, snoozedUntil: Number(s.snoozedUntil) || undefined } : {};
  } catch {
    return {};
  }
}

export function writeBackupState(s: BackupState) {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(s));
  } catch {
    /* blocked storage: the reminder comes back next visit */
  }
}
