// Wedding Quest: a light-hearted guide to Event Bridge. Quests tick themselves off when the planner actually does
// the thing (a proposal exists, an enquiry is logged…), each worth some XP, and XP buys a title. There's also a
// spotlight tour of the Dashboard and a few apps. Pure, so it's tested in Node; progress lives in localStorage.

/** What the quest log can see of this device's data, gathered by the Quest component. */
export interface QuestFacts {
  proposals: number;
  /** a proposal with an occasion and at least one element */
  builtProposal: boolean;
  accepted: number;
  shared: boolean;
  checklists: number;
  checklistDone: boolean;
  questionnairesSent: number;
  portals: number;
  leads: number;
  vendors: number;
  teamTasks: number;
  expenses: number;
  backedUp: boolean;
  /** routes opened at least once, e.g. "venues" */
  visited: string[];
  tourDone: boolean;
}

export interface Quest {
  id: string;
  title: string;
  /** the funny bit */
  blurb: string;
  xp: number;
  /** where "Show me" goes */
  href: string;
  done: (f: QuestFacts) => boolean;
}

export const QUESTS: Quest[] = [
  { id: "tour", title: "Take the grand tour", blurb: "Five minutes, zero relatives asking when it's your turn. Follow the gold spotlight.", xp: 20, href: "#/dashboard", done: (f) => f.tourDone },
  { id: "proposal", title: "Start your first proposal", blurb: "Every legendary wedding began as a slightly nervous quotation. Yours too.", xp: 50, href: "#/studio", done: (f) => f.proposals > 0 },
  { id: "build", title: "Fill the mandap", blurb: "Pick an occasion and add at least one element. Jasmine counts. Jasmine always counts.", xp: 40, href: "#/studio", done: (f) => f.builtProposal },
  { id: "venues", title: "Scout the venues", blurb: "Peek at 29 halls and resorts without driving through Kowdiar traffic once.", xp: 15, href: "#/venues", done: (f) => f.visited.includes("venues") },
  { id: "enquiry", title: "Catch an enquiry", blurb: "Someone slid into your DMs asking for 'something simple, 800 guests'. Log it in the CRM.", xp: 30, href: "#/crm", done: (f) => f.leads > 0 },
  { id: "vendor", title: "Befriend a vendor", blurb: "Save one florist, caterer or nadaswaram maestro. Future you, at 11 pm before the haldi, says thanks.", xp: 25, href: "#/vendors", done: (f) => f.vendors > 0 },
  { id: "checklist", title: "Make a plan", blurb: "Start a wedding's checklist from its event page. Counting back from the muhurtham is the whole trick.", xp: 30, href: "#/events", done: (f) => f.checklists > 0 },
  { id: "tick", title: "Tick something off", blurb: "Mark one task done. Feel that? That's what competence feels like.", xp: 20, href: "#/tasks", done: (f) => f.checklistDone || f.teamTasks > 0 },
  { id: "questions", title: "Ask the family", blurb: "Send a questionnaire, so 'veg or non-veg' is answered once, not in 47 WhatsApp messages.", xp: 30, href: "#/questionnaires", done: (f) => f.questionnairesSent > 0 },
  { id: "share", title: "Show it off", blurb: "Share a proposal as a private, password-protected link. No screenshots of screenshots.", xp: 40, href: "#/visualize", done: (f) => f.shared },
  { id: "portal", title: "Open a family portal", blurb: "Give a family their own page: proposal, to-dos, payments. Fewer 'just checking' calls.", xp: 40, href: "#/portal", done: (f) => f.portals > 0 },
  { id: "expense", title: "Follow the money", blurb: "Record one expense with its GPay screenshot. The accountant sheds a single happy tear.", xp: 30, href: "#/expenses", done: (f) => f.expenses > 0 },
  { id: "booked", title: "Seal the deal", blurb: "Mark a proposal accepted. Cue the nadaswaram.", xp: 60, href: "#/studio", done: (f) => f.accepted > 0 },
  { id: "backup", title: "Back it all up", blurb: "Proposals live in this browser. Press 'Back up all' in Proposal Studio before the laptop decides to 'update'.", xp: 25, href: "#/studio", done: (f) => f.backedUp },
];

export const LEVELS: { xp: number; title: string }[] = [
  { xp: 0, title: "Fresh Garland" },
  { xp: 60, title: "Haldi Helper" },
  { xp: 150, title: "Mehendi Maestro" },
  { xp: 260, title: "Sangeet Strategist" },
  { xp: 360, title: "Mandap Master" },
  { xp: 455, title: "Muhurtham Legend" },
];

export const TOTAL_XP = QUESTS.reduce((t, q) => t + q.xp, 0);

export interface QuestStatus {
  done: Set<string>;
  xp: number;
  level: { title: string; xp: number; index: number };
  next?: { title: string; xp: number };
  /** the first quest not done yet: the one to suggest */
  nextQuest?: Quest;
}

export function questStatus(f: QuestFacts): QuestStatus {
  const done = new Set(QUESTS.filter((q) => q.done(f)).map((q) => q.id));
  const xp = QUESTS.filter((q) => done.has(q.id)).reduce((t, q) => t + q.xp, 0);
  let index = 0;
  LEVELS.forEach((l, i) => {
    if (xp >= l.xp) index = i;
  });
  return { done, xp, level: { ...LEVELS[index], index }, next: LEVELS[index + 1], nextQuest: QUESTS.find((q) => !done.has(q.id)) };
}

/** Quests finished since the last look, to celebrate once. */
export const newlyDone = (now: Set<string>, seen: string[]) => [...now].filter((id) => !seen.includes(id));

/** One stop of the spotlight tour: where to go, what to light up, and what to say about it. */
export interface TourStep {
  hash: string;
  /** a [data-tour] value; none means a centred card */
  target?: string;
  title: string;
  text: string;
}

export const TOUR: TourStep[] = [
  { hash: "#/dashboard", title: "Welcome, planner!", text: "This is Event Bridge. Think of it as the calm, organised friend every wedding planner deserves. Let's take a quick lap. It's shorter than a baraat, promise." },
  { hash: "#/dashboard", target: "apps", title: "The app bar", text: "Every app lives here. There are no menus: the Dashboard is home base, and every page has a ← Dashboard link back. Like a mandap, everything leads to the centre." },
  { hash: "#/dashboard", target: "stats", title: "Your vital signs", text: "Upcoming events, money waiting on a decision, money received, and things on fire. If 'Needs attention' turns red, that's your cue to put down the chai." },
  { hash: "#/dashboard", target: "events", title: "What's coming up", text: "Every function in the next 90 days. Flip to Calendar to see the month, and click a day to see who's getting married on it." },
  { hash: "#/dashboard", target: "attention", title: "The to-do pile", text: "Overdue payments, follow-ups, tasks and unanswered questionnaires, most urgent first. Empty this and you've earned a second plate of payasam." },
  { hash: "#/studio", target: "studio", title: "Proposal Studio", text: "Where quotations are born. Pick the occasion, add elements, review it as the family will see it, then export or share. Start one now and claim 50 XP." },
  { hash: "#/crm", target: "crm", title: "The CRM", text: "Every enquiry from Instagram, WhatsApp or a cousin's cousin. Move them from New to Won, and never forget to call back again (we'll remind you)." },
  { hash: "#/events", target: "events-page", title: "Events", text: "Each wedding gets a workspace: checklist, questionnaires, payments, expenses, all in tabs. One wedding, one place, zero sticky notes." },
  { hash: "#/dashboard", target: "quest", title: "Your quest log", text: "That's the tour! Open Wedding Quest any time for your missions. Each one earns XP, and enough XP turns you from a Fresh Garland into a Muhurtham Legend. Go get 'em." },
];

export interface QuestStore {
  /** quest ids already celebrated */
  celebrated: string[];
  visited: string[];
  tourDone: boolean;
  /** the welcome card was answered (started the tour or said later) */
  welcomed: boolean;
}

export const QUEST_KEY = "event-bridge.quest.v1";

export function readQuestStore(): QuestStore {
  try {
    const x = JSON.parse(localStorage.getItem(QUEST_KEY) ?? "null");
    return {
      celebrated: Array.isArray(x?.celebrated) ? x.celebrated.filter((s: unknown) => typeof s === "string") : [],
      visited: Array.isArray(x?.visited) ? x.visited.filter((s: unknown) => typeof s === "string") : [],
      tourDone: x?.tourDone === true,
      welcomed: x?.welcomed === true,
    };
  } catch {
    return { celebrated: [], visited: [], tourDone: false, welcomed: false };
  }
}

export function writeQuestStore(s: QuestStore) {
  try {
    localStorage.setItem(QUEST_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: progress lasts for this visit */
  }
}
