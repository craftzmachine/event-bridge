// How the planner likes to see floor plans (furniture or plain shapes, rulers, 2D or 3D), remembered on this device.
import { useState } from "react";
import type { Look } from "./ItemNode";

const KEY = "event-bridge.plan-view.v1";

export interface PlanView {
  look: Look;
  rulers: boolean;
  /** "3d" shows the plan in the WebGL viewer */
  mode: "2d" | "3d";
}

const DEFAULTS: PlanView = { look: "realistic", rulers: false, mode: "2d" };

function read(): PlanView {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<PlanView>;
    return {
      look: x.look === "simple" ? "simple" : "realistic",
      rulers: x.rulers === true,
      mode: x.mode === "3d" ? "3d" : "2d",
    };
  } catch {
    return DEFAULTS;
  }
}

export function usePlanView(): [PlanView, (patch: Partial<PlanView>) => void] {
  const [v, setV] = useState(read);
  const set = (patch: Partial<PlanView>) =>
    setV((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage blocked: for this visit only */
      }
      return next;
    });
  return [v, set];
}
