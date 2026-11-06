import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Brand, Catalog, Line, Proposal } from "../types";
import { computeTotals, lineAmount } from "./totals";
import { formatDate, formatINR, todayISO } from "./format";
import { eventDatesLine, exportFileName, groupLines, proposalTitle, venueLine } from "./proposal";
import { logoToPng, saveBlob } from "./files";

/**
 * pdfmake document for a proposal — mirrors the on-screen preview and the Excel file.
 * Pure (no DOM), so it can be rendered in tests; `logoPng` is base64 PNG without a prefix.
 */
export function buildPdfDoc(p: Proposal, catalog: Catalog, brand: Brand, logoPng?: string): TDocumentDefinitions {
  const c = { ink: `#${brand.colors.ink}`, accent: `#${brand.colors.accent}`, soft: `#${brand.colors.soft}`, line: `#${brand.colors.line}` };
  const muted = "#7a7068";
  const t = computeTotals(p, brand.gstPct);
  const title = proposalTitle(p, catalog);
  const letters = "ABCDEFGHIJKLMNOP";

  const label = (text: string): Content => ({ text: text.toUpperCase(), fontSize: 7, bold: true, color: c.accent, characterSpacing: 1.2 });
  const rule = (color = c.accent, w = 515, lineWidth = 1): Content => ({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: w, y2: 0, lineWidth, lineColor: color }],
    margin: [0, 6, 0, 10],
  });

  const itemCell = (l: Line): Content => {
    const stack: Content[] = [{ text: l.name }];
    if (l.notes) stack.push({ text: l.notes, fontSize: 8, color: muted, margin: [0, 1, 0, 0] });
    for (const u of l.upgrades.filter((x) => x.mode === "include"))
      stack.push({ text: `+ ${u.name} (${formatINR(u.price)})`, fontSize: 8, color: c.accent, margin: [0, 1, 0, 0] });
    return { stack };
  };
  const amountCell = (l: Line): TableCell =>
    l.rate === null
      ? { text: "As per actuals", italics: true, color: c.accent, fontSize: 8.5, alignment: "right" }
      : { text: formatINR(lineAmount(l)), alignment: "right", noWrap: true };
  const head = (cols: string[]): TableCell[] =>
    cols.map((h, i) => ({ text: h, fontSize: 7, bold: true, color: "#ffffff", fillColor: c.ink, characterSpacing: 1, alignment: i === cols.length - 1 ? "right" : i === 2 ? "center" : "left", margin: [0, 3, 0, 3] }));
  const tableLayout = {
    hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
    vLineWidth: () => 0,
    hLineColor: () => c.line,
    paddingTop: () => 5,
    paddingBottom: () => 5,
    paddingLeft: () => 6,
    paddingRight: () => 6,
  };

  // ---- items ---------------------------------------------------------------
  const groups = groupLines(p.lines.filter((l) => !l.optional), catalog);
  const itemRows: TableCell[][] = [head(["SL", "ELEMENT", "QTY", "AMOUNT"])];
  groups.forEach((g, gi) => {
    itemRows.push([
      { text: letters[gi], bold: true, color: c.accent, fillColor: c.soft },
      { text: g.label, colSpan: 3, bold: true, color: c.ink, fillColor: c.soft, fontSize: 10 },
      {},
      {},
    ]);
    g.lines.forEach((l, i) => {
      itemRows.push([
        { text: String(i + 1).padStart(2, "0"), color: muted, fontSize: 8 },
        itemCell(l),
        { text: `${l.qty} ${l.unit}`, color: muted, fontSize: 8.5, alignment: "center" },
        amountCell(l),
      ]);
    });
  });
  if (!groups.length) itemRows.push([{ text: "No elements selected yet.", colSpan: 4, italics: true, color: muted }, {}, {}, {}]);

  // ---- totals ----------------------------------------------------------------
  const totalRow = (k: string, v: string, opts: { bold?: boolean; big?: boolean; small?: boolean } = {}): TableCell[] => [
    { text: k, color: opts.small ? muted : c.ink, fontSize: opts.big ? 12 : opts.small ? 8 : 9.5, bold: opts.big },
    { text: v, alignment: "right", noWrap: true, color: opts.small ? muted : c.ink, fontSize: opts.big ? 12 : opts.small ? 8 : 9.5, bold: opts.big || opts.bold },
  ];
  const totals: TableCell[][] = [totalRow("Sub Total", formatINR(t.subTotal), { bold: true })];
  if (p.coordinationPct) totals.push(totalRow(`${brand.coordinationLabel} (${p.coordinationPct}%)`, formatINR(t.coordination)));
  if (t.roundOff) totals.push(totalRow("Rounded Off", formatINR(t.roundOff)));
  const gtIndex = totals.length;
  totals.push(totalRow("Grand Total", formatINR(t.grandTotal), { big: true }));
  totals.push(totalRow(`GST @ ${brand.gstPct}% (for reference)`, formatINR(t.gst), { small: true }));
  totals.push(totalRow("Total including GST", formatINR(t.totalWithGst), { small: true }));

  const notes: string[] = [];
  if (t.asPerActuals.length)
    notes.push(`${t.asPerActuals.map((l) => l.name).join("; ")} will be billed as per actuals and ${t.asPerActuals.length > 1 ? "are" : "is"} not included in the Grand Total.`);
  if (p.notes.trim()) notes.push(p.notes.trim());

  // ---- additional options -----------------------------------------------------
  const options = [
    ...p.lines.filter((l) => l.optional).map((l) => ({ name: l.name, note: l.notes, amount: l.rate === null ? null : lineAmount(l) })),
    ...p.lines.flatMap((l) => l.upgrades.filter((u) => u.mode === "offer").map((u) => ({ name: `Upgrade: ${u.name}`, note: `For “${l.name}”`, amount: u.price as number | null }))),
  ];

  const info: [string, string][] = [
    ["Client", p.client.name || "—"],
    ["Contact", p.client.contact || "To Be Confirmed"],
    [eventDatesLine(p).label, eventDatesLine(p).text],
    ["Venue", venueLine(p) || "To Be Confirmed"],
    ["Quotation ref", p.ref || "To Be Assigned"],
    ["Dated", formatDate(todayISO())],
  ];

  const content: Content[] = [
    {
      columns: [
        logoPng ? { image: `data:image/png;base64,${logoPng}`, width: 120 } : { text: brand.company.toUpperCase(), fontSize: 18, color: c.accent, width: "*" },
        {
          width: "*",
          alignment: "right",
          stack: [
            label("Proposal & estimate"),
            { text: title, fontSize: 22, color: c.ink, margin: [0, 4, 0, 2] },
            { text: p.ref, fontSize: 9, color: muted },
          ],
          margin: [0, 18, 0, 0],
        },
      ],
    },
    rule(c.accent, 515, 1.2),
    {
      table: {
        widths: ["*", "*", "*"],
        body: [0, 3].map((start) =>
          info.slice(start, start + 3).map(([k, v]) => ({ stack: [label(k), { text: v, fontSize: 10, color: c.ink, margin: [0, 2, 0, 0] }], margin: [0, 2, 8, 6] })),
        ),
      },
      layout: "noBorders",
    },
    { text: "Elements & Investment", fontSize: 16, color: c.ink, margin: [0, 14, 0, 8] },
    { table: { headerRows: 1, widths: [22, "*", 70, 88], body: itemRows, dontBreakRows: true }, layout: tableLayout },
    {
      columns: [
        { width: "*", text: "" },
        {
          width: 270,
          table: { widths: ["*", "auto"], body: totals },
          layout: {
            hLineWidth: (i: number) => (i === gtIndex ? 1 : 0),
            vLineWidth: () => 0,
            hLineColor: () => c.accent,
            paddingTop: (i: number) => (i === gtIndex ? 6 : 2),
            paddingBottom: (i: number) => (i === gtIndex ? 6 : 2),
          },
        },
      ],
      margin: [0, 10, 0, 6],
    },
    ...notes.map((n): Content => ({ text: n, italics: true, fontSize: 8, color: muted, margin: [0, 2, 0, 2] })),
  ];

  if (options.length) {
    content.push(
      { text: "Additional Options", fontSize: 14, color: c.ink, margin: [0, 18, 0, 2] },
      { text: "Optional — not included in the Grand Total.", italics: true, fontSize: 8.5, color: c.accent, margin: [0, 0, 0, 6] },
      {
        table: {
          headerRows: 1,
          widths: [22, "*", 88],
          dontBreakRows: true,
          body: [
            head(["SL", "OPTION", "AMOUNT"]),
            ...options.map((o, i): TableCell[] => [
              { text: String(i + 1).padStart(2, "0"), color: muted, fontSize: 8 },
              { stack: [{ text: o.name }, ...(o.note ? [{ text: o.note, fontSize: 8, color: muted }] : [])] },
              o.amount === null
                ? { text: "As per actuals", italics: true, color: c.accent, fontSize: 8.5, alignment: "right" }
                : { text: formatINR(o.amount), alignment: "right", noWrap: true },
            ]),
            [{ text: "" }, { text: "Total of additional options", bold: true, alignment: "right" }, { text: formatINR(t.optionsTotal), bold: true, alignment: "right", noWrap: true }],
          ],
        },
        layout: tableLayout,
      },
    );
  }

  const terms = p.terms.filter((x) => x.trim());
  content.push(
    { text: "Terms & Conditions", fontSize: 14, color: c.ink, margin: [0, 18, 0, 6] },
    { ol: terms.map((x) => ({ text: x, margin: [0, 0, 0, 3] })), fontSize: 9, color: "#4a423b", markerColor: c.accent } as Content,
    {
      unbreakable: true,
      margin: [0, 16, 0, 0],
      table: {
        widths: ["*"],
        body: [
          [
            {
              fillColor: c.ink,
              margin: [12, 10, 12, 10],
              stack: [
                { text: "YOUR POINT OF CONTACT", fontSize: 7, bold: true, color: "#d8c39a", characterSpacing: 1.2 },
                { text: brand.contact.name, fontSize: 13, color: "#ffffff", margin: [0, 3, 0, 1] },
                { text: brand.contact.role, fontSize: 9, color: "#e6e0d8" },
                { text: `${brand.contact.phone}  ·  ${brand.contact.email}`, fontSize: 9, color: "#e6e0d8" },
                { text: `${brand.legalName} · ${brand.address} · GSTIN ${brand.gstin}`, fontSize: 7.5, color: "#b9b0a6", margin: [0, 8, 0, 0] },
              ],
            },
          ],
        ],
      },
      layout: "noBorders",
    },
  );

  return {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 50],
    info: { title: `${title} — ${p.client.name || "Proposal"}`, author: brand.company, subject: `Quotation ${p.ref}` },
    defaultStyle: { font: "Roboto", fontSize: 9.5, color: c.ink, lineHeight: 1.2 },
    content,
    footer: (page: number, pages: number): Content => ({
      margin: [40, 16, 40, 0],
      columns: [
        { text: `${brand.company} · ${brand.phone} · ${brand.email}`, fontSize: 7, color: muted },
        { text: `Page ${page} of ${pages}`, fontSize: 7, color: muted, alignment: "right" },
      ],
    }),
  };
}

/** Builds the PDF in the browser. pdfmake and its fonts load only on first use. */
export async function buildPdfBlob(p: Proposal, catalog: Catalog, brand: Brand): Promise<Blob> {
  const [{ default: pdfMake }, fonts, logo] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
    logoToPng(`${import.meta.env.BASE_URL}${brand.logo}`),
  ]);
  // vfs_fonts exports the font map itself (0.2.x); older builds nested it under pdfMake.vfs
  type Vfs = Record<string, string>;
  const f = ((fonts as { default?: unknown }).default ?? fonts) as Vfs & { pdfMake?: { vfs: Vfs }; vfs?: Vfs };
  const vfs = f.pdfMake?.vfs ?? f.vfs ?? f;
  // @types/pdfmake describes 0.3; the installed 0.2 takes vfs as the 4th argument and a callback for getBlob
  const make = pdfMake as unknown as { createPdf: (d: TDocumentDefinitions, l?: unknown, f?: unknown, v?: Vfs) => { getBlob: (cb: (b: Blob) => void) => void } };
  const doc = make.createPdf(buildPdfDoc(p, catalog, brand, logo), undefined, undefined, vfs);
  return new Promise<Blob>((resolve) => doc.getBlob(resolve));
}

/** Builds the PDF and downloads it. */
export async function downloadPdf(p: Proposal, catalog: Catalog, brand: Brand) {
  saveBlob(await buildPdfBlob(p, catalog, brand), exportFileName(p, catalog, "pdf"));
}
