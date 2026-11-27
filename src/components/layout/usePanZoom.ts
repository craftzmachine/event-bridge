// Pan and zoom for an SVG floor plan whose viewBox is in metres: wheel and pinch zoom round the pointer, dragging the
// empty floor pans, and fit() frames the whole room. Shared by the layout editor and the seating board.
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { VenueLayout } from "../../types";

export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_W = 4;

export function usePanZoom(layout: Pick<VenueLayout, "w" | "h">, aspect = 16 / 10) {
  const svg = useRef<SVGSVGElement>(null);
  const fitView = useCallback((): View => {
    const pad = 1.5;
    const w = layout.w + pad * 2;
    const h = layout.h + pad * 2 + 1;
    // the box keeps the element's own proportions so nothing is stretched
    return w / h > aspect ? { x: -pad, y: -pad, w, h: w / aspect } : { x: -pad - (h * aspect - w) / 2, y: -pad, w: h * aspect, h };
  }, [layout.w, layout.h, aspect]);
  const [view, setView] = useState<View>(fitView);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ x: number; y: number; view: View } | null>(null);
  const pinch = useRef<{ dist: number; view: View; mid: { x: number; y: number } } | null>(null);

  const toRoom = useCallback((cx: number, cy: number) => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return { x: 0, y: 0 };
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const zoomAt = useCallback((factor: number, at?: { x: number; y: number }) => {
    setView((v) => {
      const max = Math.max(layout.w, layout.h) * 3;
      const w = Math.max(MIN_W, Math.min(max, v.w * factor));
      const f = w / v.w;
      const c = at ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 };
      return { x: c.x - (c.x - v.x) * f, y: c.y - (c.y - v.y) * f, w, h: v.h * f };
    });
  }, [layout.w, layout.h]);

  // wheel zoom needs a non-passive listener to keep the page from scrolling
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100) * 0.0025), toRoom(e.clientX, e.clientY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, toRoom]);

  /** call from the floor's pointerdown (not an item's): starts a pan, or a pinch with a second finger */
  const startPan = (e: RPointerEvent<Element>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* the pointer already ended */
    }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), view, mid: toRoom((a.x + b.x) / 2, (a.y + b.y) / 2) };
      pan.current = null;
    } else pan.current = { x: e.clientX, y: e.clientY, view };
  };
  const movePan = (e: RPointerEvent<Element>) => {
    if (!pointers.current.has(e.pointerId)) return false;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const el = svg.current;
    if (!el) return false;
    const scale = view.w / el.clientWidth;
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const f = pinch.current.dist / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const v0 = pinch.current.view;
      const w = Math.max(MIN_W, v0.w * f);
      const k = w / v0.w;
      const c = pinch.current.mid;
      setView({ x: c.x - (c.x - v0.x) * k, y: c.y - (c.y - v0.y) * k, w, h: v0.h * k });
      return true;
    }
    if (pan.current) {
      const s = pan.current.view.w / el.clientWidth || scale;
      setView({ ...pan.current.view, x: pan.current.view.x - (e.clientX - pan.current.x) * s, y: pan.current.view.y - (e.clientY - pan.current.y) * s });
      return true;
    }
    return false;
  };
  const endPan = (e: RPointerEvent<Element>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (!pointers.current.size) pan.current = null;
  };

  return { svg, view, setView, fit: () => setView(fitView()), zoomAt, toRoom, startPan, movePan, endPan, viewBox: `${view.x} ${view.y} ${view.w} ${view.h}` };
}
