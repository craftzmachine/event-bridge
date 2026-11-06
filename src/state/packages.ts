// Packages: ready-made starting points for a proposal. The team's come from public/config/packages.json;
// a planner's own ("Save as package") are kept on their device.
import { useCallback, useState } from "react";
import type { Brand, Proposal, ProposalPackage } from "../types";
import { newProposal, uid } from "./proposals";

const KEY = "event-bridge.packages.v1";

function read(): ProposalPackage[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((x) => x && typeof x.id === "string" && Array.isArray(x.lines)) : [];
  } catch {
    return [];
  }
}

function write(list: ProposalPackage[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked: the package lasts for this visit only */
  }
}

/**
 * The occasion and its elements, without the client, dates, payments, status or internal costs.
 * Functions keep their names but lose their dates, which belong to one wedding.
 */
export function packageFromProposal(p: Proposal, name: string, id = `mine-${uid()}`): ProposalPackage {
  return {
    id,
    name: name.trim() || "Untitled package",
    eventType: p.eventType,
    style: p.style,
    lines: p.lines.map(({ cost: _cost, ...l }) => l),
    ...(p.functions?.length ? { functions: p.functions.map((f) => ({ ...f, date: "" })) } : {}),
    terms: [...p.terms],
    coordinationPct: p.coordinationPct,
    notes: p.notes,
  };
}

/** A fresh proposal from a package: a new id and reference, new line ids, today's date, no client yet. */
export function proposalFromPackage(pk: ProposalPackage, brand: Brand, takenRefs: Iterable<string>): Proposal {
  const p = newProposal(brand, takenRefs);
  const fnIds = new Map((pk.functions ?? []).map((f) => [f.id, `f-${uid()}`]));
  return {
    ...p,
    eventType: pk.eventType,
    style: pk.style,
    lines: pk.lines.map(({ cost: _cost, ...l }) => ({ ...l, uid: uid(), fn: l.fn ? fnIds.get(l.fn) : undefined, upgrades: l.upgrades.map((u) => ({ ...u })) })),
    ...(pk.functions?.length ? { functions: pk.functions.map((f) => ({ id: fnIds.get(f.id)!, label: f.label, date: "" })) } : {}),
    terms: pk.terms?.length ? [...pk.terms] : p.terms,
    coordinationPct: pk.coordinationPct ?? p.coordinationPct,
    notes: pk.notes ?? "",
  };
}

export function usePackages() {
  const [mine, setMine] = useState<ProposalPackage[]>(read);
  const save = useCallback((pk: ProposalPackage) => {
    setMine((l) => {
      const next = [pk, ...l.filter((x) => x.id !== pk.id)];
      write(next);
      return next;
    });
  }, []);
  const remove = useCallback((id: string) => {
    setMine((l) => {
      const next = l.filter((x) => x.id !== id);
      write(next);
      return next;
    });
  }, []);
  return { mine, save, remove };
}
