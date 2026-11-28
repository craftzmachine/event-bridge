// The Help page's content: how to use each app, written for planners. Pure data, so the test can check that
// every app on the Dashboard has a guide. When you add an app to APPS, add its topic here too.
import { APPS, type AppItem, type IconName } from "./nav";

export interface HelpFaq {
  q: string;
  a: string;
}

export interface HelpTopic {
  id: string;
  title: string;
  icon: IconName;
  summary: string;
  steps: string[];
  tips?: string[];
  faqs?: HelpFaq[];
  /** where "Open <title>" goes; none for general topics */
  href?: string;
}

type AppGuide = Omit<HelpTopic, "id" | "title" | "icon" | "href">;

/** An app's topic takes its id, name, icon and address from the Dashboard's own list, so they can't drift. */
function app(id: AppItem["id"], guide: AppGuide): HelpTopic {
  const a = APPS.find((x) => x.id === id);
  if (!a) throw new Error(`No app "${id}" in APPS`);
  return { id: a.id, title: a.label, icon: a.icon, href: a.href, ...guide };
}

export const HELP: HelpTopic[] = [
  {
    id: "start",
    title: "Getting started",
    icon: "home",
    summary: "Sign in, find your way from the Dashboard, and keep your work safe.",
    steps: [
      "Sign in with your team account. You land on the Dashboard, the starting point for everything.",
      "The apps bar at the top of the Dashboard opens each app. There are no menus: every page has ← Dashboard at the start of its breadcrumb to come back.",
      "The top bar has the crest (back to the Dashboard), the theme and font buttons, Help, your email and Sign out.",
      "Your proposals, enquiries, vendors and tasks are saved in this browser automatically as you work.",
      "Back them up: on the Proposal Studio home, Back up all downloads a file you can Import on another device. A reminder appears if you haven't backed up for 7 days.",
    ],
    tips: [
      "The theme button switches between Dark, Parinay, Solarized Light, Solarized Dark, Nord and White; Aa cycles the font. Both are remembered on this device.",
      "Clearing the browser's site data deletes this device's work, so back up regularly.",
      "Each office app (CRM, Tasks, Vendors, Questionnaires) has its own Export and Import.",
    ],
  },
  app("events", {
    summary: "Every wedding in play, each with its own workspace for the checklist, coordination, payments and expenses.",
    steps: [
      "Open Events from the Dashboard. Accepted proposals and anything with a date appear here.",
      "Switch between Upcoming, Past and All, or search by client. Each row shows a countdown and checklist progress.",
      "Open a wedding to reach its workspace, with tabs: Overview, Checklist, Coordination, Payments, Expenses and Proposal.",
      "Checklist: Start the checklist fills it from the team's list, each task due a set number of days before the first event date. Tick tasks off, or use the Board to move them between To do, Doing and Done.",
      "Coordination: fill in the On-Site Event Coordination sheet for each function (contacts, team, hostesses, timeline, readiness, issue log) and Export PDF to print it.",
      "Payments: record what the family has paid and download receipts. Expenses: the event's spending ledger.",
    ],
    tips: [
      "The checklist and the coordination sheet are internal: they never appear on anything the client sees.",
      "Overview has WhatsApp for the client and checks the guest count against the venue's capacity.",
    ],
  }),
  app("studio", {
    summary: "Build a tailored proposal, review it as the client will see it, and send it as a web page, PDF or Excel file.",
    steps: [
      "Choose New proposal (on the Dashboard or the Studio home), or Start from a package, or From Excel to convert an estimate spreadsheet.",
      "Client & event: enter the client, one or more event dates (+ Add date for multi-day celebrations), contact, venue, guests and budget. Add functions such as Haldi, Sangeet or Reception if the celebration has several.",
      "Occasion: pick the event type (Wedding, Engagement, Reception) and ceremony style (Hindu, Christian, Muslim).",
      "Elements: add items from the catalogue. For each, set qty, rate (or as per actuals), notes, upgrades, and whether it's an additional option. Follow the guest count sets the quantity from the guests.",
      "Review: check the branded preview, set the co-ordination %, round off the Grand Total, and edit notes and terms. The side column has payments, margin and Save as a package.",
      "Send it: create a private web page or PDF link with a password, or Download PDF / Export to Excel to send yourself. Mark the status Sent, Accepted or Lost as things move.",
    ],
    tips: [
      "Drafts save as you type. The quotation reference is created automatically and can't be edited.",
      "The budget bar under the totals suggests cheaper swaps from the same category when you're over budget.",
      "Internal costs and margin are for the team only and are never shown to the client or exported.",
      "Duplicate a proposal to start a new one from it; the copy starts as a draft.",
    ],
    faqs: [
      { q: "Why isn't an additional option in the Grand Total?", a: "Additional options, upgrades marked Offer and as-per-actuals items are listed separately so the family can choose them. They are never added to the Grand Total." },
      { q: "What does \"as per actuals\" mean?", a: "The item has no fixed rate: it will be charged at what it actually costs. It adds nothing to the Sub Total and is listed under its own heading." },
      { q: "Is GST included in the Grand Total?", a: "No. The Grand Total is before GST. GST and the total including GST are shown as reference figures, and payment milestones are shares of the total including GST." },
    ],
  }),
  app("crm", {
    summary: "Track enquiries from the first message to a booking, and see every client behind your proposals.",
    steps: [
      "Add an enquiry: where it came from, the occasion, date, guests, budget and venue in mind.",
      "Move it through the stages: New, Contacted, Meeting, Proposal sent, Won or Lost (with a reason).",
      "Set a next follow-up date, and log calls, meetings, WhatsApp messages and notes as you go.",
      "Create proposal opens a new proposal filled in from the enquiry. The enquiry then follows it: sent, accepted (Won) or lost.",
    ],
    tips: [
      "Board, List and Clients views: List puts follow-ups first, Clients lists everyone behind your proposals, one per mobile number.",
      "Follow-ups due also show on the Dashboard under Needs attention.",
    ],
  }),
  app("tasks", {
    summary: "The team's own tasks and every wedding's checklist in one place.",
    steps: [
      "Add a team task with a due date, who's doing it, an optional event, priority and notes.",
      "Filter by Mine, Whole team or Family's, and by event.",
      "Work from the list (Overdue, This week, Later, Done), the board, or the calendar.",
      "Tick a checklist task here and it's ticked in the wedding's workspace too.",
    ],
  }),
  app("vendors", {
    summary: "The rolodex: who to call, what they charge and what you've paid them.",
    steps: [
      "Add a vendor: category, contact, phone, UPI ID, area, prices, a 1–5 rating, tags and notes.",
      "Search, or filter by category and area, to find who you need.",
      "Use WhatsApp or Call on a card to get in touch.",
      "Each card shows what's been paid to that vendor across events, taken from your expenses.",
    ],
    tips: ["When you record an expense, the payee field suggests names from the rolodex."],
  }),
  app("questionnaires", {
    summary: "Build a set of questions once, send it to a wedding, and keep the family's answers.",
    steps: [
      "Create a questionnaire, or start from the team's planning questionnaire.",
      "Add questions: short answer, paragraph, one or several choices, date, number or yes/no. Mark any as required and add hints.",
      "Under Send to a wedding, pick the event.",
      "The family answers in their client portal, or you can fill answers in from a call in the event's Questionnaires tab.",
    ],
  }),
  app("portal", {
    summary: "Give each family a private, password-protected page with their proposal, to-dos, payments and questionnaires.",
    steps: [
      "Open Client Portal and pick a wedding.",
      "Create portal gives you a link and a password. Send them separately, for example the link by email and the password by WhatsApp.",
      "The family can approve the proposal or ask for changes, tick their to-dos, see the payment schedule and answer questionnaires.",
      "Update portal sends them the latest on the same link and password. Turn off ends access.",
    ],
    tips: [
      "Their answers come back into the wedding when you open the Portal page or the event.",
      "The portal never shows your costs, the family's budget or the team's own tasks.",
    ],
  }),
  app("expenses", {
    summary: "Record what's spent on each wedding and by the company, with proof, staff advances and handovers for review.",
    steps: [
      "Press Record expense on the Dashboard, or Add expense on the Expenses page. Choose what it's For: Company, or the event. It starts on the one you used last.",
      "Attach the GPay screenshot or a receipt photo (Take photo, Choose screenshot, or paste), then the amount, date, who was paid, the category, who paid and the UPI transaction ID. Time and the payee's UPI ID are under More details.",
      "The Expenses page shows this month's spending, recent expenses and every ledger (Company first). Open one to see its full list, filters and advances.",
      "Give money records a staff advance: who it's for, the amount and a settle-by date. Their expenses then come out of it, and the card shows what's left.",
      "When the event is done, Prepare handover checks for missing proof and duplicates, then creates a .zip file.",
      "Send the file to the colleague who'll check it. They open Expenses → Receive a handover, mark each expense Checked, Query or Reject, and Sign off.",
      "Import their reply back on your device. Once reconciled, Clear from this device removes the event's expenses.",
    ],
    tips: [
      "A UPI transaction ID already recorded for the event blocks the save, so nothing is entered twice.",
      "Nothing is deleted outright: removing an expense needs a reason and it can be restored; every edit is in its History.",
      "Expenses and screenshots stay in this browser only, so use your own phone.",
    ],
    faqs: [
      { q: "Can it read my Google Pay payments automatically?", a: "Not yet. Entry is manual for now; reading the details from screenshots is planned. A website can't read payment notifications." },
      { q: "Why can't I review a handover?", a: "The reviewer must be someone else: anyone who recorded or edited the expenses, or gave, held or moved money on its advances, is refused." },
    ],
  }),
  app("venues", {
    summary: "Search halls, hotels and resorts around Thiruvananthapuram, and start a proposal at one.",
    steps: [
      "Search by name, or filter by type (hotels, resorts, event venues) and area.",
      "Open a venue for its spaces, capacity, star rating, address and links.",
      "Start proposal begins a quotation with the venue already filled in.",
    ],
    tips: ["The Venue field in a proposal also suggests directory venues, and warns when the guests are more than its largest space holds."],
  }),
  app("visualize", {
    summary: "Share a PDF or Excel proposal as a private, password-protected, view-only page.",
    steps: [
      "Drop in a PDF or .xlsx file (up to 4 MB; PDFs up to 30 pages).",
      "Enter the client's name and a title.",
      "Choose a password (or Generate) and how long the link lasts: 7, 30 or 90 days.",
      "Create private link gives you the link and the password. Send them separately.",
      "Watch the list for views and the client's answer (approved or changes requested). Revoke ends access immediately.",
    ],
    tips: ["From Proposal Studio, the Review step's Send it to the client does all of this in one go."],
  }),
  app("guests", {
    summary: "Keep each wedding's guest list, let guests answer from their phone, then draw the floor plan and seat them.",
    steps: [
      "Open Guests & Seating from the Dashboard. Every wedding is listed with its guests, replies and seating; Guests, Layout and Seating open that wedding's tab. (They're also tabs in each wedding's workspace under Events.)",
      "Add guests one household at a time (name, phone, side, group, how many people), or Paste a list straight from Excel or Google Sheets.",
      "Untick the functions a household isn't invited to. Everyone starts invited to all of them.",
      "In RSVP link, set a reply-by date and meal choices, then Create RSVP link.",
      "Each guest's WhatsApp button opens a message with their personal link. They see only their own invitation and answer Coming, Not sure or Not coming for each function, with how many and their meal.",
      "Replies come back when you open the Guests tab. The cards at the top count who's coming to each function.",
    ],
    tips: [
      "Changed the list or the date? Press Update RSVP link so guests see the latest; the links stay the same.",
      "Tick 'Let people who aren't on the list reply' for an open link you can post in a family group; those replies arrive as new guests.",
      "Use confirmed headcount sets the proposal's guest count from the replies, so per-guest items follow it.",
      "Guests never appear on the proposal or portal you share with the family.",
    ],
  }),
  app("plans", {
    summary: "Floor plans and seating that aren't tied to a wedding: a venue's standard layout, a mock-up for a pitch, or practice.",
    steps: [
      "Open Floor Plans from the Dashboard and press New plan: a name, the venue and roughly how many guests.",
      "Layout: start from a starter sized for the guests, a saved venue plan or an empty room, then add tables, the mandap, an aisle and the rest (see Venue layout & seating).",
      "Guests: add households or paste a list from a spreadsheet (name, phone, side, group, people). There's no RSVP: everyone on the list is seated.",
      "Seating: drag households onto tables or use Auto-seat, as for a wedding.",
      "The Counts panel totals tables and chairs; Inventory ▾ downloads the list for the rental vendor as PDF or Excel.",
      "Copy into a wedding puts the layout on one of a wedding's functions (the wedding seats its own guests). Duplicate makes a copy to try another idea.",
      "Background ▾ puts the venue's own drawing (a photo, scan or PDF page) under the plan: Set the scale by measuring one wall you know, then trace over it.",
      "Print ▾ saves the plan to scale (1:50 to 1:500 on A4 or A3) with a scale bar, legend, sizes and counts, for the venue and décor teams.",
    ],
    tips: [
      "New to the editor? Start the tutorial opens a practice plan and walks you through it step by step.",
      "⛶ Fullscreen (or F) gives the editor the whole screen; Esc or the button brings it back.",
      "✓ Checks looks for narrow aisles, tables too close together, chairs too near the stage or an entrance, and a crowded room, and fixes what it can in one click.",
      "Plans are saved on this device; Export and Import move them to another.",
    ],
  }),
  {
    id: "layout",
    title: "Venue layout & seating",
    icon: "pin",
    href: "#/events",
    summary: "Draw each function's floor plan, then seat the guests at its tables and print the seating plan.",
    steps: [
      "Open a wedding from Events, then the Layout tab, and pick the function.",
      "Start from Reception rounds, Banquet long tables or Mandap with chair rows (sized for your guests), a plan saved for this venue, or an empty room.",
      "Add tables, chair rows, stage, mandap, dance floor, buffet and more: click an item under Add, or drag it straight onto the plan where you want it.",
      "Drag a table to move it: it snaps to the grid and lines up with its neighbours (gold guide lines); hold Alt to place it freely. Pull any of the eight handles to resize it and the top knob to rotate it; the size, angle and seats show as you drag, and the chairs follow the table's size.",
      "The small toolbar above a selected table changes its seats (− and +), rotates it 90°, duplicates, locks it in place or deletes it. Right-click (or press and hold on a phone) for more: copy, paste here, bring to front, send to back.",
      "Click a table or any of its chairs to select it. Drag across empty floor to select several (left to right picks what's wholly inside, right to left anything it touches; Shift adds), then move, align or space them evenly. Alt-click picks the item underneath; ☰ Layers lists everything, to select, hide, lock or reorder.",
      "Pan with the ✋ Hand tool (H), by holding Space, with the middle mouse button or with two fingers; ⬚ Select (V) goes back to box selection. Scroll or pinch to zoom.",
      "Keys: arrows move (Shift for 1 m), R rotates, + and − change seats, Delete removes, Ctrl+C / Ctrl+V copy and paste, Ctrl+D duplicates, Ctrl+] / Ctrl+[ bring forward and send back, Ctrl+Z / Ctrl+Y undo and redo, F fullscreen, L layers.",
      "Open the Seating tab. Drag a household from the list onto a table or a seat, or tap them and then tap a table. Auto-seat fills the rest, keeping households and groups together.",
      "Download seating PDF prints the floor plan, each table's guests and an A–Z list for the welcome desk.",
    ],
    tips: [
      "Overlapping items are outlined in red. The Room panel compares seats with the guests coming and the venue's capacity, and ✓ Checks flags narrow aisles, tight gaps between tables and blocked entrances.",
      "A dance floor, aisle or stage always sits under the tables, so tables on top of it stay easy to click.",
      "Lock the stage, mandap and walls once they're placed, so they don't move while you arrange tables round them.",
      "Realistic shows chairs, tablecloths with table numbers, a chequered dance floor and the mandap's pillars; Simple shows plain shapes. Rulers adds metre rulers; Measure (or M) lets you drag to measure a distance. The minimap in the corner jumps to any part of the room.",
      "Grid of tables adds rows × columns of tables in one go; Renumber numbers them left to right, top to bottom; Image downloads the plan as a picture to send to the family or the venue.",
      "Select an item to type its exact size in metres, or pick a common size (mandap 4 × 4 to 8 × 8 m, stage, aisle, table sizes). Tables ▾ sets every table to the same number of seats or spreads a number of guests across them.",
      "The Counts panel totals tables, chairs and every item as you work; Inventory ▾ downloads the list for the rental vendor as PDF or Excel. New to it? Press 🎓 Tutorial for a step-by-step walk-through.",
      "Press 3D (top right) to look round the room in 3D: Overview, Top, From the entrance, From the stage, or Walk (drag to look, W A S D or the arrow keys to move). Save image keeps a picture. In the Seating tab, the 3D chairs show who sits where. Switch back to 2D to make changes.",
      "Save as a venue plan to reuse the room for the next wedding there.",
      "Seating flags anyone seated who has since said no, households split over tables, and people who lost a seat when a table changed.",
    ],
  },
  {
    id: "settings",
    title: "Company settings",
    icon: "settings",
    href: "#/settings",
    summary: "Your company details, logo, money defaults, terms and catalogue, edited in the app.",
    steps: [
      "Open Settings from the top bar (the gear).",
      "Company: name, tagline, legal name, GSTIN, phone, email, address and the point of contact printed on proposals.",
      "Logo & money: upload your logo (PNG, JPG, WebP or SVG under 400 KB), and set the co-ordination %, GST % and when the balance falls due.",
      "Terms: the standard terms printed on every proposal, one per line. Reorder them with the arrows.",
      "Catalogue: rename and reorder categories, and add, edit or remove elements with their unit, rate (or as per actuals), per-guest quantity, description and which occasions they suit.",
      "Press Save changes. New proposals and exports use them straight away.",
    ],
    tips: [
      "Settings are saved on this device. Use Backup → Export settings, then Import settings on a colleague's device.",
      "Reset to original goes back to the details and catalogue the site was published with.",
      "Proposals already made keep their own copy of each element, so editing the catalogue doesn't change them.",
    ],
  },
  {
    id: "quest",
    title: "Wedding Quest",
    icon: "help",
    summary: "A light-hearted guide: a spotlight tour and missions that tick themselves off as you work.",
    steps: [
      "Press the gold button in the bottom-right corner of any page to open the quest log.",
      "Take the tour for a two-minute walk through the Dashboard, Proposal Studio, the CRM and Events. Use Next and Back, the arrow keys, or Skip tour.",
      "Missions such as Start your first proposal tick themselves off when you do them. Show me takes you to the right page.",
      "Each mission earns XP, taking you from Fresh Garland to Muhurtham Legend.",
    ],
  },
  {
    id: "faq",
    title: "Questions",
    icon: "help",
    summary: "Common questions about data, sharing and privacy.",
    steps: ["Search above, or open a question below."],
    faqs: [
      { q: "How do I move my work to another device?", a: "On the Proposal Studio home, Back up all downloads every proposal as a file; Import it on the other device. The CRM, Tasks, Vendors and Questionnaires each have their own Export and Import." },
      { q: "Can a client ever see our costs or margin?", a: "No. Costs stay on this device and are removed from every PDF, Excel file, web page and portal the client receives." },
      { q: "How should I send a private link?", a: "Send the link and the password separately, for example the link by email and the password by WhatsApp. WhatsApp buttons open the message ready to send; nothing goes until you press Send." },
      { q: "A client says their link doesn't work.", a: "Links can end (7, 30 or 90 days) or be revoked, and a wrong password looks the same as an ended link. Create a new link, or Update portal for a client portal." },
      { q: "I was signed out while sharing.", a: "Sessions last 12 hours. Choose Sign in again; the open proposal reopens afterwards." },
    ],
  },
];

const textOf = (parts: (string | undefined)[]) => parts.filter(Boolean).join(" ").toLowerCase();
const hasAll = (text: string, terms: string[]) => terms.every((t) => text.includes(t));

/**
 * The topics matching every word of the query, case-insensitively. A topic found only through its questions keeps just
 * the questions that match; an empty query returns everything.
 */
export function searchHelp(topics: HelpTopic[], query: string): HelpTopic[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return topics;
  const out: HelpTopic[] = [];
  for (const t of topics) {
    const main = textOf([t.title, t.summary, ...t.steps, ...(t.tips ?? [])]);
    const faqs = t.faqs ?? [];
    const faqHits = faqs.filter((f) => hasAll(textOf([f.q, f.a]), terms));
    if (hasAll(main, terms)) out.push(t);
    else if (faqHits.length) out.push({ ...t, faqs: faqHits });
    else if (hasAll(textOf([main, ...faqs.map((f) => `${f.q} ${f.a}`)]), terms)) out.push(t);
  }
  return out;
}
