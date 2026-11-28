// The seating plan as a PDF: the floor plan, then each table's guests, then an A–Z "find your table" list for the
// welcome desk. Loaded through `await import("./exportSeating")` like the other exports, so pdfmake stays lazy.
// layoutSvg is pure and uses fixed paper colours (a printed plan doesn't follow the screen theme).
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Brand, Proposal, VenueLayout } from "../types";
import { KINDS, drawOrder, isTable, seatPositions } from "./layout";
import { guestOf, tablesOf, type Plan } from "./seating";
import { listOf, guestFunctions } from "./guestList";
import { functionHeading } from "./functions";
import { safeFilePart } from "./format";
import { renderPdf } from "./exportPdf";
import { saveBlob } from "./files";

const INK = "#2e2620";
const MUTED = "#8e8377";
const GOLD = "#b79a68";
const SOFT = "#f4eee3";
const LINE = "#d8cfbf";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** the floor plan as a standalone SVG string, seats filled where someone sits (and numbered, for a printed plan) */
export function layoutSvg(l: VenueLayout, plan: Plan = {}, opts: { seatNumbers?: boolean; transparent?: boolean } = {}): string {
  const pad = 1;
  const parts: string[] = [`<rect x="0" y="0" width="${l.w}" height="${l.h}" fill="${opts.transparent ? "none" : "#ffffff"}" stroke="${INK}" stroke-width="0.08"/>`];
  for (const it of drawOrder(l.items)) {
    const k = KINDS[it.kind];
    const g: string[] = [];
    if (isTable(it))
      seatPositions(it).forEach((s, i) => {
        const taken = !!plan[it.id]?.[i];
        g.push(`<circle cx="${s.x}" cy="${s.y}" r="0.2" fill="${taken ? GOLD : "#ffffff"}" stroke="${MUTED}" stroke-width="0.03"/>`);
        if (opts.seatNumbers) g.push(`<text x="${s.x}" y="${s.y + 0.06}" text-anchor="middle" font-size="0.17" fill="${INK}" transform="rotate(${-it.rot} ${s.x} ${s.y})">${i + 1}</text>`);
      });
    if (it.kind !== "row") {
      g.push(k.round
        ? `<ellipse rx="${it.w / 2}" ry="${it.h / 2}" fill="#ffffff" stroke="${GOLD}" stroke-width="0.05"/>`
        : it.kind === "label" ? "" : `<rect x="${-it.w / 2}" y="${-it.h / 2}" width="${it.w}" height="${it.h}" fill="${k.zone ? SOFT : "#ffffff"}" stroke="${k.zone ? LINE : GOLD}" stroke-width="0.05"/>`);
    }
    if (it.kind !== "wall") {
      const size = it.kind === "row" ? 0.25 : Math.max(0.22, Math.min(0.45, Math.min(it.w, it.h) * 0.3));
      const y = it.kind === "row" ? -it.h / 2 - 0.12 : size * 0.35;
      g.push(`<text x="0" y="${y}" text-anchor="middle" font-size="${size}" fill="${it.kind === "label" ? INK : MUTED}" transform="rotate(${-it.rot})">${esc(it.label || k.label)}</text>`);
    }
    parts.push(`<g transform="translate(${it.x} ${it.y}) rotate(${it.rot})">${g.join("")}</g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${l.w + pad * 2} ${l.h + pad * 2}" width="${(l.w + pad * 2) * 20}" height="${(l.h + pad * 2) * 20}" font-family="Roboto">${parts.join("")}</svg>`;
}

/** each table's people in seat order, and everyone A–Z with their table */
export function seatingLists(p: Proposal, l: VenueLayout, plan: Plan) {
  const guests = new Map(listOf(p).guests.map((g) => [g.id, g]));
  const name = (k: string) => {
    const g = guests.get(guestOf(k));
    if (!g) return "Guest";
    const n = Number(k.slice(k.lastIndexOf(":") + 1));
    const count = (plan ? Object.values(plan).flat().filter((x) => x && guestOf(x) === g.id).length : 1);
    return count > 1 ? `${g.name} (${n + 1})` : g.name;
  };
  const tables = tablesOf(l).map((t) => ({ table: t.label || KINDS[t.kind].label, seats: t.seats ?? 0, people: (plan[t.id] ?? []).filter((k): k is string => !!k).map(name) }));
  const index = new Map<string, Set<string>>();
  for (const t of tablesOf(l))
    for (const k of plan[t.id] ?? []) if (k) {
      const g = guests.get(guestOf(k));
      if (!g) continue;
      const s = index.get(g.name) ?? new Set<string>();
      s.add(t.label || KINDS[t.kind].label);
      index.set(g.name, s);
    }
  const az = [...index.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([n, ts]) => ({ name: n, tables: [...ts].join(", ") }));
  return { tables, az };
}

export function buildSeatingDoc(p: Proposal, fnId: string, l: VenueLayout, plan: Plan, brand: Pick<Brand, "company">, logo?: string): TDocumentDefinitions {
  const fn = guestFunctions(p).find((f) => f.id === fnId);
  const title = `${p.client.name || "Seating plan"}${fn?.id ? ` · ${functionHeading(fn)}` : ""}`;
  const { tables, az } = seatingLists(p, l, plan);
  const seated = tables.reduce((n, t) => n + t.people.length, 0);
  const content: Content[] = [
    {
      columns: [
        ...(logo ? [{ image: `data:image/png;base64,${logo}`, width: 70 }] : []),
        { stack: [{ text: "Seating plan", fontSize: 18, color: INK }, { text: title, fontSize: 10, color: MUTED, margin: [0, 2, 0, 0] }] , margin: [logo ? 10 : 0, 4, 0, 0] },
      ],
      margin: [0, 0, 0, 10],
    } as Content,
    { svg: layoutSvg(l, plan), fit: [523, 560], alignment: "center" } as unknown as Content,
    { text: `${seated} seated at ${tables.length} tables · room ${l.w} × ${l.h} m`, fontSize: 8, color: MUTED, alignment: "center", margin: [0, 6, 0, 0] },
    { text: "Tables", fontSize: 14, color: INK, pageBreak: "before", margin: [0, 0, 0, 8] },
    {
      columns: [0, 1, 2].map((c) => ({
        stack: tables.filter((_, i) => i % 3 === c).map((t) => ({
          stack: [
            { text: `${t.table}  `, bold: true, fontSize: 10, color: INK, margin: [0, 6, 0, 2] },
            { text: `${t.people.length} of ${t.seats}`, fontSize: 7.5, color: MUTED },
            ...(t.people.length ? t.people.map((n) => ({ text: n, fontSize: 9 })) : [{ text: "Empty", fontSize: 9, color: MUTED }]),
          ],
          unbreakable: true,
        })),
      })),
      columnGap: 16,
    } as Content,
    ...(az.length
      ? [
          { text: "Find your table", fontSize: 14, color: INK, pageBreak: "before", margin: [0, 0, 0, 8] } as Content,
          {
            table: { headerRows: 1, widths: ["*", 140], body: [[{ text: "Guest", bold: true }, { text: "Table", bold: true }], ...az.map((r) => [r.name, r.tables])] },
            layout: { hLineColor: () => LINE, vLineColor: () => LINE, hLineWidth: () => 0.5, vLineWidth: () => 0, paddingTop: () => 4, paddingBottom: () => 4 },
            fontSize: 9.5,
          } as Content,
        ]
      : []),
  ];
  return {
    pageSize: "A4",
    pageMargins: [36, 32, 36, 40],
    info: { title: `Seating plan ${title}`, author: brand.company },
    defaultStyle: { font: "Roboto", fontSize: 9, color: INK },
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `${brand.company} · ${title}`, fontSize: 7.5, color: MUTED },
        { text: `Page ${page} of ${pages}`, fontSize: 7.5, color: MUTED, alignment: "right" },
      ],
      margin: [36, 12, 36, 0],
    }),
    content,
  };
}

export async function downloadSeating(p: Proposal, fnId: string, l: VenueLayout, plan: Plan, brand: Brand) {
  const blob = await renderPdf(brand, (logo) => buildSeatingDoc(p, fnId, l, plan, brand, logo));
  const fn = guestFunctions(p).find((f) => f.id === fnId);
  saveBlob(blob, `${["Seating", safeFilePart(p.client.name), fn?.id ? safeFilePart(fn.label) : "", fn?.date || p.client.date || ""].filter(Boolean).join("_")}.pdf`);
}
