# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Event Bridge** ("EB"): a static, server-less workspace for the Parinay Weddings (Events IQ) team, branded with the Parinay crest. Its feature apps are **Proposal Studio**, the **Venue Directory** and **Visualize Proposal** (password-protected, view-only sharing of a PDF/Excel file with a client). In Proposal Studio, salespeople pick an event type × ceremony style, curate catalogue elements (qty, rate, notes, upgrades, additional options), review a branded preview and export an `.xlsx` or `.pdf`. Themes and fonts can be switched.

The site name and tagline live in `src/site.ts` (`SITE`). Proposals and exports keep the *company* branding from `brand.json` (Parinay Weddings), so don't put "Event Bridge" into `ProposalPreview`, `exportXlsx` or `exportPdf`. Vite + React 18 + TypeScript, plain CSS plus Tailwind v4 utilities (see Styling), ExcelJS, pdfmake 0.2, Vitest. No router, no state library. The site is static; the only backend is the Visualize Proposal API (`api/` Vercel Functions + `server/`). Deployed on Vercel from `main`.

## Commands

```bash
npm run dev                         # Vite dev server on http://localhost:5173 (.claude/launch.json: "proposal-builder")
npm test                            # vitest run (all tests)
npx vitest run src/lib/totals.test.ts         # one file
npx vitest run -t "derives the round-off"     # one test by name
npx tsc -b                          # type-check only (strict, noUnusedLocals/Parameters)
npm run build                       # tsc -b && vite build → dist/ (base "./", hostable anywhere)
npx vite preview --port 4173        # serve dist/ (.claude/launch.json: "proposal-builder-prod")
```

`npm run dev` also serves `api/*` through the `devApi` plugin in `vite.config.ts`, which `ssrLoadModule`s the route file. `node scripts/visualize-setup.mjs --dev` writes a gitignored `.env.local` (`VISUALIZE_STORE=memory` plus secrets), so sharing works locally without Vercel storage; without it, the API answers 503 "isn't set up". `npx vite preview` sends the same security headers as `vercel.json` (it reads them), so CSP problems show up locally.

To inspect the generated PDF, run `PDF_SAMPLE=<path> npx vitest run src/lib/exportPdf.test.ts` (in PowerShell, `$env:PDF_SAMPLE="<path>"`), then open the file.

There is no linter configured. CI (`.github/workflows/ci.yml`, Node 22) runs `npm ci`, `npx tsc -b`, `npm test` and `npm run build` on every push and PR to `main`; Vitest 4 needs Node 20+. Tests use throwaway accounts (`checkCredentials(email, password, accounts)`), never the real ones.

**Shell notes (Windows PowerShell 5.1; Git Bash also available):**
- There is no `&&`.
- Commit messages containing double quotes get split into pathspecs when passed with `-m`, so write the message to a file and use `git commit -F <file>`.
- `@(@('a','b'))` flattens to a single array, so loops over "pairs" silently iterate characters instead. Prefer the Edit tool for multi-file text edits.

## Architecture

**Config is data, loaded at runtime — not imported.** `public/config/catalog.json` (event types, ceremony styles, categories, elements), `public/config/brand.json` (company, logo path, contact, GSTIN, coordination %, GST %, Excel colours, default terms) and `public/config/venues.json` (TVM venue directory; search/filter logic in `src/lib/venues.ts`) are fetched with `cache: "no-store"` by `src/config/load.ts`, validated by `src/config/validate.ts`, and exposed through `ConfigContext` (`useConfig()`). Editing them changes offerings without a rebuild. Any change to their shape must be reflected in `src/types.ts` *and* `validate.ts` (which produces the human-readable error list shown instead of the app). Tests read these same JSON files from disk.

**Company settings** (`#/settings`, `src/pages/Settings.tsx` (lazy), rules in `src/lib/settings.ts`, storage in `src/state/settings.ts`, `settings.test.ts`):
- **What:** the Settings page edits the brand fields in `BRAND_FIELDS` (company, contact, logo, coordination/GST %, terms, balanceDueDays…) and the whole catalogue (categories and elements). It's the first step of the product plan (`docs/PRODUCT_PLAN.md`), so other companies can brand Event Bridge without editing JSON.
- **Storage:** `event-bridge.settings.v1` on this device only. Brand overrides hold only fields that differ from `brand.json`, so later file edits still come through; a saved catalogue replaces `catalog.json`. Export/import uses `settingsFile`/`readSettingsFile` (unknown brand fields are dropped).
- **Loading:** `loadConfig` applies `applySettings` after validating the files. A saved part that no longer validates is set aside (`settingsIgnored`, shown on the Settings page), never fatal. `Loaded.base` keeps the files as shipped. After a save, `App` reloads the config (`onSaved`).
- **Saving:** `checkSettings` reuses the validators plus range checks and the 400 KB logo cap, and rejects removing a category a team package uses.
- **Logo:** a saved logo is a `data:` URL, so always build logo URLs with `assetUrl(brand.logo)` (`src/lib/asset.ts`), never `BASE_URL + brand.logo`. Web-page shares and the client view still show the site's own logo.
- **Dashboard:** `SetupGuide` (`src/components/SetupGuide.tsx`) is a first-run checklist (settings, catalogue, first enquiry, proposal, share), hidden with `event-bridge.setup-hidden.v1`.
- **Landing:** the pricing section reads `PLANS` (`src/lib/plans.ts`); keep it in step with section 2 of `docs/PRODUCT_PLAN.md`, and list only features that exist.

**Element relevance** is tag-based: each element has `eventTypes` / `ceremonyStyles` arrays, `["*"]` meaning all; `elementFits()` in `src/config/context.ts` decides what the Elements step shows. `defaultPrice: null` means "as per actuals".

**Venue facts must stay sourced.** Each venue carries `verification` and `sources`. Don't add or change names, star ratings or capacities without a source. All venues were researched on 2026-11-04 (official sites, then Kerala Tourism and listings); six from the team's list couldn't be found online and say so in `verification`.

Photos must show the actual venue and be licensed for commercial use: CC BY, CC BY-SA, CC0 or public domain; not NC or ND. So far only Taj Green Cove and The Leela have one, from Wikimedia Commons. A 2026-11-04 search of Openverse and Commons for every venue found nothing else that clearly matched, and the README lists what was rejected. Team photos go in `public/images/venues/<id>.jpg`. Each photo gets a `photoAlt` (descriptive alt text; `Venues.tsx` falls back to "Photo of <name>"). Each one carries a `photoCredit` (author, licence, source page), which `validateVenues` enforces. Official venue and listing-site photos are copyrighted, so link them with `gallery` instead of copying them; don't reintroduce stock photos. One venue may be `featured` (validated): Taj Green Cove is first in the file and `Venues.tsx` renders it as the large `FeaturedVenue` card above the grid. On grid cards (which are buttons) the credit is plain text; the dialog links it. Without a `photo`, `Venues.tsx` shows a `Monogram` of the name's initials, and with an empty `spaces` it says "Spaces and capacity to be confirmed". `aka` is rendered as "Also known as …", so put landmarks ("opposite Technopark") in `address`, not `aka`. `venues.test.ts` asserts the total count (29), per-type counts, the featured venue and which venues have photos, so update it when adding venues or photos.

**Navigation: hash routes, then component state.** `App.tsx` reads the top-level page from the URL hash so it can be linked to on any static host with no rewrites:
- `#/` → `Landing` (public)
- `#/login` → `Login`
- `#/dashboard` → `Dashboard` (team overview)
- `#/events`, `#/events/<proposalId>[/<tab>]` → `Events` (lazy; the events list and one wedding's workspace)
- `#/crm`, `#/tasks`, `#/vendors`, `#/questionnaires`, `#/portal` → the office apps (each lazy; see "Office apps")
- `#/expenses`, `#/expenses/<proposalId>`, `#/expenses/company`, `#/expenses/review/<handoverId>` → `Expenses` (event and company expenses, and handovers)
- `#/studio` → Proposal Studio (`Home`)
- `#/venues` → `Venues` (the Venue Directory)
- `#/visualize` → `Visualize` (staff sharing)
- `#/settings` → `Settings` (lazy; company settings, linked from the top bar's gear, not an `APPS` tile)
- `#/help`, `#/help/<topic>` → `Help` (lazy; how to use each app). Its content lives in `src/lib/help.ts` (`HELP`, `searchHelp`); app topics take their id, label, icon and href from `APPS`, and `help.test.ts` checks every `APPS` entry has one, so add a topic when adding an app and keep the steps in step with the README.
- `#/view/<token>` → `ClientView` (public; the client's password gate and viewer)
- `#/rsvp/<token>[/<code>]` → `Rsvp` (public, lazy; a guest's RSVP page)

`App` keeps the raw `hash` in state and derives the route, so moving between `#/view/<a>` and `#/view/<b>` re-renders. The signed-in routes (`APP_ROUTES`: dashboard, events, crm, tasks, vendors, questionnaires, portal, expenses, studio, venues, visualize, help) need a session. Without one, an effect stores the target in the module-level `returnTo` and goes to `#/login`; after sign-in it goes back to `returnTo`. `returnTo` is reset only once that route is reached, because the login → app redirect races `onSignedIn`. Sign-in lands on the Dashboard (`returnTo` defaults to `dashboard`). An open proposal (`openId`) shows `Builder` only over the dashboard, studio or venues route, and closing it returns to that route. Pages that open a proposal from elsewhere (the workspace, CRM) set `openId` and go to `#/studio`.
- **No menus: the Dashboard is the hub.** Signed-in pages render inside `src/components/AppShell.tsx`, a slim top bar (the crest back to the Dashboard, appearance, Help, account, sign out) with no menu. The Builder, Login, Landing and ClientView stay outside it.
  - **Apps:** `src/lib/nav.ts` `APPS` is the app catalogue (label, description, href, icon; tested). The Dashboard renders it as tiles with a live line each (`AppTiles`), and the landing page reuses it.
  - **Icons:** inline SVG in `src/components/icons.tsx`.
  - **Headers:** pages use `PageHeader` (breadcrumb, title, subtitle, actions slot) or `Breadcrumbs` from `src/components/PageHeader.tsx`. A first crumb pointing at `#/dashboard` renders as "← Dashboard", the way back.
- **Wedding Quest** (`src/lib/quest.ts`, `src/components/Quest.tsx`, `quest.test.ts`): a playful guide mounted in `AppShell`.
  - **Quest log:** a floating button (`.qx-fab`) opens it. `QUESTS` tick themselves off from real data (`QuestFacts`: proposals, leads, vendors, tasks, expenses, routes visited…), earn XP, and XP gives a title (`LEVELS`; the top level equals `TOTAL_XP`, which a test checks).
  - **Tour:** `TOUR` steps go to a page and spotlight an element marked `data-tour="…"`. `PageHeader` takes a `tour` prop for that, so keep the targets when editing those pages.
  - **First visit:** the welcome card shows on the Dashboard.
  - **Storage:** progress is in `event-bridge.quest.v1`, and finished quests get confetti once.
- **Landing header:** `src/components/SiteNav.tsx` is only the landing page's header: the brand, appearance, and Team sign in or Dashboard. There are no menu items.
- **Builder:** a 4-step wizard (client, occasion, elements, review); steps are inner components of `src/pages/Builder.tsx`.

**Persistence** (`src/state/proposals.ts`): all proposals live in `localStorage` under `proposal-builder.proposals.v1`, written on every change via `useProposals()`. JSON export/import is the only way to move them between devices. Changing the `Proposal` shape needs migration-tolerant reads, since old drafts persist. The backup reminder on the Studio home is decided by the pure `backupDue` in `src/lib/backup.ts`; only "Back up all" records a backup (`event-bridge.last-backup.v1`, read and written by `readBackupState`/`writeBackupState`).

**Excel → proposal** (`src/lib/excelImport.ts`, `src/lib/readWorkbook.ts`, `src/components/ExcelImport.tsx`).
- **The converter is pure.** `convertWorkbook(grid, ctx, answers)` works on plain cell grids, so `excelImport.test.ts` runs it in Node. It returns:
  - `error` for a file it can't convert
  - `questions`: the ones still open; some only appear after an earlier answer
  - `ready`: a `Proposal` plus a report of each value's source cell
- **It never fills in a value.** Anything missing, unclear or contradictory becomes a question; keep it that way.
- **Answers:** keyed by question id (`qty:<sheet>!<row>`, `category:<section>`, …). A "decide later" choice is `""`, and `SKIP` leaves a row out.
- **Reader:** `readWorkbook` uses ExcelJS and is `await import`ed by the dialog, like the exports. Merged cells keep only their top-left value, and formulas give their cached result.
- **`.xls`** (OLE) is recognised and explained, not read. Adding SheetJS in `readWorkbook` is the only change needed for it.
- **Saving:** creating goes through `store.importMany`, the same path as a JSON import.
- **Round trip:** a test converts a `buildWorkbook` export back to the same proposal. If you change the export's layout or labels, keep that test passing.

**Proposal status** (`src/lib/status.ts`, tests in `status.test.ts`). `Proposal.status` is optional: drafts saved before it read as `"draft"`, so always read it through `proposalStatus(p)`. Change it only with `statusPatch(cur, status)`, which sets `statusAt` and, the first time it leaves draft, `sentAt` (kept afterwards). The Studio home's summary (`pipelineSummary`) counts "sent this month" by `sentAt` and "accepted this month" by `statusAt`, valued at each proposal's Grand Total. `duplicate` resets the copy to a draft.

**Planning features.** Every field below is optional on `Proposal`/`Line`, so old drafts read as before.
- **Functions** (`src/lib/functions.ts`, `functions.test.ts`):
  - **Data:** `Proposal.functions` holds `{id, label, date}`, and `Line.fn` points at one. Always resolve a line's function with `fnOf(p, l)` (an unknown or missing fn means the first function) and group with `byFunction`. `functionTotals` gives the subtotals.
  - **Outputs:** the preview, PDF and Excel render the same structure. In Excel, a `FUNCTION: <label> — <date>` row (merged A:G) and a `<label> subtotal` row make the Sub Total the sum of those cells. `excelImport` reads both rows back, and the round trip is tested.
  - **Without functions:** everything renders exactly as before (no wrapper around the preview tables).
- **Guests and budget** (`src/lib/guests.ts`, `src/lib/budget.ts`, `budget.test.ts`):
  - **Fields:** `client.guests` and `client.budget`.
  - **Per-guest lines:** `Line.perGuest` set means qty = ⌈guests × perGuest⌉ (`applyGuests` when the count changes). Typing a qty clears it. Catalogue `perGuest` is validated.
  - **Capacity:** `capacityWarning` uses the directory venue matched by name and `largestCapacity`.
  - **Swaps:** `budgetSuggestions` offers cheaper same-category, fitting elements.
- **Cost and margin** (`src/lib/margin.ts`, `src/state/costs.ts`, `margin.test.ts`):
  - **Field:** `Line.cost` is the internal cost **per unit**. The cost sheet (`event-bridge.costs.v1`) and minimum margin (`event-bridge.min-margin.v1`) live only in localStorage.
  - **Rule:** costs must never reach a client output. `onlyShown` in `proposalPage.ts` strips `cost`/`perGuest`, packages strip `cost`, and a test checks the PDF, workbook and snapshot. Never put costs in `public/config`.
- **Payments** (`src/lib/payments.ts`, `src/lib/exportReceipt.ts`, `payments.test.ts`):
  - **Data:** `Proposal.payments = { plan?, received }`. With no plan, `planFor` derives one from `brand.paymentPlan`, else 70% on booking (dated from acceptance) and 30% `balanceDueDays` (7) before the first event date.
  - **Amounts:** a share of **total incl. GST**, rounded to the rupee, with the last milestone taking the remainder. Payments are applied in order.
  - **Receipts:** `R-<ref>-<n>`. `buildReceiptDoc` is pure and lazy-loaded, and renders through `renderPdf` in `exportPdf.ts`.
- **Packages** (`src/state/packages.ts`, `packages.test.ts`): the team's come from the optional `public/config/packages.json` (`validatePackages`; a 404 means none), and the planner's own from `event-bridge.packages.v1`. `proposalFromPackage` goes through `newProposal`, so the proposal gets a fresh ref, and it gives new line and function ids.
- **WhatsApp** (`src/lib/whatsapp.ts`): `waNumber` reads Indian mobiles typed with or without +91, and `waLink` builds a `wa.me` link. These only open WhatsApp; the app never sends anything.
- **Events and their workspace** (`src/pages/Events.tsx`, lazy; `src/lib/events.ts`, `events.test.ts`):
  - **List:** `eventsFor(list, tab, today)` gives accepted or dated proposals that aren't lost (lost ones only under All), with upcoming soonest first and past most recent first. `countdown` gives "In 12 days", "On now", "3 days ago".
  - **Tabs:** `#/events/<id>/<tab>`: overview, guests, layout, seating, checklist, coordination, payments (the Builder's `PaymentsCard`, with a `set` that goes through `store.update`), expenses (`EventLedger`, exported by the lazy `Expenses.tsx`) and proposal.
  - **Edits** from these pages use `useProposals().update(id, fn)`, which builds on the latest saved list (the functional-update lesson).
- **Wedding checklist** (`Proposal.checklist`, `src/lib/checklist.ts`, `src/components/Checklist.tsx`, `checklist.test.ts`):
  - **Tasks:** each has `due` (a fixed date) or `offsetDays` before `eventDates(p)[0]` (negative for after), an owner (`team` | `client`) and a state (`todo` | `doing` | `done`, where `done` records who and when).
  - **Templates:** from the optional `public/config/checklists.json` (`validateChecklists`, `ConfigContext.checklists`). The shipped file equals `DEFAULT_CHECKLIST`, and a test keeps them in step.
    - `getOptionalJson` treats an HTML answer as missing, because the Vite dev server serves the app page for unknown paths.
  - **Logic:** `bucketOf` (overdue, week, later, undated, done), `progress` and `overdueAcross`.
  - **Copies and clients:** `duplicate` resets the checklist (`resetChecklist`). `pageSnapshot` never includes it (tested).
- **On-site coordination sheet** (`Proposal.coordination`, `src/lib/coordination.ts`, `src/components/CoordinationSheet.tsx`, PDF in `src/lib/exportCoordination.ts`, `coordination.test.ts`):
  - **Source:** the team's Word form "On-Site Event Coordination & Responsibility Sheet". Its fixed wording (hostess stations, default cues, duties per kind, readiness, escalation, handover) lives as constants in `coordination.ts`; keep the UI and PDF in step with it.
  - **Data:** one `CoordinationSheet` per function, keyed by `fnId` (`""` when the proposal has no functions; `sheetFunctions` gives the stand-in). Read with `sheetFor(p, fn)`, which fills in a new sheet from the proposal (`newSheet`: client, function and date, `venueLine`, guests; nothing else) or completes an older saved one. Write with `setSheet` inside `store.update`.
  - **Kind:** `guessKind` picks the duties block (hindu, reception, sangeet, other) from the function's label and the ceremony style; the coordinator can change it.
  - **PDF:** `buildCoordinationDoc` is pure (A4, one sheet per page run, blank fields as empty ruled cells, drawn checkboxes because Roboto has no ☐), lazy-loaded through `downloadCoordination` like the receipt.
  - **Internal:** never in `pageSnapshot`/`portalSnapshot` (tested), and `duplicate` drops it.
- **Guests & RSVP** (`Proposal.guestList`; `src/lib/guestList.ts`, `src/components/GuestList.tsx`, `src/pages/Rsvp.tsx`, `server/rsvp.ts`; tests `guestList.test.ts`, `server/rsvp.test.ts`):
  - **Data:** a `Guest` is a household: `invited` (party size), `fns` (function ids; `""` without functions, read through `invitedTo`, which treats an old `""` as all functions once functions exist), a 10-character `code` for their personal link, and `reply` per function (`yes`/`no`/`maybe` + count). Totals come from `rsvpSummary`; `confirmedHeadcount` is only applied by the "Use confirmed headcount" button, never automatically.
  - **Server:** `api/staff/rsvp` (staff session: POST create, PUT refresh in place, GET replies, DELETE turn off) and the public `api/rsvp` (POST `{token, code?}` reads, with `reply` saves). The invitation (`inviteSnapshot`: couple, functions, deadline, meals, and per household only code, name, party size and functions) is stored encrypted, each reply under its own key (`rsvp:<id>:r:<code>`, so simultaneous replies can't overwrite each other). A personal link returns only that household; wrong codes, unknown and turned-off links get the same 404. Replies are cleaned against the invitation (`cleanReply`, mirrored in `src/lib/guestList.ts`, keep both in step), refused after the deadline (end of day IST), rate-limited per IP, with a honeypot field. Open replies (no code, only when `open`) need a name and phone and are keyed `open-<hash of phone>`, capped at `RSVP_OPEN_MAX`.
  - **Studio:** the Guests tab fetches replies when `rsvp.shareId` is set and applies `mergeRsvp` (newer wins; a team edit sets `repliedAt`, so an older server reply can't overwrite it; open replies become guests with `source: "rsvp"`). `rsvp.synced` is an `inviteKey` fingerprint of what was last sent, which drives "Update RSVP link".
  - **Public page:** `#/rsvp/<token>[/<code>]`, outside the shell like `#/view`, in the proposal's `pageTheme`.
  - **Privacy:** never in `pageSnapshot`/`portalSnapshot` (tested); `duplicate` drops `guestList` and `seating`.
- **Venue layout & seating** (`Proposal.layouts`, `Proposal.seating`, both keyed by function id like the coordination sheets; `src/lib/layout.ts`, `src/lib/seating.ts`, `src/components/LayoutEditor.tsx`, `src/components/SeatingBoard.tsx`, `src/components/VenuePlan.tsx`, `src/components/layout/`; tests `layout.test.ts`, `seating.test.ts`):
  - **Geometry:** SVG, not canvas, with the `viewBox` in metres; an item's `x, y` is its centre and `rot` is degrees. `bounds`/`corners` handle rotation, `clampToRoom` keeps items inside, `clashes` outlines overlaps. Tables are items with `seats` (`round`, `rect`, `row`); `seatPositions` places the chairs, so layout and seating share one plan.
  - **Editor:** local draft plus an undo stack; a change is committed (saved through `store.update`) on pointer-up or key press, never on every move. `usePanZoom` does wheel/pinch zoom and floor panning for both editor and board. Pointer capture is wrapped in try (it throws for an already-ended pointer).
  - **Seating:** a seat holds `"<guest id>:<n>"` (the nth person of a household) or null. Always read a plan through `normalise(raw, tablesOf(layout))`, which fits it to the current tables and reports `displaced` people. `seatAt` moves people, `autoSeat` fills households whole and groups together, `issues` lists what needs attention.
  - **Saved venue plans:** `event-bridge.layouts.v1` (`src/state/layouts.ts`), this device only.
  - **PDF:** `src/lib/exportSeating.ts` (lazy) uses a pdfmake `svg` node from `layoutSvg`, which uses fixed paper colours, not theme tokens.
- **Office apps:** CRM, Tasks, Vendors and Questionnaires keep their lists in localStorage through `useStoredList` in `src/state/local.ts` (a functional `update`, JSON export/import with `downloadList`/`readListFile`). Like proposals, they stay on one device.
  - **Vendor rolodex** (`#/vendors`; `src/lib/vendors.ts`, `src/state/vendors.ts`, `vendors.test.ts`):
    - **Storage:** `event-bridge.vendors.v1`, plus the optional read-only team list `public/config/vendors.json` (`validateVendors`, `ConfigContext.teamVendors`).
    - **Spend:** `spendByVendor` matches expenses by name.
    - **Expenses:** the expense dialog's suggestions include `vendorNames()`.
    - **Classes:** `.vn-*` (`.vd-*` is the venue dialog's).
  - **CRM** (`#/crm`; `src/lib/crm.ts`, `src/state/crm.ts`, `crm.test.ts`):
    - **Leads:** in `event-bridge.leads.v1`. A lead has a stage (`STAGES`), a follow-up date and an activity log, changed only through `moveStage`/`logActivity`.
    - **Proposals:** `leadToProposal` goes through `newProposal`. `syncWithProposals` moves leads along with their proposal's status.
    - **Clients:** `clientsFrom` merges proposals by mobile number.
    - **Dashboard:** follow-ups due show on the CRM tile and in Follow up.
  - **Tasks** (`#/tasks`; `src/lib/tasks.ts`, `src/state/tasks.ts`, `tasks.test.ts`):
    - **What it merges:** team tasks (`event-bridge.tasks.v1`) and every non-lost proposal's checklist, through `allTasks`.
    - **Checklist edits:** go through `store.update` with the checklist's `setState`, so the workspace stays in step.
    - **Dashboard:** "Tasks overdue" uses `overdueRows`.
  - **Questionnaires** (`#/questionnaires`; `src/lib/questionnaires.ts`, `src/state/questionnaires.ts`, `questionnaires.test.ts`):
    - **Templates:** in `event-bridge.questionnaires.v1`, plus `public/config/questionnaires.json`, which ships `DEFAULT_QUESTIONNAIRE` (a test keeps them equal).
    - **Sending:** `sendQuestionnaire` copies a template onto `Proposal.questionnaires`.
    - **Answers:** go through `cleanAnswers` (plain text, caps, choices must match), and the server mirrors that in `server/portal.ts`, so keep them in step. `QuestionnaireForm` is shared by the workspace's Questionnaires tab and the client portal.
    - **Copies and clients:** `duplicate` drops the answers, and `pageSnapshot` never includes them.
- **Dashboard** (`src/pages/Dashboard.tsx`, pure figures in `src/lib/dashboard.ts` and `src/lib/followups.ts`, `dashboard.test.ts`):
  - **Data:** this device's proposals plus `/api/shares` when available; `shareFor` picks a proposal's share.
  - **Pipeline:** one segmented bar of draft → sent → accepted in stepped strengths of `--gold` (an ordered scale), plus a legend with counts and values, so no categorical palette has to be validated across six themes. Lost proposals are left out of the bar.
  - **Layout:** a solid page (no site photo), a greeting `PageHeader`, then:
    - a compact apps bar (`APPS`, icon and label)
    - four figures: upcoming events, awaiting decision, received this month, needs attention
    - upcoming events as a list or a month calendar (`calendarMonth`/`gridRange`/`shiftMonth` in `src/lib/calendar.ts`, Monday-first; the calendar reuses `upcoming()` from the grid's first day), beside one "Needs attention" list: overdue payments, overdue tasks, proposal follow-ups (overdue payments not repeated), enquiry follow-ups, payments due soon and unanswered questionnaires
    - pipeline, what's selling and this month's spending
  - **Links:** client links go to the event workspace.
  - **Studio home:** shows the first three follow-ups as To do.
- **Event expenses** (`src/pages/Expenses.tsx`, lazy-loaded; rules in `src/lib/expenses.ts`, handover in `src/lib/handover.ts` and `src/lib/handoverPack.ts`; `expenses.test.ts`):
  - **Routes:** `#/expenses` (events and received handovers), `#/expenses/<proposalId>` (the ledger) and `#/expenses/review/<handoverId>`. The `expenses` branch in `App` comes before the open-proposal check, so the Builder's Expenses link works.
  - **Storage:** IndexedDB (`src/state/expenses.ts`, database `event-bridge`, version 2, stores `expenses`, `proofs`, `sent`, `received`, `advances`), because screenshots are too big for localStorage. Received images are stored under `receivedFileId(handoverId, fileId)`. Custom categories live in `event-bridge.expense-categories.v1`; team ones in `brand.expenseCategories` (validated).
  - **Proof:** `prepareProof` (`src/lib/proofImage.ts`) scales an image to at most 1600 px WebP and fingerprints it. `fingerprint` uses `crypto.subtle`, or `sha256Bytes` on plain http.
  - **Rules (all pure and tested):**
    - `checkExpense`: a UPI ref already in the event **blocks**; a repeated image hash, the same amount + date + vendor, no proof, an amount ≥ `LARGE_AMOUNT`, or a date outside `eventWindow` **warn**
    - `flagsOf`, `summarise` and `filterExpenses`
    - history: `saveExpense` records who and what with `diff`; `removeExpense`/`restoreExpense` never hard-delete
  - **Handover:**
    - **Pack:** a ZIP from `buildPack`: `expenses.json` (`packData`), `expenses.xlsx` (`ledgerWorkbook`), `summary.pdf` (`packSummaryDoc`), and `proof/<date>_<vendor>_<amount>_<id>.<ext>`.
    - **Arrival:** `readPack` checks image hashes and `canReview`. The reviewer must not appear in any expense's `recordedBy` or history, other than as a reviewer.
    - **Sign-off and reply:** `signOff` builds the `Reply`, and `applyReply` records the review on the recorder's expenses.
    - **JSZip:** pass it bytes, not Blobs, which it accepts only in browsers.
  - **Company expenses** (`src/lib/books.ts`, `books.test.ts`): a ledger, its advances and its handover belong to a `Book`, either `bookFromProposal(p, …)` or `companyBook(brand)` with the fixed id `COMPANY_BOOK_ID` ("company"), which takes the place of a proposal id in `eventId`.
    - **Route:** `#/expenses/company`. The Expenses home (`#/expenses`) lists Company first among the ledgers, so there's no Events | Company switch or redirect any more (the old `event-bridge.expenses-view.v1` key is no longer read).
    - **Months:** the company ledger is month-scoped (`ExpenseFilter.month`, `monthsOf`, `summarise().byMonth`). Its handover packs only that month, with `packEvent(book, month)` giving the ref `COMPANY-<YYYY-MM>`, and `SentHandover.month` records it. "Clear" uses `clearExpenses(bookId, ids)`, never the whole book.
    - **Categories:** `categoriesFor(kind, brand, custom)`: `COMPANY_CATEGORIES` plus `brand.companyExpenseCategories` (validated) for the company. `ExpenseDialog` starts a new expense in the first category offered.
  - **Staff advances** (`src/lib/advances.ts`, `advances.test.ts`; UI in `src/components/AdvanceDialog.tsx` and the `Advances` card in `Expenses.tsx`):
    - **Data:** an `Advance` holds `movements` (`issued`, `topup`, `returned`, `reimbursed`), each reversed with a reason, never deleted, plus a `history`. An expense paid from one has payer kind `advance` (name = the staff email) and `advanceId`. Show payers with `payerLabel` and group them with `payerKey`; the payer filter uses that key.
    - **Money:** `balanceOf` (the running "left": everything not rejected counts) and `settlement` (`due` = given − accepted − returned + reimbursed, where accepted also needs proof or a reviewer's check; queried or unreviewed expenses are `holds`). Positive `due` is owed back, negative is owed to the staff member.
    - **Rules:** `checkMovement` blocks a UPI ref already used in the event (movements or expenses) and warns on over-returns. `spendWarning` warns when an expense goes over the advance or its `limit`. `closeAdvance` needs `due` 0 and no holds, or a write-off reason. `canManage(brand.advanceManagers, account)` (validated; unset means anyone).
    - **Handover:** `PackData` is v2 with `advances` (v1 packs read with none). `canReviewPack` also refuses the staff member, the issuer and anyone who moved money. `signOff` adds `settlements` to the reply (computed with `withReviews`), and `applyReply` notes them in each advance's history. `ledgerWorkbook` adds an "Advances" sheet, and `packSummaryDoc`/`handoverReceiptDoc` add an advances block. `clearEvent` keeps open advances.
  - **Expenses home and quick add:** `#/expenses` shows this month's figures, the 8 most recent expenses across every ledger, and a searchable list of ledgers (Company, then events). `QuickExpense` (exported from the lazy `Expenses.tsx`; the Dashboard lazy-imports it for **Record expense** and the spending panel's **Add expense**) opens `ExpenseDialog` with a "For" picker in its `ledger` slot. The options come from `ledgerChoices` and the default from `defaultLedger` (`src/lib/books.ts`): the last ledger used (`event-bridge.expense-last-book.v1`), else the next event, else Company. It loads that ledger before rendering the dialog, so the duplicate and advance checks behave as in the ledger.
  - **Dialog layout:** Time and the payee's UPI ID sit under "More details". On phones the dialog's actions stick to the bottom, and the ledger's category/payer/flag filters fold behind a **Filters** button.
  - **Review state:** in `Review`, decisions use a functional `setH`; reading `h` from the closure lost quick successive clicks.
  - **GPay:** there's no automatic import. Phase 2 (in-browser OCR of screenshots, parsing pasted SMS text) and Phase 3 (PWA share target, bank statement matching) aren't built yet.

**Quotation references** (`src/lib/quoteRef.ts`) are `YYYYDDMM-ABC` (year, *day*, *month*, 3 random capitals) and must be unique per device. `newProposal(brand, takenRefs)` and `duplicate` generate them; `ensureUniqueRefs` runs on load and import to backfill empty refs (dated from `createdAt`) and replace collisions. The ref is read-only in the UI.

**Event dates.** `client.dates` holds every date (sorted), and `client.date` mirrors the first so older drafts and file names keep working.
- **Reading:** always go through `eventDates(p)` / `eventDatesLine(p)` in `src/lib/proposal.ts`, never `client.date`.
- **Writing:** the preview, PDF, Excel and home cards all use `formatDates` (`src/lib/format.ts`), which shares a month ("12th, 14th & 15th February 2027").
- **Picking:** `EventDatesField` edits the list in step one.
- **Tests:** `dates.test.ts`.

**Builder updates must be functional.** `Builder`'s `set` accepts a patch *or* `(cur) => patch` and builds on a `latest` ref; line edits go through `setLines(fn)`. Reading `p.lines` from the render closure and writing back loses rapid successive edits (this bug occurred once).

**Money rules live in one place** — `src/lib/totals.ts`, mirrored by Excel formulas in `src/lib/exportXlsx.ts` and the totals block in `src/lib/exportPdf.ts`:
- Sub Total = included lines only (`!optional`), where a line's amount is `qty × rate` plus upgrades with `mode: "include"`; `rate: null` lines contribute 0 and are listed as "as per actuals".
- Coordination = Sub Total × `coordinationPct`; `grandTotal: null` means no round-off, otherwise Rounded Off = grandTotal − (Sub + Coord).
- Optional lines and upgrades with `mode: "offer"` go to "Additional Options" and are **never** in the Grand Total. GST is a reference figure only.
- Indian digit grouping (`groupINR`/`formatINR` in `src/lib/format.ts`; `INR_FMT` number format in Excel).

If you change totals logic, update the preview (`ProposalPreview`, `TotalsPanel`), the workbook formulas, `buildPdfDoc`, and `exportXlsx.test.ts` / `exportPdf.test.ts` together. The three outputs (preview, Excel, PDF) show the same sections, notes and "not included" wording, so keep them in step when changing any one. The export writes `{formula, result}` so files show correct values even before Excel recalculates.

**Exports are lazy-loaded.** ExcelJS (`src/lib/exportXlsx.ts`) and pdfmake 0.2 with its Roboto font (`src/lib/exportPdf.ts`) are pulled in by `await import(...)` in the export split button, keeping ~2 MB out of the main bundle. Don't import either module from UI code. Shared helpers live in `src/lib/proposal.ts` (`proposalTitle`, `groupLines`, `exportFileName`, `venueLine`) and `src/lib/files.ts` (`logoToPng`, `saveBlob`). `buildWorkbook` and `buildPdfDoc` are pure and take the logo PNG as an optional argument, so tests run in Node; `exportPdf.test.ts` renders a real PDF with pdfmake's Node printer (set `PDF_SAMPLE=<path>` to save it for inspection). The installed pdfmake is 0.2 while `@types/pdfmake` describes 0.3, hence the cast in `buildPdfBlob` (which `downloadPdf` and "Share with client" both use). For "today", use `todayISO()` (local date), never `toISOString()`, which gives the UTC date.

**Auth is a browser-side gate, not security.** `src/auth/auth.ts` holds the allow-list as `sha256("parinay-proposals:<lowercased email>:<password>")` — never plaintext passwords. `src/auth/sha256.ts` is a pure-JS hash, used deliberately because `crypto.subtle` is unavailable on plain-http hosts. Both fields go through `normaliseEmail` / `normalisePassword` (NFKC, zero-width characters stripped, trimmed; the email is also lowercased) before hashing. This fixed real login failures from phone keyboards, so keep it. The password input also disables autocapitalise and autocorrect. A session (`proposal-builder.session.v1`) lasts 12 h and is dropped if its email leaves the list. The README has the one-liner for generating a new account hash. Keep plaintext credentials out of source, tests and docs.

**Visualize Proposal is the one place where security is real, so it is enforced on the server.**
- **Layout:** each `api/**.ts` is a one-liner, `export default { fetch: route(handler) }` (a bare default function is treated as the legacy Node signature on Vercel). There are 12, and a test asserts the count, so update it when adding one. Viewer endpoints must live under `/api/view/`, the viewer cookie's path (the RSVP endpoints use no cookie; see Guests & RSVP). The handlers live in `server/visualize.ts` and take `(req, deps)`, so `server/visualize.test.ts` runs them against `memoryKv`/`memoryFiles` (`server/store.ts`). Production uses Upstash Redis and a **private** Vercel Blob store.
- **Redis credentials:** found by `redisCredentials()` under `UPSTASH_REDIS_REST_*`, `KV_REST_API_*`, or either with the prefix in `VISUALIZE_REDIS_PREFIX`. The prefix exists because connecting Upstash failed with "REDIS_URL already exists"; `REDIS_URL` itself is never used.
- **Imports:** server-side imports use `.js` extensions (`"./deps.js"`), because the package is `"type": "module"` and Vercel runs the functions as Node ESM. Don't import from `src/` in `server/` or `api/`: its extensionless imports fail at runtime. That's why the normalisation in `server/passwords.ts` and the scrypt format in `scripts/visualize-setup.mjs` duplicate the browser code; keep all three in step.
- **Rules to keep:**
  - every proposal or page response re-checks the viewer session, that it belongs to that share id, and expiry/revocation
  - unknown, wrong, expired and revoked links get the same 401 message
  - state-changing requests pass `assertSameOrigin`
  - stored files are AES-GCM encrypted
  - clients only ever receive watermarked WebP page images, a values-only Excel grid, or (for a web page share) the cleaned proposal snapshot; never an uploaded original or formulas
- **Screen capture (client viewer):** browsers expose no screenshot event, so `src/lib/capture.ts` handles only what a page can see.
  - **Shortcuts:** `isCaptureShortcut` catches Print Screen (Chrome/Edge on Windows deliver it only on keyup, so `useViewOnly` listens to keyup too) and ⌘⇧3/4/5 when macOS lets them through. A hit shows the "Screen capture blocked" popup, blanks `.cv-stage` for ~2 s (`.is-shielded`) and overwrites the clipboard.
  - **Focus:** window `blur` and `visibilitychange` (the Snipping Tool, app switching on phones) hide the proposal until focus returns, without signing the client out.
  - **Platforms:** `capturePlatform` only picks the wording. Android/iOS browsers get no screenshot signal at all; real blocking needs native apps (FLAG_SECURE, `UIScreen.isCaptured`, `SetWindowDisplayAffinity`), which this site is not.
  - Tests are in `capture.test.ts`.
- **Client portal** (share kind `"portal"`; `server/portal.ts`, `src/lib/portal.ts`, `src/components/ClientPortal.tsx`, `src/pages/Portal.tsx`):
  - **Contents:** `portalSnapshot(p, …)` sends the cleaned proposal page, the family's checklist tasks only (title, due, state), the payment schedule and their questionnaires. It sends no costs, budget or team tasks (tested). The browser sends it as the `portal` field of `POST /api/shares`.
  - **Checking:** `validatePortal` re-checks it field by field (reusing `validatePage`), and it's stored with `packPage` like a web page share.
  - **Refreshing:** `PUT /api/shares?id=` (staff, same origin, upload limit) replaces a portal's contents in place, keeping its link, password, decision and answers.
  - **Answers:** the family answers with `POST /api/view/answers?id=` (`viewAnswers`), which runs the same checks as `viewRespond` (a live session for that share, `assertSameOrigin`, an IP limit). Answers are cleaned against the questions in the stored bundle, capped at `ANSWERS_MAX_BYTES`, and stored encrypted as `answersEnc`. `forStaff` and `viewDoc` return them decrypted.
  - **Back in Studio:** `mergePortalAnswers` writes newer answers onto the proposal; the Portal page and the event workspace do this when they load shares. `Proposal.portalShareId` records the portal.
- **Share with client and the client's answer:**
  - **Sharing:** the Review step's `Deliver` card offers a **web page** or a **PDF**. `ShareDialog` uploads either through the same `POST /api/shares` as the Visualize page, adding `proposalId`; the server stores it only if it looks like an id. On success the proposal gets `shareId` and, if it was a draft, `statusPatch(cur, "sent")`.
    - **PDF:** built in the browser with `buildPdfBlob`.
    - **Web page:** a JSON snapshot sent as the `page` field instead of a file. `pageSnapshot` (`src/lib/proposalPage.ts`) keeps only what the preview shows: no ids or status, and no upgrades with mode `off`. `server/page.ts` `validatePage` re-checks and rebuilds it field by field (size cap, `PAGE_THEMES`, image URLs limited to https or `images/…`), and it's stored as share kind `"page"` (bundle kind `page`, no page images).
    - **Rendering:** the client's browser draws it with `ProposalPage`, which wraps the same `ProposalPreview` in a `ConfigContext` built from the snapshot's labels. Logo and contact come from the site's own `brand.json`. `PAGE_THEMES` must match `THEMES`.
    - **Dialogs:** `PagePreview` (full-screen preview with a `ThemePicker`) and `ShareDialog` render through a portal to `<body>`, because `.side-card h3` caps styling would otherwise reach the proposal's headings. The chosen theme is saved as `Proposal.pageTheme`.
  - **Answers:** clients answer with `POST /api/view/respond?id=` (`viewRespond`), which runs the same `liveShare` checks as `doc`/`page` (session bound to that share, not expired, not revoked) plus `assertSameOrigin` and the IP limit. The `decision` (`approved` | `changes`, plain-text comment capped at `COMMENT_MAX`) replaces any earlier one. `forStaff` and `viewDoc` return it.
  - **Studio:** `Home` fetches `/api/shares` only when some proposal has a `shareId`, ignores failures, and matches answers with `clientAnswers` (`src/lib/shares.ts`).
  - **Shared front-end pieces:** the `Share` type, `generatePassword`, `shareLink` and the like live in `src/lib/shares.ts`. `ShareResult`/`useCopy` live in `src/components/ShareResult.tsx`.
  - **Sign-in again:** a 401 while sharing offers "Sign in again" (`onReauth` from `App`); the open proposal reopens after sign-in.
- **Free-tier sizing:** each share is two blobs (`original.bin` and the `view.bin` bundle; see `server/bundle.ts`).
- **Front end:** `src/lib/api.ts` treats a non-JSON answer as "API unavailable" (status 0).
  - **Sign-in (`Login.tsx`):** it tries `/api/staff/login` first. What happens next is decided by the pure `decideLogin` (`src/auth/loginRules.ts`, tested in both modes). Normally it falls back to the browser allow-list only on status 0 or 503, and a 401 for an account the browser list accepts explains that it's missing from `STAFF_ACCOUNTS`.
  - **Staff accounts:** they must be in both lists. `readSession` drops sessions for emails that aren't in `src/auth/auth.ts`, so a server-only account is signed out on reload.
  - **Server-only switch:** `SERVER_SIGNIN` (`VITE_SERVER_SIGNIN=1`, a build-time flag, off by default) removes the fallback and the `ACCOUNTS` check in `readSession`. `App` then confirms the session with `GET /api/staff/me` and signs out on a 401, but not when the server is unreachable. Don't turn it on before the live site has every account in `STAFF_ACCOUNTS`.
- **Gotchas:**
  - Password hashes use `:` separators (`scrypt:N:r:p:salt:hash`), because Vite's dotenv-expand mangled `$`.
  - `logoToPng` uses `img.onload` with a timeout, not `img.decode()`, which can stay pending forever in a non-painting tab and hung the exports.
  - pdf.js 6 runs in-process via `globalThis.pdfjsWorker` and needs its `standard_fonts`/`cmaps`/`wasm`/`iccs` folders (`includeFiles` in `vercel.json`). Serverless hosts have no fonts, so the watermark registers Roboto from pdfmake's vfs.
  - The CSP's `img-src` lists `images.unsplash.com` and `upload.wikimedia.org` (catalogue and venue photos); add any new image host there.

## Styling

- **Files:** `src/styles/tokens.css` holds the palette and fonts, taken from the gold crest (`--gold` #B79A68 for rules and fills, `--gold-text` for small text on ivory, `--espresso` for dark surfaces; Cinzel for caps labels, Cormorant for headings, Pinyon Script for accents). `src/styles/app.css` holds everything else, ordered: base → components → brand theme block → motion → breakpoints (≥1600, ≤1180, ≤1023 tablet, ≤760 phone, short landscape) → login → self-contained feature blocks, each with its own media queries (shared bits, export split button, theme/font controls, font-mode overrides, venues, site background photo, hero fit and centring, landing page, login back link, venues without a photo, Event Bridge main navigation, Event Bridge landing hero and apps, featured venue, the Visualize Proposal blocks, four-item navigation, the screen-capture popup, multiple event dates, the refinement block, team photos, the Excel import dialog `.xi-*`, then event expenses, staff advances `.adv-*`, the app shell `.shell-*`/`.page-head`/`.crumbs`, the wedding checklist `.ck-*`, the event workspace `.ev-*`, the dashboard's today strip, calendar and pipeline bar, the vendor rolodex `.vn-*`, the CRM `.crm-*`, tasks, questionnaires `.qf-*`/`.qs-*`/`.qe-*`, the client portal `.cp-*`/`.pt-*` and the landing page `.lp-*`). The old `.landing-*` rules are no longer used by `Landing.tsx`. The refinement block keeps the chrome quiet: the main menu is plain text links with a gold underline for the current page, the gold button has no glow, cards use hairlines instead of shadows, and the site photo is only a faint texture behind content pages. Keep new UI in that spirit: no badge pills or caps eyebrow labels on marketing sections, no drop shadows on resting cards. Add new feature blocks at the end. Feature blocks at the end win over the breakpoints, so they carry their own phone rules. The old `.landing-nav` / `.home-account` bars were replaced by `.site-nav`.
- **Tailwind v4** (`@tailwindcss/vite` in `vite.config.ts`, `src/styles/tailwind.css`, imported after `app.css`):
  - **No preflight.** `app.css` owns the base styles, so utilities on a `<button>` or `<ul>` need their own reset (`border-0 bg-transparent`, `m-0 list-none p-0`); a one-sided border needs `border-0 border-b-2`.
  - **Layered.** Utilities sit in a cascade layer, so any unlayered `app.css` rule on the same element wins. Use utilities for new markup (Settings, `SetupGuide`, `EmptyState`, the landing pricing section), not to override existing classes.
  - **Tokens only.** Tailwind's palette is removed (`--color-*: initial`) and replaced by the theme tokens (`bg-card`, `text-ink-2`, `border-line`, `text-gold-text`, `bg-danger-soft`…), plus `font-serif`/`font-caps`/`font-script` and `rounded-sm/md/lg` from `--r-*`. So utilities follow all six themes, and the no-hard-coded-colours rule still holds. Add a token to `tokens.css` and map it in `tailwind.css` rather than using arbitrary colour values.
  - **Empty lists** use `EmptyState` (`src/components/EmptyState.tsx`: icon, title, one line, actions).
- **Site photo:** `src/assets/_JKN4027.webp` is the site-wide background (a fixed `body::before` layer, tinted with `--paper` so every theme stays readable) and the landing hero (imported in `Landing.tsx`). `app.css` references it twice (the site background photo block and the refinement block, which fades it further), and all three references go through Vite, so the file is hashed into `dist/assets/`. Swapping it means replacing the file or updating all three. Page roots such as `.login` must stay transparent, or they hide the photo. The team photos in `src/assets` are imported by the pages that use them:
  - `JK_05098.webp` (a bride at a stone doorway, 2:3 portrait, credit "Pepper Green Wedding" at the bottom centre) is the landing hero.
  - `AMU02965.webp` (jasmine canopy, 2:3 portrait, credit on the right edge) is the sign-in panel in `Login.tsx` and the tall photo in the landing mosaic.
  - `AMU02986.webp` (seaside mandap, 3:2) is the Proposal Studio hero in `Home.tsx`, in the landing mosaic and behind its closing band.
  - `_JKN4027.webp` is also in the landing mosaic.

  The landing page frames each photo at its own proportions so the credits stay in view; on phones the hero portrait is cropped from the top only. The seaside photos are bright, so `.home-hero::after` and `.login-art::after` use deeper veils (end of `app.css`). Two of them carry the photographer's credit in the image; don't crop it out.
- **Cascade:** the breakpoint rules intentionally come after the brand block, so put new base styles above the breakpoints.
- **Themes and fonts:** `src/state/appearance.ts` sets `data-theme` (`dark`, a warm espresso-based dark, is the default, also written on `<html>` in `index.html` to avoid a light flash; the others are `parinay`, `solarized-light`, `solarized-dark`, `nord` and `white`) and `data-font` (`classic`, `sans`, `mono`) on `<html>`. Choices are saved under `proposal-builder.appearance.v2`; the v1 key is read only for its font, which reset everyone to Dark once. It is applied in `main.tsx` before first paint and shared through `AppearanceContext`. Every theme redefines the same tokens in `tokens.css`, so **never hard-code colours** in `app.css` (the only exceptions are the green XLS and red PDF file-type badges; `--doc-paper`/`--doc-ink`/`--doc-line` are deliberately not themed, so shared documents always look like paper); use the tokens, or `color-mix(in srgb, var(--token) N%, transparent)` for alpha. `--espresso`/`--on-espresso` are the dark hero surfaces (dark in every theme). `--primary`/`--on-primary` are for main buttons, the active tab and step (gold on dark themes). Every theme block also matches `[data-page-theme="…"]`, which themes a single element (a shared web page and its preview keep the planner's theme whatever the visitor uses). So when adding a theme, give it both selectors, and add it to `PAGE_THEMES` in `server/page.ts`. Sans and Mono remap `--serif`/`--caps`/`--script`, so the script and caps accents need the font-mode overrides near the end of `app.css`.
- **Gotchas found the hard way:**
  - Grid columns that hold horizontally scrolling content must be `minmax(0, 1fr)`, not `1fr`, or the page overflows on phones.
  - Entrance animations on `.stage > *` use `animation-fill-mode: backwards`. A transform left behind by `both` turns the step into a containing block and traps the fixed mobile selection drawer (`.basket`).
  - The mobile drawer sits above the step bar using `--nav-h`, which `Builder` sets with a `ResizeObserver`.
  - Always use braces in `useEffect` bodies: newer Chrome returns a Promise from `window.scrollTo`, and a one-line arrow hands it to React as a cleanup, which crashes the app.
  - The venue `<dialog>` must not call `close()` in effect cleanup: it fires `onClose`, and React's dev double-run of effects would dismiss the dialog straight away.
  - The home and landing heroes are centred. An old ≥1600 rule that padded `.home-hero-text` from the left pushed it off-centre on wide screens and was removed, so don't reintroduce left offsets there. `.hero-actions` is a 2-column grid of equal-width buttons (one column on phones). Links styled as buttons need the `a.btn-*` inline-flex rule.
  - `.login-main` has a top padding override (end of `app.css`) so the absolutely positioned "Back to home" link doesn't cover the form's eyebrow on phones.
