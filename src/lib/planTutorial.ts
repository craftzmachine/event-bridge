// The floor-plan tutorial: a short, hands-on walk through the editor. Each step names the action that completes it;
// the editor reports actions as TutorialEvents. Pure, so planTutorial.test.ts checks the logic.

export type TutorialEvent =
  | `add:${string}`
  | "move"
  | "resize"
  | "rotate"
  | "seats"
  | "preset"
  | "multi"
  | "bulkSeats"
  | "inventory"
  | "undo"
  | "3d";

export interface TutorialStep {
  id: string;
  title: string;
  text: string;
  /** the element to spotlight: [data-tutorial="…"] */
  target?: string;
  /** what completes the step */
  done: (e: TutorialEvent) => boolean;
}

export const TUTORIAL: TutorialStep[] = [
  { id: "add", title: "Add a round table", text: "Click Round table under Add, or drag it onto the plan where you want it.", target: "add-round", done: (e) => e === "add:round" },
  { id: "move", title: "Move it", text: "Drag the table. It snaps to the grid, and gold guide lines show when it lines up with something. Hold Alt to place it freely.", target: "canvas", done: (e) => e === "move" },
  { id: "resize", title: "Resize it", text: "Pull one of the corner handles. Watch the size and the number of chairs change as you drag.", target: "canvas", done: (e) => e === "resize" },
  { id: "seats", title: "Change the chairs", text: "Use − and + on the small toolbar above the table to take away or add a chair.", target: "selection-bar", done: (e) => e === "seats" },
  { id: "aisle", title: "Lay an aisle", text: "Add an Aisle / runner from Ceremony & stage. Drag its end handle (or type its length in the panel) to run it up to the mandap.", target: "add-aisle", done: (e) => e === "add:aisle" },
  { id: "preset", title: "Size the mandap", text: "Click the mandap, then pick 6 × 6 m under Common sizes in the panel on the right. You can type any size too.", target: "presets", done: (e) => e === "preset" },
  { id: "multi", title: "Select several", text: "Hold Shift and drag a box round a few tables (or Shift-click them). Then drag them together, or line them up from the panel.", target: "canvas", done: (e) => e === "multi" },
  { id: "bulk", title: "Chairs for every table", text: "Open Tables in the toolbar and set every round table to 8 seats, or seat a number of guests across all tables.", target: "bulk-seats", done: (e) => e === "bulkSeats" },
  { id: "inventory", title: "Count and order", text: "The Counts panel totals tables and chairs as you work. Download the Inventory as PDF or Excel to send to the rental vendor.", target: "inventory", done: (e) => e === "inventory" },
  { id: "undo", title: "Undo", text: "Made a mistake? Press Ctrl+Z or the ↶ button. Ctrl+Y brings it back.", target: "undo", done: (e) => e === "undo" },
  { id: "3d", title: "Look round in 3D", text: "Switch to 3D at the top right to see the room as the family will. Try Walk, then switch back to 2D.", target: "view-3d", done: (e) => e === "3d" },
];

export interface TutorialState {
  step: number;
  /** ids of steps completed by doing them */
  done: string[];
  active: boolean;
}

export const startTutorial = (): TutorialState => ({ step: 0, done: [], active: true });

/** an action happened: tick the current step if it's the one, and move on */
export function onTutorialEvent(s: TutorialState, e: TutorialEvent, steps = TUTORIAL): TutorialState {
  if (!s.active) return s;
  const cur = steps[s.step];
  if (!cur || !cur.done(e)) return s;
  const done = s.done.includes(cur.id) ? s.done : [...s.done, cur.id];
  return { ...s, done, step: s.step + 1 };
}

export const finished = (s: TutorialState, steps = TUTORIAL) => s.step >= steps.length;
export const skipStep = (s: TutorialState, steps = TUTORIAL): TutorialState => ({ ...s, step: Math.min(steps.length, s.step + 1) });
export const backStep = (s: TutorialState): TutorialState => ({ ...s, step: Math.max(0, s.step - 1) });
