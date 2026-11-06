# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Event Bridge** ("EB"): a static, server-less workspace for the Parinay Weddings (Events IQ) team, branded with the Parinay crest. Its feature apps are **Proposal Studio**, the **Venue Directory** and **Visualize Proposal** (password-protected, view-only sharing of a PDF/Excel file with a client). In Proposal Studio, salespeople pick an event type × ceremony style, curate catalogue elements (qty, rate, notes, upgrades, additional options), review a branded preview and export an `.xlsx` or `.pdf`. Themes and fonts can be switched.

The site name and tagline live in `src/site.ts` (`SITE`). Proposals and exports keep the *company* branding from `brand.json` (Parinay Weddings), so don't put "Event Bridge" into `ProposalPreview`, `exportXlsx` or `exportPdf`. Vite + React 18 + TypeScript, plain CSS, ExcelJS, pdfmake 0.2, Vitest. No router, no state library. The site is static; the only backend is the Visualize Proposal API (`api/` Vercel Functions + `server/`). Deployed on Vercel from `main`.

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

**Element relevance** is tag-based: each element has `eventTypes` / `ceremonyStyles` arrays, `["*"]` meaning all; `elementFits()` in `src/config/context.ts` decides what the Elements step shows. `defaultPrice: null` means "as per actuals".

**Venue facts must stay sourced.** Each venue carries `verification` and `sources`. Don't add or change names, star ratings or capacities without a source. All venues were researched on 2026-11-04 (official sites, then Kerala Tourism and listings); six from the team's list couldn't be found online and say so in `verification`.

Photos must show the actual venue and be licensed for commercial use: CC BY, CC BY-SA, CC0 or public domain; not NC or ND. So far only Taj Green Cove and The Leela have one, from Wikimedia Commons. A 2026-11-04 search of Openverse and Commons for every venue found nothing else that clearly matched, and the README lists what was rejected. Team photos go in `public/images/venues/<id>.jpg`. Each photo gets a `photoAlt` (descriptive alt text; `Venues.tsx` falls back to "Photo of <name>"). Each one carries a `photoCredit` (author, licence, source page), which `validateVenues` enforces. Official venue and listing-site photos are copyrighted, so link them with `gallery` instead of copying them; don't reintroduce stock photos. One venue may be `featured` (validated): Taj Green Cove is first in the file and `Venues.tsx` renders it as the large `FeaturedVenue` card above the grid. On grid cards (which are buttons) the credit is plain text; the dialog links it. Without a `photo`, `Venues.tsx` shows a `Monogram` of the name's initials, and with an empty `spaces` it says "Spaces and capacity to be confirmed". `aka` is rendered as "Also known as …", so put landmarks ("opposite Technopark") in `address`, not `aka`. `venues.test.ts` asserts the total count (29), per-type counts, the featured venue and which venues have photos, so update it when adding venues or photos.

**Navigation: hash routes, then component state.** `App.tsx` reads the top-level page from the URL hash so it can be linked to on any static host with no rewrites:
- `#/` → `Landing` (public)
- `#/login` → `Login`
- `#/dashboard` → `Dashboard` (team overview)
- `#/studio` → Proposal Studio (`Home`)
- `#/venues` → `Venues` (the Venue Directory)
- `#/visualize` → `Visualize` (staff sharing)
- `#/view/<token>` → `ClientView` (public; the client's password gate and viewer)

`App` keeps the raw `hash` in state and derives the route, so moving between `#/view/<a>` and `#/view/<b>` re-renders. The four signed-in routes (`APP_ROUTES`: dashboard, studio, venues, visualize) need a session. Without one, an effect stores the target in the module-level `returnTo` and goes to `#/login`; after sign-in it goes back to `returnTo`. `returnTo` is reset only once that route is reached, because the login → app redirect races `onSignedIn`. An open proposal (`openId`) shows `Builder` over the dashboard, studio or venues route, and closing it returns to that route. The main menu is `src/components/SiteNav.tsx` (Home / Dashboard / Proposal Studio / Venue Directory / Visualize Proposal, plus appearance and account controls). It folds into a ☰ panel below 1440 px, because five labels don't fit beside the brand and controls; the email hides below 1500 px. It is laid over the dark heroes of `Landing` and `Home`; `Venues` and `Builder` keep their own light top bars with a back button. `Builder` is a 4-step wizard (client, occasion, elements, review); steps are inner components of `src/pages/Builder.tsx`.

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
- **Dashboard** (`src/pages/Dashboard.tsx`, pure figures in `src/lib/dashboard.ts` and `src/lib/followups.ts`, `dashboard.test.ts`):
  - **Data:** this device's proposals plus `/api/shares` when available; `shareFor` picks a proposal's share.
  - **Pipeline chart:** a single-hue bar per status with direct value labels, deliberately, so no categorical palette has to be validated across six themes.
  - **Studio home:** shows the first three follow-ups as To do.

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
- **Layout:** each `api/**.ts` is a one-liner, `export default { fetch: route(handler) }` (a bare default function is treated as the legacy Node signature on Vercel). There are 9, and a test asserts the count, so update it when adding one. Viewer endpoints must live under `/api/view/`, the viewer cookie's path. The handlers live in `server/visualize.ts` and take `(req, deps)`, so `server/visualize.test.ts` runs them against `memoryKv`/`memoryFiles` (`server/store.ts`). Production uses Upstash Redis and a **private** Vercel Blob store.
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

- **Files:** `src/styles/tokens.css` holds the palette and fonts, taken from the gold crest (`--gold` #B79A68 for rules and fills, `--gold-text` for small text on ivory, `--espresso` for dark surfaces; Cinzel for caps labels, Cormorant for headings, Pinyon Script for accents). `src/styles/app.css` holds everything else, ordered: base → components → brand theme block → motion → breakpoints (≥1600, ≤1180, ≤1023 tablet, ≤760 phone, short landscape) → login → self-contained feature blocks, each with its own media queries (shared bits, export split button, theme/font controls, font-mode overrides, venues, site background photo, hero fit and centring, landing page, login back link, venues without a photo, Event Bridge main navigation, Event Bridge landing hero and apps, featured venue, the Visualize Proposal blocks, four-item navigation, the screen-capture popup, multiple event dates, the refinement block, team photos, and the Excel import dialog `.xi-*`). The refinement block keeps the chrome quiet: the main menu is plain text links with a gold underline for the current page, the gold button has no glow, cards use hairlines instead of shadows, and the site photo is only a faint texture behind content pages. Keep new UI in that spirit: no badge pills or caps eyebrow labels on marketing sections, no drop shadows on resting cards. Add new feature blocks at the end. Feature blocks at the end win over the breakpoints, so they carry their own phone rules. The old `.landing-nav` / `.home-account` bars were replaced by `.site-nav`.
- **Site photo:** `src/assets/_JKN4027.webp` is the site-wide background (a fixed `body::before` layer, tinted with `--paper` so every theme stays readable) and the landing hero (imported in `Landing.tsx`). `app.css` references it twice (the site background photo block and the refinement block, which fades it further), and all three references go through Vite, so the file is hashed into `dist/assets/`. Swapping it means replacing the file or updating all three. Page roots such as `.login` must stay transparent, or they hide the photo. The team photos in `src/assets` are imported by the pages that use them: `AMU02986.webp` (seaside mandap) is the Proposal Studio hero in `Home.tsx`, `AMU02965.webp` (jasmine canopy, portrait) is the sign-in panel in `Login.tsx`, and `J_J09260.webp` (the post box) sits in the Visualize Proposal band on `Landing.tsx`. The seaside photos are bright, so `.home-hero::after` and `.login-art::after` use deeper veils (end of `app.css`). Two of them carry the photographer's credit in the image; don't crop it out.
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
