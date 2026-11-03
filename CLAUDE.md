# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, server-less proposal builder for the Parinay Weddings (Events IQ) sales team. Salespeople sign in, pick an event type × ceremony style, curate catalogue elements (qty, rate, notes, upgrades, additional options), review a branded preview and export an `.xlsx` or `.pdf`. There is also a TVM venue directory, and themes and fonts can be switched. Vite + React 18 + TypeScript, plain CSS, ExcelJS, pdfmake 0.2, Vitest. No router, no state library, no backend; deployed as a static site on Vercel from `main`.

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

To inspect the generated PDF, run `PDF_SAMPLE=<path> npx vitest run src/lib/exportPdf.test.ts` (in PowerShell, `$env:PDF_SAMPLE="<path>"`), then open the file.

There is no linter configured.

**Shell notes (Windows PowerShell 5.1; Git Bash also available):**
- There is no `&&`.
- Commit messages containing double quotes get split into pathspecs when passed with `-m`, so write the message to a file and use `git commit -F <file>`.
- `@(@('a','b'))` flattens to a single array, so loops over "pairs" silently iterate characters instead. Prefer the Edit tool for multi-file text edits.

## Architecture

**Config is data, loaded at runtime — not imported.** `public/config/catalog.json` (event types, ceremony styles, categories, elements), `public/config/brand.json` (company, logo path, contact, GSTIN, coordination %, GST %, Excel colours, default terms) and `public/config/venues.json` (TVM venue directory; search/filter logic in `src/lib/venues.ts`) are fetched with `cache: "no-store"` by `src/config/load.ts`, validated by `src/config/validate.ts`, and exposed through `ConfigContext` (`useConfig()`). Editing them changes offerings without a rebuild. Any change to their shape must be reflected in `src/types.ts` *and* `validate.ts` (which produces the human-readable error list shown instead of the app). Tests read these same JSON files from disk.

**Element relevance** is tag-based: each element has `eventTypes` / `ceremonyStyles` arrays, `["*"]` meaning all; `elementFits()` in `src/config/context.ts` decides what the Elements step shows. `defaultPrice: null` means "as per actuals".

**Venue facts must stay sourced.** Each venue carries `verification` and `sources`; photos are stock unless `photoIsRepresentative` is false. Don't add or change names, star ratings or capacities without a source.

**Navigation: three hash routes, then component state.** `App.tsx` reads the top-level page from the URL hash so it can be linked to on any static host with no rewrites: `#/` → `Landing` (public), `#/login` → `Login`, `#/studio` → the signed-in app. An effect redirects `#/studio` without a session to `#/login`, and `#/login` with a session to `#/studio`. Inside the studio, `App` switches between `Home` / `Venues` → `Builder` with a `view` and an `openId`. `Builder` is a 4-step wizard (client, occasion, elements, review); steps are inner components of `src/pages/Builder.tsx`.

**Persistence** (`src/state/proposals.ts`): all proposals live in `localStorage` under `proposal-builder.proposals.v1`, written on every change via `useProposals()`. JSON export/import is the only way to move them between devices. Changing the `Proposal` shape needs migration-tolerant reads, since old drafts persist.

**Quotation references** (`src/lib/quoteRef.ts`) are `YYYYDDMM-ABC` (year, *day*, *month*, 3 random capitals) and must be unique per device. `newProposal(brand, takenRefs)` and `duplicate` generate them; `ensureUniqueRefs` runs on load and import to backfill empty refs (dated from `createdAt`) and replace collisions. The ref is read-only in the UI.

**Builder updates must be functional.** `Builder`'s `set` accepts a patch *or* `(cur) => patch` and builds on a `latest` ref; line edits go through `setLines(fn)`. Reading `p.lines` from the render closure and writing back loses rapid successive edits (this bug occurred once).

**Money rules live in one place** — `src/lib/totals.ts`, mirrored by Excel formulas in `src/lib/exportXlsx.ts` and the totals block in `src/lib/exportPdf.ts`:
- Sub Total = included lines only (`!optional`), where a line's amount is `qty × rate` plus upgrades with `mode: "include"`; `rate: null` lines contribute 0 and are listed as "as per actuals".
- Coordination = Sub Total × `coordinationPct`; `grandTotal: null` means no round-off, otherwise Rounded Off = grandTotal − (Sub + Coord).
- Optional lines and upgrades with `mode: "offer"` go to "Additional Options" and are **never** in the Grand Total. GST is a reference figure only.
- Indian digit grouping (`groupINR`/`formatINR` in `src/lib/format.ts`; `INR_FMT` number format in Excel).

If you change totals logic, update the preview (`ProposalPreview`, `TotalsPanel`), the workbook formulas, `buildPdfDoc`, and `exportXlsx.test.ts` / `exportPdf.test.ts` together. The three outputs (preview, Excel, PDF) show the same sections, notes and "not included" wording, so keep them in step when changing any one. The export writes `{formula, result}` so files show correct values even before Excel recalculates.

**Exports are lazy-loaded.** ExcelJS (`src/lib/exportXlsx.ts`) and pdfmake 0.2 with its Roboto font (`src/lib/exportPdf.ts`) are pulled in by `await import(...)` in the export split button, keeping ~2 MB out of the main bundle. Don't import either module from UI code. Shared helpers live in `src/lib/proposal.ts` (`proposalTitle`, `groupLines`, `exportFileName`, `venueLine`) and `src/lib/files.ts` (`logoToPng`, `saveBlob`). `buildWorkbook` and `buildPdfDoc` are pure and take the logo PNG as an optional argument, so tests run in Node; `exportPdf.test.ts` renders a real PDF with pdfmake's Node printer (set `PDF_SAMPLE=<path>` to save it for inspection). The installed pdfmake is 0.2 while `@types/pdfmake` describes 0.3, hence the cast in `downloadPdf`. For "today", use `todayISO()` (local date), never `toISOString()`, which gives the UTC date.

**Auth is a browser-side gate, not security.** `src/auth/auth.ts` holds the allow-list as `sha256("parinay-proposals:<lowercased email>:<password>")` — never plaintext passwords. `src/auth/sha256.ts` is a pure-JS hash, used deliberately because `crypto.subtle` is unavailable on plain-http hosts. Both fields go through `normaliseEmail` / `normalisePassword` (NFKC, zero-width characters stripped, trimmed; the email is also lowercased) before hashing. This fixed real login failures from phone keyboards, so keep it. The password input also disables autocapitalise and autocorrect. A session (`proposal-builder.session.v1`) lasts 12 h and is dropped if its email leaves the list. The README has the one-liner for generating a new account hash. Keep plaintext credentials out of source, tests and docs.

## Styling

- **Files:** `src/styles/tokens.css` holds the palette and fonts, taken from the gold crest (`--gold` #B79A68 for rules and fills, `--gold-text` for small text on ivory, `--espresso` for dark surfaces; Cinzel for caps labels, Cormorant for headings, Pinyon Script for accents). `src/styles/app.css` holds everything else, ordered: base → components → brand theme block → motion → breakpoints (≥1600, ≤1180, ≤1023 tablet, ≤760 phone, short landscape) → login → self-contained feature blocks, each with its own media queries (shared bits, export split button, theme/font controls, font-mode overrides, venues).
- **Cascade:** the breakpoint rules intentionally come after the brand block, so put new base styles above the breakpoints.
- **Themes and fonts:** `src/state/appearance.ts` sets `data-theme` (`parinay` default, `solarized-light`, `solarized-dark`, `nord`, `dark`, `white`) and `data-font` (`classic`, `sans`, `mono`) on `<html>`. It is applied in `main.tsx` before first paint and shared through `AppearanceContext`. Every theme redefines the same tokens in `tokens.css`, so **never hard-code colours** in `app.css` (the only exceptions are the green XLS and red PDF file-type badges); use the tokens, or `color-mix(in srgb, var(--token) N%, transparent)` for alpha. `--espresso`/`--on-espresso` are the dark hero surfaces (dark in every theme). `--primary`/`--on-primary` are for main buttons, the active tab and step (gold on dark themes). Sans and Mono remap `--serif`/`--caps`/`--script`, so the script and caps accents need the font-mode overrides near the end of `app.css`.
- **Gotchas found the hard way:**
  - Grid columns that hold horizontally scrolling content must be `minmax(0, 1fr)`, not `1fr`, or the page overflows on phones.
  - Entrance animations on `.stage > *` use `animation-fill-mode: backwards`. A transform left behind by `both` turns the step into a containing block and traps the fixed mobile selection drawer (`.basket`).
  - The mobile drawer sits above the step bar using `--nav-h`, which `Builder` sets with a `ResizeObserver`.
  - Always use braces in `useEffect` bodies: newer Chrome returns a Promise from `window.scrollTo`, and a one-line arrow hands it to React as a cleanup, which crashes the app.
  - The venue `<dialog>` must not call `close()` in effect cleanup: it fires `onClose`, and React's dev double-run of effects would dismiss the dialog straight away.
