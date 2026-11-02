# Proposal Builder — Parinay Weddings

A browser app for the Parinay Weddings (Events IQ) sales team to build tailored event proposals and export them as a branded Excel file.

## What it does

1. **Sign in** with an authorised team account.
2. **Client & event**: client name, event date, contact, venue, location, quotation reference.
3. **Occasion**: any event type (Wedding, Engagement, Reception) with any ceremony style (Hindu, Christian, Muslim).
4. **Elements**: browse the catalogue, filtered to the chosen occasion (or show everything), search, and filter by category. For each selected element, set qty, rate (or *as per actuals*), notes for the client, optional upgrades, and whether it is an *additional option*. You can also reorder elements or add a custom one-off line.
5. **Review**: a branded preview of the proposal as the client will see it. Adjust co-ordination %, round off the Grand Total (one-click suggestions) and edit notes and terms.
6. **Export to Excel**.

Drafts save automatically in the browser on each device. Use **Save file** / **Back up all** on the home page to move proposals between devices, and **Import** to load them. Clearing the browser's site data deletes that device's drafts, so back up regularly.

It works on phones, tablets and laptops. On smaller screens the selection becomes a bottom drawer.

## Run

Requires Node 18+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # totals, config validation, sign-in, Excel export
npm run build      # static site in dist/
```

## Deploy

`npm run build` produces a static site in `dist/` with relative paths. Upload it to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, an internal web server). There is no server or database. Config files in `dist/config/` can be edited on the host afterwards.

## How totals work

- **Sub Total**: included elements (qty × rate) plus upgrades marked *Include*.
- **Event Co-ordination Charges**: Sub Total × co-ordination % (default from `brand.json`).
- **Rounded Off**: the difference when a round Grand Total is quoted.
- **Grand Total**: shown before GST. GST and the total including GST are reference figures.
- *As per actuals* elements, *additional options* and upgrades marked *Offer* are listed separately and **never** added to the Grand Total.

Amounts use Indian digit grouping (₹ 4,41,303.50).

## Sign-in

The studio opens only for the team accounts listed in `src/auth/auth.ts`. There is no sign-up. Passwords are not stored; each entry holds `sha256("parinay-proposals:<email>:<password>")`. Sessions last 12 hours on a device, or until **Sign out**.

To add or change an account, compute the value and edit the list, then rebuild:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('parinay-proposals:' + process.argv[1].toLowerCase() + ':' + process.argv[2]).digest('hex'))" name@example.com 'the-password'
```

**Limits:** this check runs in the browser, so it keeps casual visitors out but is not real security. Short passwords can be guessed offline from the published code. For anything sensitive, put the site behind hosting-level authentication (for example Cloudflare Access or Netlify password protection).

## Updating offerings — no code changes

Everything the team sells lives in two JSON files in `public/config/` (copied as-is to `dist/config/`). Edit them, reload the page — no rebuild needed. If an edit has a mistake, the app shows a list of exactly what to fix instead of loading.

### `catalog.json`

| List | Fields |
|---|---|
| `eventTypes` | `id`, `label`, `blurb`, `image` |
| `ceremonyStyles` | `id`, `label`, `blurb`, `image` |
| `categories` | `id`, `label`, `order` (sections on the proposal, in this order) |
| `elements` | see below |

An element:

```json
{
  "id": "nikah-stage",
  "name": "Nikah stage with sheer drapes and lanterns",
  "category": "decor",
  "unit": "lump sum",
  "defaultQty": 1,
  "defaultPrice": 70000,
  "description": "Optional short line shown under the name",
  "eventTypes": ["wedding"],
  "ceremonyStyles": ["muslim"],
  "upgrades": [{ "id": "led-wall", "name": "LED wall backdrop", "price": 45000 }]
}
```

- `eventTypes` / `ceremonyStyles`: which occasions the element is suggested for. Use `["*"]` for all.
- `defaultPrice: null` means **as per actuals** (shown but not added to the total).
- `upgrades` are optional; for each one the salesperson chooses *No*, *Offer* (listed under Additional Options) or *Include* (added to the price).
- `id`s must be unique and should not be changed once proposals use them.

**Add a ceremony style** (e.g. Sikh): add `{ "id": "sikh", "label": "Sikh", "blurb": "…", "image": "…" }` to `ceremonyStyles`, then add `"sikh"` to the `ceremonyStyles` of the elements that apply (elements with `["*"]` already include it).

### `brand.json`

Company name, logo (`images/parinay-logo-gold.png`, a transparent gold PNG used in the app and embedded in the Excel file), address, GSTIN, point of contact, default co-ordination %, GST %, colours used in the Excel file, and the standard terms.

### Logo and look

The gold crest at `public/images/parinay-logo-gold.png` appears on the sign-in page, home page, top bar, proposal preview and the Excel file. To replace it, swap the file, or point `logo` in `brand.json` at a new transparent PNG. The site's palette and fonts (antique gold on ivory and espresso; Cinzel, Cormorant Garamond, Pinyon Script) are defined in `src/styles/tokens.css`.

### Images

The sample photos are hot-linked from Unsplash, so they need an internet connection. To use your own, drop files into `public/images/` and set e.g. `"image": "images/hindu-wedding.jpg"`. A soft neutral background is shown if an image is missing.

## Excel output

`Proposal_<Client>_<Style>_<Event>_<Date>.xlsx` with three tabs:

- **Proposal**: event details, items by section, live formulas for Amount, Sub Total, co-ordination (% in its own cell), Rounded Off (yellow input), Grand Total, plus GST and total-incl.-GST reference rows. Set up for A4, fit to width.
- **Additional Options**: optional items and offered upgrades with their total (never part of the Grand Total).
- **Terms**: terms & conditions and point of contact.

The workbook stores calculated values alongside the formulas, so totals display correctly even before Excel recalculates.

## Project layout

| Path | What's there |
|---|---|
| `public/config/` | `catalog.json` and `brand.json`: offerings and branding, editable without a rebuild |
| `public/images/` | logo, favicon, your own photos |
| `src/pages/` | `Login`, `Home` (saved proposals), `Builder` (the four-step wizard) |
| `src/components/` | preview, element cards, line editor, totals panel and other UI pieces |
| `src/lib/` | totals, ₹ formatting, Excel export |
| `src/auth/` | allow-listed accounts and the 12-hour session |
| `src/config/` | loading and validating the JSON config |
| `src/styles/` | design tokens and all styles |

Built with Vite, React 18, TypeScript, ExcelJS and Vitest. Guidance for AI coding assistants is in `CLAUDE.md`.
