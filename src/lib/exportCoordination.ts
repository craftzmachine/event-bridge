// The on-site coordination sheet as a PDF, in the company branding. Loaded only through
// `await import("./exportCoordination")`, like the other exports, so pdfmake stays out of the main bundle.
// Blank fields print as empty ruled cells, so a sheet can still be finished by hand on the day.
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Brand, Catalog, CoordinationSheet, CoordPerson, Proposal } from "../types";
import {
  DETAIL_ROWS,
  ESCALATION,
  FUNCTION_DUTIES,
  HANDOVER,
  HOSTESS_NOTE,
  HOSTESS_ROLE,
  HOSTESS_STATIONS,
  kindLabel,
  OTHER_DUTIES,
  READINESS,
  REVIEW_ROWS,
  ROLES,
  SECTIONS,
  SHEET_FOOTER,
  SHEET_INTRO,
  SHEET_TITLE,
  sheetFunctions,
  TIMELINE_NOTE,
} from "./coordination";
import { safeFilePart } from "./format";
import { proposalTitle } from "./proposal";
import { renderPdf } from "./exportPdf";
import { saveBlob } from "./files";

const WIDTH = 523; // A4 portrait less 36pt margins

const who = (x: CoordPerson) => [x.name, x.phone].filter((s) => s.trim()).join(" · ");

/** Pure, so tests render it in Node. Each sheet starts on its own page. */
export function buildCoordinationDoc(p: Proposal, sheets: CoordinationSheet[], catalog: Catalog, brand: Brand, logoPng?: string): TDocumentDefinitions {
  const c = { ink: `#${brand.colors.ink}`, accent: `#${brand.colors.accent}`, soft: `#${brand.colors.soft}`, line: `#${brand.colors.line}` };
  const muted = "#7a7068";
  const fns = sheetFunctions(p, proposalTitle(p, catalog) || "Event");

  const grid = { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => c.line, vLineColor: () => c.line, paddingTop: () => 4, paddingBottom: () => 4, paddingLeft: () => 5, paddingRight: () => 5 };
  const head = (t: string): TableCell => ({ text: t, bold: true, fontSize: 8.5, color: c.ink, fillColor: c.soft });
  const label = (t: string): TableCell => ({ text: t, fontSize: 8.5, color: muted });
  // an empty cell keeps a writable height
  const val = (t: string | undefined, bold = false): TableCell => (t && t.trim() ? { text: t, fontSize: 9, bold } : { text: " ", fontSize: 9, margin: [0, 3, 0, 3] });
  const fixed = (t: string): TableCell => ({ text: t, fontSize: 8.5 });
  const table = (widths: (number | string)[], body: TableCell[][], headerRows = 1): Content => ({ table: { widths, headerRows, dontBreakRows: true, body }, layout: grid, margin: [0, 4, 0, 0] });
  const note = (t: string): Content => ({ text: t, fontSize: 8, color: muted, italics: true, margin: [0, 4, 0, 0] });
  const box = (on: boolean, text: string): Content => ({
    columns: [
      {
        width: 12,
        canvas: [
          { type: "rect", x: 0, y: 1.5, w: 8, h: 8, lineWidth: 0.7, lineColor: c.ink },
          ...(on ? [{ type: "polyline" as const, points: [{ x: 1.6, y: 5.6 }, { x: 3.6, y: 7.8 }, { x: 7, y: 2.8 }], lineWidth: 1.2, lineColor: c.accent }] : []),
        ],
      },
      { text, fontSize: 9, width: "*" },
    ],
    columnGap: 4,
    margin: [0, 2, 0, 2],
  });
  let n = 0;
  const section = (title: string, extra = ""): Content => {
    n += 1;
    return {
      stack: [
        { text: [`${n}. ${title}`, extra ? { text: `  ·  ${extra}`, color: muted, bold: false } : ""], bold: true, fontSize: 11, color: c.accent, margin: [0, 12, 0, 2] },
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: WIDTH, y2: 0, lineWidth: 0.6, lineColor: c.accent }] },
      ],
      unbreakable: true,
    };
  };

  const sheetContent = (s: CoordinationSheet, i: number): Content[] => {
    n = 0;
    const fn = fns.find((f) => f.id === s.fnId);
    const d = s.details;
    const duties: Content =
      s.kind === "other"
        ? { text: OTHER_DUTIES, fontSize: 9, margin: [0, 4, 0, 0] }
        : table([90, "*"], [[head("Owner"), head("Execution responsibilities")], ...FUNCTION_DUTIES[s.kind].map((r) => [{ text: r.owner, bold: true, fontSize: 8.5 }, fixed(r.duties)])]);
    return [
      {
        columns: [
          logoPng ? { image: `data:image/png;base64,${logoPng}`, width: 86 } : { text: brand.company, bold: true, fontSize: 14 },
          {
            stack: [
              { text: SHEET_TITLE.toUpperCase(), bold: true, fontSize: 11.5, color: c.accent, characterSpacing: 1.2, alignment: "right" },
              { text: [p.client.name || "Client", fn ? ` · ${fn.label}` : ""].join(""), fontSize: 9.5, alignment: "right", margin: [0, 3, 0, 0] },
              { text: `Quotation ${p.ref} · internal, not for the client`, fontSize: 8, color: muted, alignment: "right" },
            ],
          },
        ],
        ...(i > 0 ? { pageBreak: "before" as const } : {}),
      },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: WIDTH, y2: 0, lineWidth: 1, lineColor: c.accent }], margin: [0, 8, 0, 6] },
      { text: SHEET_INTRO, fontSize: 8.5, color: muted },

      section(SECTIONS[0]),
      table(
        [170, "*"],
        [
          [head("Field"), head("Details")],
          [label("Client / couple"), val(d.client, true)],
          [label("Function & date"), val(d.functionDate)],
          [label("Venue / spaces"), val(d.spaces)],
          [label("Guest count"), val(d.guests)],
          [label("Guest arrival / function start / finish"), val(d.timings)],
          ...DETAIL_ROWS.map((r) => [label(r.label), val(who(d[r.key]))]),
        ],
      ),

      section(SECTIONS[1]),
      table(
        [150, 140, "*"],
        [
          [head("Role"), head("Name / contact"), head("Primary accountability")],
          ...ROLES.map((r) => [{ text: r.role, bold: true, fontSize: 8.5 }, val(who(s.team[r.key])), fixed(r.duty)]),
          [{ text: HOSTESS_ROLE.role, bold: true, fontSize: 8.5 }, label("See section 3"), fixed(HOSTESS_ROLE.duty)],
        ],
      ),
      table(
        ["*", "*", "*"],
        [
          [head("Backup lead"), head("Team communication channel"), head("Briefing time / location")],
          [val(s.team.backupLead), val(s.team.channel), val(s.team.briefing)],
        ],
      ),

      section(SECTIONS[2]),
      table(
        [26, 78, "*", 82, 50, 52, 66],
        [
          [head("Staff"), head("Station"), head("Duties"), head("Name"), head("Reporting"), head("Breaks"), head("Relief")],
          ...HOSTESS_STATIONS.map((h, k) => {
            const x = s.hostesses[k] ?? { name: "", reporting: "", breaks: "", relief: "" };
            return [{ text: h.staff, bold: true, fontSize: 8.5 }, fixed(h.station), fixed(h.duties), val(x.name), val(x.reporting), val(x.breaks), val(x.relief)];
          }),
        ],
      ),
      note(HOSTESS_NOTE),

      section(SECTIONS[3]),
      table(
        [44, "*", 44, 60, 80, 54],
        [
          [head("Time"), head("Action / cue"), head("Owner"), head("Backup"), head("Dependency"), head("Status / actual")],
          ...(s.timeline.length ? s.timeline : [{ id: "", time: "", action: "", owner: "", backup: "", dependency: "", actual: "" }]).map((r) => [
            val(r.time),
            val(r.action),
            val(r.owner),
            val(r.backup),
            val(r.dependency),
            val(r.actual),
          ]),
        ],
      ),
      note(TIMELINE_NOTE),

      section(SECTIONS[4], kindLabel(s.kind)),
      duties,

      section(SECTIONS[5]),
      { stack: READINESS.map((t, k) => box(!!s.readiness[k], t)), margin: [0, 4, 0, 0] },

      section(SECTIONS[6]),
      { ul: ESCALATION.map((t) => ({ text: t, fontSize: 9 })), margin: [0, 4, 0, 0] },

      section(SECTIONS[7]),
      table(
        [44, "*", "*", 110],
        [
          [head("Time"), head("Issue / impact"), head("Owner / action"), head("Approval / closed")],
          ...(s.issues.length ? s.issues : [{ id: "", time: "", issue: "", action: "", closed: "" }]).map((r) => [val(r.time), val(r.issue), val(r.action), val(r.closed)]),
        ],
      ),

      section(SECTIONS[8]),
      { columns: [HANDOVER.slice(0, 3), HANDOVER.slice(3)].map((col, ci) => ({ stack: col.map((t, k) => box(!!s.handover[ci * 3 + k], t)) })), margin: [0, 4, 0, 0] },
      table([170, "*"], [[head("Review item"), head("Notes")], ...REVIEW_ROWS.map((r) => [label(r.label), val(s.review[r.key])])]),
      note(SHEET_FOOTER),
    ];
  };

  const ordered = [...sheets].sort((a, b) => fns.findIndex((f) => f.id === a.fnId) - fns.findIndex((f) => f.id === b.fnId));
  return {
    pageSize: "A4",
    pageMargins: [36, 32, 36, 40],
    info: { title: `Coordination sheet ${p.client.name || p.ref}`, author: brand.company },
    defaultStyle: { font: "Roboto", fontSize: 9, color: c.ink },
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `${brand.company} · On-site coordination · ${p.client.name || p.ref}`, fontSize: 7.5, color: muted },
        { text: `Page ${page} of ${pages}`, fontSize: 7.5, color: muted, alignment: "right" },
      ],
      margin: [36, 12, 36, 0],
    }),
    content: ordered.flatMap(sheetContent),
  };
}

export function coordinationFileName(p: Proposal, catalog: Catalog, sheets: CoordinationSheet[]): string {
  const fns = sheetFunctions(p, proposalTitle(p, catalog) || "Event");
  const one = sheets.length === 1 ? fns.find((f) => f.id === sheets[0].fnId) : undefined;
  const date = one?.date || p.client.date || "TBC";
  const parts = ["Coordination", safeFilePart(p.client.name), one ? safeFilePart(one.label) : sheets.length > 1 ? "All_functions" : "", date];
  return `${parts.filter(Boolean).join("_")}.pdf`;
}

export async function downloadCoordination(p: Proposal, sheets: CoordinationSheet[], catalog: Catalog, brand: Brand) {
  const blob = await renderPdf(brand, (logo) => buildCoordinationDoc(p, sheets, catalog, brand, logo));
  saveBlob(blob, coordinationFileName(p, catalog, sheets));
}
