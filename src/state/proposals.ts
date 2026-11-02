import { useCallback, useEffect, useState } from "react";
import type { Brand, CatalogElement, Line, Proposal } from "../types";

const KEY = "proposal-builder.proposals.v1";

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function newProposal(brand: Brand): Proposal {
  const now = new Date().toISOString();
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    client: { name: "", contact: "", date: "", venue: "", location: "" },
    ref: "",
    eventType: null,
    style: null,
    lines: [],
    coordinationPct: brand.coordinationPct,
    grandTotal: null,
    terms: [...brand.terms],
    notes: "",
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
  };
}

export function customLine(category: string): Line {
  return { uid: uid(), elementId: null, name: "Custom element", category, unit: "lump sum", qty: 1, rate: 0, notes: "", optional: false, upgrades: [] };
}

function read(): Proposal[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
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
  const duplicate = useCallback((p: Proposal) => {
    const now = new Date().toISOString();
    const copy: Proposal = {
      ...structuredClone(p),
      id: uid(),
      createdAt: now,
      updatedAt: now,
      client: { ...p.client, name: p.client.name ? `${p.client.name} (copy)` : "" },
    };
    setList((l) => [copy, ...l]);
    return copy;
  }, []);
  /** Adds imported proposals; ones with an existing id are replaced. */
  const importMany = useCallback((items: Proposal[]) => {
    setList((l) => {
      const ids = new Set(items.map((x) => x.id));
      return [...items, ...l.filter((x) => !ids.has(x.id))];
    });
  }, []);

  return { list, save, remove, duplicate, importMany };
}

export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
