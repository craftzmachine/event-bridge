// HTML overlays drawn over the floor-plan canvas: metre rulers along the top and left, and a minimap of the room
// with the visible area outlined (click or drag on it to move there). Both follow the canvas's pan and zoom.
import { useEffect, useRef } from "react";
import type { VenueLayout } from "../../types";
import { KINDS } from "../../lib/layout";
import type { Colors } from "./PlanCanvas";

export const RULER = 22;

type View = { x: number; y: number; scale: number };

/** a sensible tick spacing in metres for the zoom: about one label every 60–120 px */
function step(scale: number): number {
  for (const s of [0.5, 1, 2, 5, 10, 20, 50]) if (s * scale >= 60) return s;
  return 100;
}

function useCanvas(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const g = cv.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    draw(g, w, h);
  }, deps);
  return ref;
}

export function Rulers({ view, size, c }: { view: View; size: { w: number; h: number }; c: Colors }) {
  const s = step(view.scale);
  const minor = s / 5;
  const paint = (g: CanvasRenderingContext2D, len: number, horizontal: boolean) => {
    g.fillStyle = c.card;
    g.fillRect(0, 0, horizontal ? len : RULER, horizontal ? RULER : len);
    g.strokeStyle = c.line;
    g.beginPath();
    if (horizontal) {
      g.moveTo(0, RULER - 0.5);
      g.lineTo(len, RULER - 0.5);
    } else {
      g.moveTo(RULER - 0.5, 0);
      g.lineTo(RULER - 0.5, len);
    }
    g.stroke();
    const origin = horizontal ? view.x : view.y;
    const first = Math.floor(-origin / view.scale / minor) * minor;
    g.fillStyle = c.stone;
    g.strokeStyle = c.stone;
    g.font = "10px Inter, system-ui, sans-serif";
    for (let m = first; m * view.scale + origin < len; m += minor) {
      const p = Math.round(m * view.scale + origin) + 0.5;
      if (p < RULER) continue;
      const major = Math.abs(m / s - Math.round(m / s)) < 1e-6;
      const t = major ? 9 : 4;
      g.beginPath();
      if (horizontal) {
        g.moveTo(p, RULER);
        g.lineTo(p, RULER - t);
      } else {
        g.moveTo(RULER, p);
        g.lineTo(RULER - t, p);
      }
      g.stroke();
      if (major) {
        const text = `${Math.round(m * 10) / 10}`;
        if (horizontal) g.fillText(text, p + 3, 10);
        else {
          g.save();
          g.translate(10, p - 3);
          g.rotate(-Math.PI / 2);
          g.fillText(text, 0, 0);
          g.restore();
        }
      }
    }
  };
  const top = useCanvas((g, w) => paint(g, w, true), size.w, RULER, [view, size.w, c]);
  const left = useCanvas((g, _w, h) => paint(g, h, false), RULER, size.h, [view, size.h, c]);
  return (
    <>
      <canvas ref={top} className="pointer-events-none absolute left-0 top-0" style={{ width: size.w, height: RULER }} aria-hidden="true" />
      <canvas ref={left} className="pointer-events-none absolute left-0 top-0" style={{ width: RULER, height: size.h }} aria-hidden="true" />
      <span className="pointer-events-none absolute left-0 top-0 grid place-items-center text-[9px] text-stone" style={{ width: RULER, height: RULER, background: c.card }} aria-hidden="true">m</span>
    </>
  );
}

export function Minimap({ layout, view, size, c, onJump }: { layout: VenueLayout; view: View; size: { w: number; h: number }; c: Colors; onJump: (x: number, y: number) => void }) {
  const W = 160;
  const k = W / Math.max(layout.w, layout.h * 1.25);
  const w = layout.w * k;
  const h = layout.h * k;
  const ref = useCanvas((g) => {
    g.fillStyle = c.paper;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = c.ink2;
    g.strokeRect(0.5, 0.5, w - 1, h - 1);
    for (const it of layout.items) {
      g.save();
      g.translate(it.x * k, it.y * k);
      g.rotate((it.rot * Math.PI) / 180);
      g.fillStyle = KINDS[it.kind].zone ? c.taupe : c.gold;
      if (KINDS[it.kind].round) {
        g.beginPath();
        g.ellipse(0, 0, (it.w * k) / 2, (it.h * k) / 2, 0, 0, Math.PI * 2);
        g.fill();
      } else g.fillRect((-it.w * k) / 2, (-it.h * k) / 2, it.w * k, Math.max(1, it.h * k));
      g.restore();
    }
    // the part of the room on screen
    g.strokeStyle = c.danger;
    g.lineWidth = 1.5;
    g.strokeRect((-view.x / view.scale) * k, (-view.y / view.scale) * k, (size.w / view.scale) * k, (size.h / view.scale) * k);
  }, w, h, [layout, view, size, c]);
  const jump = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onJump((e.clientX - r.left) / k, (e.clientY - r.top) / k);
  };
  return (
    <canvas ref={ref} className="absolute bottom-2 right-2 cursor-pointer rounded-sm border border-solid border-line" style={{ width: w, height: h }}
      role="img" aria-label="Minimap of the room. Click to move the view there."
      onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); jump(e); }}
      onPointerMove={(e) => { if (e.buttons) jump(e); }} />
  );
}
