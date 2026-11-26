// The On-Site Event Coordination & Responsibility Sheet: one per function, filled in by the coordinators in the
// event workspace and printed as a PDF (exportCoordination.ts). The fixed wording comes from the team's Word form.
// Pure, so tests run it in Node. Internal: never part of a client output.
import type { CoordCue, CoordinationKind, CoordinationSheet, CoordIssue, CoordPerson, EventFunction, Proposal } from "../types";
import { formatDate, formatDates } from "./format";
import { functionsOf } from "./functions";
import { eventDates, venueLine } from "./proposal";

export const SHEET_TITLE = "On-Site Event Coordination & Responsibility Sheet";
export const SHEET_INTRO = "Complete one sheet for each function. Brief every team member before guest arrival and retain the completed copy after the event.";

export const SECTIONS = [
  "Event details",
  "Team allocation",
  "Hostess deployment",
  "Execution timeline",
  "Function-specific responsibilities",
  "Pre-opening readiness checklist",
  "Communication and escalation",
  "Live issue & decision log",
  "Post-event handover",
] as const;

export const DETAIL_ROWS: { key: "lead" | "family" | "officiant" | "venueManager" | "emergency"; label: string }[] = [
  { key: "lead", label: "Lead coordinator & phone" },
  { key: "family", label: "Family decision-maker & phone" },
  { key: "officiant", label: "Priest / officiant / MC & phone" },
  { key: "venueManager", label: "Venue duty manager & phone" },
  { key: "emergency", label: "Emergency / security contact" },
];

export const ROLES: { key: "c1" | "c2" | "c3"; role: string; duty: string }[] = [
  { key: "c1", role: "Coordinator 1 – Event Lead", duty: "Overall execution, client/family liaison, approvals, escalations and timeline" },
  { key: "c2", role: "Coordinator 2 – Ceremony & Production", duty: "Ceremony readiness, vendors, stage, AV, lighting and technical cues" },
  { key: "c3", role: "Coordinator 3 – Guest Experience", duty: "Hostess briefing, arrivals, seating, hospitality, dining and guest movement" },
];
export const HOSTESS_ROLE = { role: "Hostesses H1–H6", duty: "Assigned guest-facing stations under Coordinator 3" };

export const HOSTESS_STATIONS: { staff: string; station: string; duties: string }[] = [
  { staff: "H1", station: "Entrance", duties: "Welcome guests; direct them to the correct function" },
  { staff: "H2", station: "Entrance / help desk", duties: "Assist with guest list, directions and enquiries" },
  { staff: "H3", station: "Seating", duties: "Guide guests to assigned sections; keep aisles clear" },
  { staff: "H4", station: "Family / accessibility", duties: "Assist elders, families and guests needing support" },
  { staff: "H5", station: "Ceremony / stage queue", duties: "Guide guests or participants only on coordinator cue" },
  { staff: "H6", station: "Dining / floating", duties: "Manage dining directions, queues and relief coverage" },
];
export const HOSTESS_NOTE =
  "Coordinator 3 must enter names, reporting times, breaks and relief arrangements. Hostesses must not approve costs, alter rituals, promise vendor services or leave a station without a handover.";

export const DEFAULT_CUES: { action: string; owner: string }[] = [
  { action: "Team attendance and briefing", owner: "C1" },
  { action: "Venue, decor, AV and vendor readiness check", owner: "C2" },
  { action: "Hostess stations and guest routes ready", owner: "C3" },
  { action: "Family / officiant confirms final flow", owner: "C1" },
  { action: "Guest arrival and seating", owner: "C3" },
  { action: "Function start and programme cues", owner: "C1 / C2" },
  { action: "Dining / next-space transition", owner: "C3" },
  { action: "Guest departure and vendor handover", owner: "C1" },
];
export const TIMELINE_NOTE =
  "For every additional cue, record its planned time, one accountable owner, backup, dependency and actual completion time. C1 maintains the master run sheet.";

export const KINDS: { id: CoordinationKind; label: string }[] = [
  { id: "hindu", label: "Hindu wedding" },
  { id: "reception", label: "Reception" },
  { id: "sangeet", label: "Sangeet" },
  { id: "other", label: "Other ceremonies" },
];

export const FUNCTION_DUTIES: Record<Exclude<CoordinationKind, "other">, { owner: string; duties: string }[]> = {
  hindu: [
    { owner: "C1", duties: "Confirm muhurtham and ritual order with priest and family; confirm couple readiness and authorised family contacts; protect the agreed ceremony timing." },
    {
      owner: "C2",
      duties:
        "Check mandap access, ritual items against the priest-approved list, microphones, power and photography positions; cue music and vendors. Confirm venue permission and safety arrangements for any sacred fire.",
    },
    {
      owner: "C3 + hostesses",
      duties:
        "Seat guests and elders, keep ceremony access clear, guide family participants on cue, coordinate footwear arrangements if applicable, and manage the Sadhya/dining transition.",
    },
  ],
  reception: [
    { owner: "C1", duties: "Confirm couple entrance, speeches, cake cutting and other approved programme items with family and MC." },
    { owner: "C2", duties: "Check stage readiness, entrance music, microphones, lighting, photography and performance cues." },
    { owner: "C3 + hostesses", duties: "Manage welcome desk, seating, stage-photo queue, dining flow and departures." },
  ],
  sangeet: [
    { owner: "C1", duties: "Approve performance order, MC flow and timing changes with the client." },
    { owner: "C2", duties: "Check DJ/AV, tracks, microphones, performer holding area, rehearsals and stage cues; keep technical access clear." },
    { owner: "C3 + hostesses", duties: "Guide guests to seating and activities, manage entry and queues, and direct performers to the designated coordinator." },
  ],
};
export const OTHER_DUTIES =
  "For Christian, Muslim, civil or other weddings, obtain the officiant-approved order, venue rules, participant list and any privacy or photography restrictions. Assign each cue to C1, C2 or C3 before briefing the hostesses.";

export const READINESS = [
  "Approved run sheet, contacts and venue plan circulated",
  "All staff present, briefed and assigned a backup",
  "Family, couple and officiant readiness confirmed",
  "Vendors checked in; decor, AV, power and catering readiness verified",
  "Guest routes, accessible seating, exits and emergency access checked",
  "Hostess stations, uniforms, communication and break cover confirmed",
  "Any delay, safety concern or incomplete item escalated to C1",
];

export const ESCALATION = [
  "Report issues in this format: LOCATION – ISSUE – IMPACT – ACTION NEEDED – OWNER – DEADLINE.",
  "C1 approves programme changes with the authorised client contact. C2 handles production/vendor issues; C3 handles guest and hostess issues. Escalate unresolved issues to C1 immediately.",
  "For an emergency, contact venue security or emergency services first, stop unsafe activity, and notify C1. Never obstruct exits or use an unapproved stage or structure.",
];

export const HANDOVER = ["Guest departure complete", "Client belongings handed over", "Vendor/venue handover complete", "Lost property recorded", "Incidents and pending actions documented"];

export const REVIEW_ROWS: { key: keyof CoordinationSheet["review"]; label: string }[] = [
  { key: "wentWell", label: "What went well" },
  { key: "gaps", label: "Gaps / complaints and verified facts" },
  { key: "corrective", label: "Corrective action, owner and due date" },
  { key: "signOff", label: "Lead sign-off / date" },
];
export const SHEET_FOOTER = "Coordinator 1 submits the completed sheet and debrief to management after the function.";

const rid = () => Math.random().toString(36).slice(2, 10);
const person = (): CoordPerson => ({ name: "", phone: "" });
export const blankCue = (action = "", owner = ""): CoordCue => ({ id: rid(), time: "", action, owner, backup: "", dependency: "", actual: "" });
export const blankIssue = (): CoordIssue => ({ id: rid(), time: "", issue: "", action: "", closed: "" });

/** The duties block a function's label suggests; the coordinator can change it. */
export function guessKind(label: string, style: string | null): CoordinationKind {
  const l = label.toLowerCase();
  if (/sangeet|sangeeth/.test(l)) return "sangeet";
  if (/reception/.test(l)) return "reception";
  if (/muhurtham|muhurtam|wedding|kalyanam|thali|vivah/.test(l)) return style === "hindu" ? "hindu" : "other";
  return "other";
}

/** The functions a proposal has sheets for: its own, or one stand-in (id "") when it has none. */
export function sheetFunctions(p: Proposal, eventLabel = "Event"): EventFunction[] {
  const fs = functionsOf(p);
  if (fs.length) return fs;
  const dates = eventDates(p);
  return [{ id: "", label: eventLabel, date: dates[0] ?? "" }];
}

/** A new sheet with what the proposal already knows; everything else is left for the coordinators. */
export function newSheet(p: Proposal, fn: EventFunction): CoordinationSheet {
  const dates = fn.id ? (fn.date ? [fn.date] : []) : eventDates(p);
  const when = fn.id ? (fn.date ? formatDate(fn.date) : "") : dates.length ? formatDates(dates) : "";
  return {
    fnId: fn.id,
    kind: guessKind(fn.label, p.style),
    details: {
      client: p.client.name,
      functionDate: [fn.label, when].filter(Boolean).join(" — "),
      spaces: venueLine(p),
      guests: p.client.guests ? String(p.client.guests) : "",
      timings: "",
      lead: person(),
      family: person(),
      officiant: person(),
      venueManager: person(),
      emergency: person(),
    },
    team: { c1: person(), c2: person(), c3: person(), backupLead: "", channel: "", briefing: "" },
    hostesses: HOSTESS_STATIONS.map(() => ({ name: "", reporting: "", breaks: "", relief: "" })),
    timeline: DEFAULT_CUES.map((c) => blankCue(c.action, c.owner)),
    readiness: READINESS.map(() => false),
    issues: [blankIssue(), blankIssue(), blankIssue(), blankIssue()],
    handover: HANDOVER.map(() => false),
    review: { wentWell: "", gaps: "", corrective: "", signOff: "" },
  };
}

/** Fills in anything a saved sheet is missing (older shapes, hand-edited imports), so the UI and PDF can rely on it. */
function complete(s: CoordinationSheet, base: CoordinationSheet): CoordinationSheet {
  const fix = <T>(arr: T[] | undefined, n: number, blank: () => T) => Array.from({ length: n }, (_, i) => arr?.[i] ?? blank());
  return {
    ...base,
    ...s,
    details: { ...base.details, ...s.details },
    team: { ...base.team, ...s.team },
    hostesses: fix(s.hostesses, HOSTESS_STATIONS.length, () => ({ name: "", reporting: "", breaks: "", relief: "" })),
    timeline: Array.isArray(s.timeline) ? s.timeline : base.timeline,
    readiness: fix(s.readiness, READINESS.length, () => false),
    issues: Array.isArray(s.issues) ? s.issues : base.issues,
    handover: fix(s.handover, HANDOVER.length, () => false),
    review: { ...base.review, ...s.review },
  };
}

/** The saved sheet for a function, or a new one filled in from the proposal. */
export function sheetFor(p: Proposal, fn: EventFunction): CoordinationSheet {
  const saved = p.coordination?.find((s) => s && s.fnId === fn.id);
  const base = newSheet(p, fn);
  return saved ? complete(saved, base) : base;
}

/** Whether a sheet has been saved for that function. */
export const hasSheet = (p: Proposal, fnId: string) => !!p.coordination?.some((s) => s && s.fnId === fnId);

/** The proposal with that function's sheet saved (replacing any earlier one). */
export function setSheet(p: Proposal, sheet: CoordinationSheet, at = new Date().toISOString()): Proposal {
  const rest = (p.coordination ?? []).filter((s) => s && s.fnId !== sheet.fnId);
  return { ...p, coordination: [...rest, { ...sheet, updatedAt: at }] };
}

/** "Hindu wedding", "Reception"… */
export const kindLabel = (k: CoordinationKind) => KINDS.find((x) => x.id === k)?.label ?? "Other ceremonies";
