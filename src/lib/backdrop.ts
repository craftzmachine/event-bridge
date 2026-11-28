// The venue drawing under a floor plan (a background to trace): where it sits in the room and how big, in metres.
// The image itself stays in IndexedDB on this device (src/state/backdrops.ts); the plan keeps only these numbers.
// Pure, so backdrop.test.ts checks it.
import type { Backdrop, VenueLayout } from "../types";
import { ROOM_MAX, ROOM_MIN } from "./layout";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** a new drawing placed in the room's top-left corner, as wide as the room (or as tall, if that fits better) */
export function placeBackdrop(imageId: string, px: { w: number; h: number }, room: Pick<VenueLayout, "w" | "h">, name = ""): Backdrop {
  const ratio = px.h / Math.max(1, px.w);
  let w = room.w;
  let h = w * ratio;
  if (h > room.h) {
    h = room.h;
    w = h / ratio;
  }
  return { imageId, x: 0, y: 0, w: r2(w), h: r2(h), opacity: 0.6, ...(name ? { name } : {}) };
}

/**
 * Sets the drawing's scale from one known length: two points measured on it (room metres at the current scale) and
 * what that length really is. The drawing grows or shrinks about the first point, so that point stays put.
 */
export function calibrate(b: Backdrop, p: { x: number; y: number }, q: { x: number; y: number }, metres: number): Backdrop {
  const d = Math.hypot(q.x - p.x, q.y - p.y);
  if (!(d > 0.01) || !(metres > 0)) return b;
  const f = metres / d;
  return { ...b, x: r2(p.x - (p.x - b.x) * f), y: r2(p.y - (p.y - b.y) * f), w: r2(b.w * f), h: r2(b.h * f) };
}

/** the room resized to hold the whole drawing, with the drawing moved to the corner */
export function roomForBackdrop(l: VenueLayout): VenueLayout {
  const b = l.backdrop;
  if (!b) return l;
  const clamp = (n: number) => Math.max(ROOM_MIN, Math.min(ROOM_MAX, Math.ceil(n * 2) / 2));
  const dx = -b.x;
  const dy = -b.y;
  return {
    ...l,
    w: clamp(b.w),
    h: clamp(b.h),
    backdrop: { ...b, x: 0, y: 0 },
    items: l.items.map((i) => ({ ...i, x: r2(i.x + dx), y: r2(i.y + dy) })),
  };
}
