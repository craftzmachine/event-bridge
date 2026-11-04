import type { Grid } from "./render/xlsx.js";

/**
 * Everything a client may see of one share, stored as a single (encrypted) blob so a whole view costs one
 * storage read: [4-byte header length][JSON header][page images…].
 */
export type BundleHeader =
  | { kind: "pdf"; pages: { w: number; h: number; len: number }[] }
  | { kind: "xlsx"; grid: Grid };

export function packPdf(pages: { w: number; h: number; image: Buffer }[]) {
  return pack({ kind: "pdf", pages: pages.map((p) => ({ w: p.w, h: p.h, len: p.image.length })) }, pages.map((p) => p.image));
}

export const packXlsx = (grid: Grid) => pack({ kind: "xlsx", grid }, []);

function pack(header: BundleHeader, parts: Buffer[]) {
  const head = Buffer.from(JSON.stringify(header));
  const len = Buffer.alloc(4);
  len.writeUInt32BE(head.length);
  return Buffer.concat([len, head, ...parts]);
}

export function unpack(data: Buffer) {
  const n = data.readUInt32BE(0);
  const header = JSON.parse(data.subarray(4, 4 + n).toString()) as BundleHeader;
  const page = (i: number) => {
    if (header.kind !== "pdf" || i < 0 || i >= header.pages.length) return null;
    let at = 4 + n;
    for (let k = 0; k < i; k++) at += header.pages[k].len;
    return data.subarray(at, at + header.pages[i].len);
  };
  return { header, page };
}
