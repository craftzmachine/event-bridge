// Standalone floor plans on this device (event-bridge.floor-plans.v1), with JSON export and import like the other
// office apps.
import { isFloorPlan, type FloorPlan } from "../lib/floorPlans";
import { readList, useStoredList, writeList } from "./local";

export const FLOOR_PLANS_KEY = "event-bridge.floor-plans.v1";

export const useFloorPlans = () => useStoredList(FLOOR_PLANS_KEY, isFloorPlan);

/** adds a plan from outside the Floor Plans page (a wedding's "Save as a floor plan") */
export function addFloorPlan(plan: FloorPlan) {
  writeList(FLOOR_PLANS_KEY, [plan, ...readList(FLOOR_PLANS_KEY, isFloorPlan)]);
}
