# Proposal Builder — Parinay Weddings

A browser app for the sales team to build tailored event proposals and export them as a branded Excel file.

**Flow:** client & event → occasion (event type × ceremony style) → curate elements (qty, rate, notes, upgrades, additional options) → review → **Export to Excel**.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # totals, config validation, Excel export
npm run build      # static site in dist/ — host anywhere
```

Drafts are saved automatically in the browser on each device. Use **Save file** / **Back up all** on the home page to move proposals between devices, and **Import** to load them.

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

Company name, logo, address, GSTIN, point of contact, default co-ordination %, GST %, colours used in the Excel file, and the standard terms.

### Images

The sample photos are hot-linked from Unsplash. To use your own, drop files into `public/images/` and set e.g. `"image": "images/hindu-wedding.jpg"`. A soft neutral background is shown if an image is missing.

## Excel output

`Proposal_<Client>_<Style>_<Event>_<Date>.xlsx` with three tabs:

- **Proposal**: event details, items by section, live formulas for Amount, Sub Total, co-ordination (% in its own cell), Rounded Off (yellow input), Grand Total, plus GST and total-incl.-GST reference rows. Set up for A4, fit to width.
- **Additional Options**: optional items and offered upgrades with their total (never part of the Grand Total).
- **Terms**: terms & conditions and point of contact.
