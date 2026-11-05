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

There is no linter configured.

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
- `#/studio` → Proposal Studio (`Home`)
- `#/venues` → `Venues` (the Venue Directory)
- `#/visualize` → `Visualize` (staff sharing)
- `#/view/<token>` → `ClientView` (public; the client's password gate and viewer)

`App` keeps the raw `hash` in state and derives the route, so moving between `#/view/<a>` and `#/view/<b>` re-renders. The three feature routes need a session. Without one, an effect stores the target in the module-level `returnTo` and goes to `#/login`; after sign-in it goes back to `returnTo`. `returnTo` is reset only once that route is reached, because the login → app redirect races `onSignedIn`. An open proposal (`openId`) shows `Builder` over either feature route, and closing it returns to that route. The main menu is `src/components/SiteNav.tsx` (Home / Proposal Studio / Venue Directory / Visualize Proposal, plus appearance and account controls). It folds into a ☰ panel below 1280 px, because four labels don't fit beside the brand and controls; the email hides below 1500 px. It is laid over the dark heroes of `Landing` and `Home`; `Venues` and `Builder` keep their own light top bars with a back button. `Builder` is a 4-step wizard (client, occasion, elements, review); steps are inner components of `src/pages/Builder.tsx`.

**Persistence** (`src/state/proposals.ts`): all proposals live in `localStorage` under `proposal-builder.proposals.v1`, written on every change via `useProposals()`. JSON export/import is the only way to move them between devices. Changing the `Proposal` shape needs migration-tolerant reads, since old drafts persist.

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

**Exports are lazy-loaded.** ExcelJS (`src/lib/exportXlsx.ts`) and pdfmake 0.2 with its Roboto font (`src/lib/exportPdf.ts`) are pulled in by `await import(...)` in the export split button, keeping ~2 MB out of the main bundle. Don't import either module from UI code. Shared helpers live in `src/lib/proposal.ts` (`proposalTitle`, `groupLines`, `exportFileName`, `venueLine`) and `src/lib/files.ts` (`logoToPng`, `saveBlob`). `buildWorkbook` and `buildPdfDoc` are pure and take the logo PNG as an optional argument, so tests run in Node; `exportPdf.test.ts` renders a real PDF with pdfmake's Node printer (set `PDF_SAMPLE=<path>` to save it for inspection). The installed pdfmake is 0.2 while `@types/pdfmake` describes 0.3, hence the cast in `downloadPdf`. For "today", use `todayISO()` (local date), never `toISOString()`, which gives the UTC date.

**Auth is a browser-side gate, not security.** `src/auth/auth.ts` holds the allow-list as `sha256("parinay-proposals:<lowercased email>:<password>")` — never plaintext passwords. `src/auth/sha256.ts` is a pure-JS hash, used deliberately because `crypto.subtle` is unavailable on plain-http hosts. Both fields go through `normaliseEmail` / `normalisePassword` (NFKC, zero-width characters stripped, trimmed; the email is also lowercased) before hashing. This fixed real login failures from phone keyboards, so keep it. The password input also disables autocapitalise and autocorrect. A session (`proposal-builder.session.v1`) lasts 12 h and is dropped if its email leaves the list. The README has the one-liner for generating a new account hash. Keep plaintext credentials out of source, tests and docs.

**Visualize Proposal is the one place where security is real, so it is enforced on the server.**
- **Layout:** each `api/**.ts` is a one-liner, `export default route(handler)`. The handlers live in `server/visualize.ts` and take `(req, deps)`, so `server/visualize.test.ts` runs them against `memoryKv`/`memoryFiles` (`server/store.ts`). Production uses Upstash Redis and a **private** Vercel Blob store.
- **Redis credentials:** found by `redisCredentials()` under `UPSTASH_REDIS_REST_*`, `KV_REST_API_*`, or either with the prefix in `VISUALIZE_REDIS_PREFIX`. The prefix exists because connecting Upstash failed with "REDIS_URL already exists"; `REDIS_URL` itself is never used.
- **Imports:** server-side imports use `.js` extensions (`"./deps.js"`), because the package is `"type": "module"` and Vercel runs the functions as Node ESM. Don't import from `src/` in `server/` or `api/`: its extensionless imports fail at runtime. That's why the normalisation in `server/passwords.ts` and the scrypt format in `scripts/visualize-setup.mjs` duplicate the browser code; keep all three in step.
- **Rules to keep:**
  - every proposal or page response re-checks the viewer session, that it belongs to that share id, and expiry/revocation
  - unknown, wrong, expired and revoked links get the same 401 message
  - state-changing requests pass `assertSameOrigin`
  - stored files are AES-GCM encrypted
  - clients only ever receive watermarked WebP page images or a values-only Excel grid, never the original or formulas
- **Screen capture (client viewer):** browsers expose no screenshot event, so `src/lib/capture.ts` handles only what a page can see.
  - **Shortcuts:** `isCaptureShortcut` catches Print Screen (Chrome/Edge on Windows deliver it only on keyup, so `useViewOnly` listens to keyup too) and ⌘⇧3/4/5 when macOS lets them through. A hit shows the "Screen capture blocked" popup, blanks `.cv-stage` for ~2 s (`.is-shielded`) and overwrites the clipboard.
  - **Focus:** window `blur` and `visibilitychange` (the Snipping Tool, app switching on phones) hide the proposal until focus returns, without signing the client out.
  - **Platforms:** `capturePlatform` only picks the wording. Android/iOS browsers get no screenshot signal at all; real blocking needs native apps (FLAG_SECURE, `UIScreen.isCaptured`, `SetWindowDisplayAffinity`), which this site is not.
  - Tests are in `capture.test.ts`.
- **Free-tier sizing:** each share is two blobs (`original.bin` and the `view.bin` bundle; see `server/bundle.ts`).
- **Front end:** `src/lib/api.ts` treats a non-JSON answer as "API unavailable" (status 0).
  - **Sign-in (`Login.tsx`):** it tries `/api/staff/login` first and falls back to the browser allow-list only on status 0 or 503. A 401 for an account the browser list accepts explains that it's missing from `STAFF_ACCOUNTS`.
  - **Staff accounts:** they must be in both lists. `readSession` drops sessions for emails that aren't in `src/auth/auth.ts`, so a server-only account is signed out on reload.
- **Gotchas:**
  - Password hashes use `:` separators (`scrypt:N:r:p:salt:hash`), because Vite's dotenv-expand mangled `$`.
  - `logoToPng` uses `img.onload` with a timeout, not `img.decode()`, which can stay pending forever in a non-painting tab and hung the exports.
  - pdf.js 6 runs in-process via `globalThis.pdfjsWorker` and needs its `standard_fonts`/`cmaps`/`wasm`/`iccs` folders (`includeFiles` in `vercel.json`). Serverless hosts have no fonts, so the watermark registers Roboto from pdfmake's vfs.
  - The CSP's `img-src` lists `images.unsplash.com` and `upload.wikimedia.org` (catalogue and venue photos); add any new image host there.

## Styling

- **Files:** `src/styles/tokens.css` holds the palette and fonts, taken from the gold crest (`--gold` #B79A68 for rules and fills, `--gold-text` for small text on ivory, `--espresso` for dark surfaces; Cinzel for caps labels, Cormorant for headings, Pinyon Script for accents). `src/styles/app.css` holds everything else, ordered: base → components → brand theme block → motion → breakpoints (≥1600, ≤1180, ≤1023 tablet, ≤760 phone, short landscape) → login → self-contained feature blocks, each with its own media queries (shared bits, export split button, theme/font controls, font-mode overrides, venues, site background photo, hero fit and centring, landing page, login back link, venues without a photo, Event Bridge main navigation, Event Bridge landing hero and apps, then a final refinement block). The refinement block keeps the chrome quiet: the main menu is plain text links with a gold underline for the current page, the gold button has no glow, cards use hairlines instead of shadows, and the site photo is only a faint texture behind content pages. Keep new UI in that spirit: no badge pills or caps eyebrow labels on marketing sections, no drop shadows on resting cards. Feature blocks at the end win over the breakpoints, so they carry their own phone rules. The old `.landing-nav` / `.home-account` bars were replaced by `.site-nav`.
- **Site photo:** `src/assets/_JKN4027.webp` is the site-wide background (a fixed `body::before` layer, tinted with `--paper` so every theme stays readable) and the landing hero (imported in `Landing.tsx`). Both references go through Vite, so the file is hashed into `dist/assets/`. Swapping it means replacing the file or updating both references. Page roots such as `.login` must stay transparent, or they hide the photo.
- **Cascade:** the breakpoint rules intentionally come after the brand block, so put new base styles above the breakpoints.
- **Themes and fonts:** `src/state/appearance.ts` sets `data-theme` (`dark`, a warm espresso-based dark, is the first-visit default, also written on `<html>` in `index.html` to avoid a light flash; then `parinay`, `solarized-light`, `solarized-dark`, `nord`, `dark`, `white`) and `data-font` (`classic`, `sans`, `mono`) on `<html>`. It is applied in `main.tsx` before first paint and shared through `AppearanceContext`. Every theme redefines the same tokens in `tokens.css`, so **never hard-code colours** in `app.css` (the only exceptions are the green XLS and red PDF file-type badges; `--doc-paper`/`--doc-ink`/`--doc-line` are deliberately not themed, so shared documents always look like paper); use the tokens, or `color-mix(in srgb, var(--token) N%, transparent)` for alpha. `--espresso`/`--on-espresso` are the dark hero surfaces (dark in every theme). `--primary`/`--on-primary` are for main buttons, the active tab and step (gold on dark themes). Sans and Mono remap `--serif`/`--caps`/`--script`, so the script and caps accents need the font-mode overrides near the end of `app.css`.
- **Gotchas found the hard way:**
  - Grid columns that hold horizontally scrolling content must be `minmax(0, 1fr)`, not `1fr`, or the page overflows on phones.
  - Entrance animations on `.stage > *` use `animation-fill-mode: backwards`. A transform left behind by `both` turns the step into a containing block and traps the fixed mobile selection drawer (`.basket`).
  - The mobile drawer sits above the step bar using `--nav-h`, which `Builder` sets with a `ResizeObserver`.
  - Always use braces in `useEffect` bodies: newer Chrome returns a Promise from `window.scrollTo`, and a one-line arrow hands it to React as a cleanup, which crashes the app.
  - The venue `<dialog>` must not call `close()` in effect cleanup: it fires `onClose`, and React's dev double-run of effects would dismiss the dialog straight away.
  - The home and landing heroes are centred. An old ≥1600 rule that padded `.home-hero-text` from the left pushed it off-centre on wide screens and was removed, so don't reintroduce left offsets there. `.hero-actions` is a 2-column grid of equal-width buttons (one column on phones). Links styled as buttons need the `a.btn-*` inline-flex rule.
  - `.login-main` has a top padding override (end of `app.css`) so the absolutely positioned "Back to home" link doesn't cover the form's eyebrow on phones.
