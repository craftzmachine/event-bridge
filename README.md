# Event Bridge — Parinay Weddings

**Event Bridge** is the Parinay Weddings (Events IQ) team's workspace for planning celebrations. It carries the Parinay crest and brings the team's tools together as feature apps:

- **Proposal Studio**: build tailored event proposals and export them as a branded Excel workbook or a client-ready PDF.
- **Venue Directory**: a searchable list of venues in and around Thiruvananthapuram.

Proposals and their exports are branded **Parinay Weddings**, because that's what clients receive. Event Bridge is the name of the app the team uses.

## Navigation

The main menu sits on the landing page and the Proposal Studio home: **Home**, **Proposal Studio** and **Venue Directory**, plus the theme and font buttons and **Team sign in** / **Sign out**. On phones and tablets it folds into a ☰ menu.

| Address | Page |
|---|---|
| `/#/` | landing page: what Event Bridge does, with Proposal Studio featured (public) |
| `/#/login` | sign-in, with a **Back to home** link |
| `/#/studio` | Proposal Studio (needs sign-in) |
| `/#/venues` | Venue Directory (needs sign-in) |

Opening a feature app while signed out goes to sign-in first, then straight back to that app.

## Proposal Studio

1. **Sign in** with an authorised team account, then choose **Proposal Studio** from the menu.
2. **Client & event**: client name, event date, contact, venue (with suggestions from the venue directory) and location. The quotation reference is filled in automatically.
3. **Occasion**: any event type (Wedding, Engagement, Reception) with any ceremony style (Hindu, Christian, Muslim).
4. **Elements**: browse the catalogue, filtered to the chosen occasion (or show everything), search, and filter by category. For each selected element, set qty, rate (or *as per actuals*), notes for the client, optional upgrades, and whether it is an *additional option*. You can also reorder elements or add a custom one-off line.
5. **Review**: a branded preview of the proposal as the client will see it. Adjust co-ordination %, round off the Grand Total (one-click suggestions) and edit notes and terms.
6. **Export**: **Export to Excel**, or use the ▾ menu next to it to download a **PDF**.

**Venue Directory**: **Venue Directory** in the menu, or **Browse venues** in Proposal Studio, opens a searchable list of 29 hotels, resorts, convention centres and wedding halls in and around Thiruvananthapuram. Each venue shows its name, area, type, star rating, photo and event spaces. You can search, filter by type (hotels, resorts, event venues) and area, open the full details, or **Start proposal** to begin a quotation with the venue already filled in. The Venue field in step 1 also suggests directory venues.

**Quotation references** are generated automatically when a proposal is created or duplicated, in the form `YYYYDDMM-ABC`: year, day, month, then three random capital letters (3 Nov 2026 → `20260311-KQZ`). They are unique among the proposals on that device and cannot be edited. Drafts saved before this feature were given one dated from when they were created.

**Themes and fonts**: the theme button switches between Parinay (default), Solarized Light, Solarized Dark, Nord, Dark and White. The **Aa** button cycles the font between Classic, Sans Serif and Mono. Both apply across the whole app and are remembered on each device.

Drafts save automatically in the browser on each device. Use **Save file** / **Back up all** on the home page to move proposals between devices, and **Import** to load them. Clearing the browser's site data deletes that device's drafts, so back up regularly.

It works on phones, tablets and laptops. On smaller screens the selection becomes a bottom drawer.

## Run

Requires Node 18+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # totals, config, sign-in, Excel and PDF export, references, venues
npm run build      # static site in dist/
npm run preview    # serve the production build locally (http://localhost:4173)
```

## Deploy

`npm run build` produces a static site in `dist/` with relative paths. Upload it to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, an internal web server). There is no server or database. Config files in `dist/config/` can be edited on the host afterwards.

**Vercel:** import the GitHub repository with the **Vite** framework preset, build command `npm run build` and output directory `dist`. Every push to `main` then redeploys automatically. Check under **Deployments** that the latest commit is live before testing.

## How totals work

- **Sub Total**: included elements (qty × rate) plus upgrades marked *Include*.
- **Event Co-ordination Charges**: Sub Total × co-ordination % (default from `brand.json`).
- **Rounded Off**: the difference when a round Grand Total is quoted.
- **Grand Total**: shown before GST. GST and the total including GST are reference figures.
- *As per actuals* elements, *additional options* and upgrades marked *Offer* are listed separately and **never** added to the Grand Total.

Amounts use Indian digit grouping (₹ 4,41,303.50).

## Sign-in

Event Bridge opens only for the team accounts listed in `src/auth/auth.ts`. There is no sign-up. Passwords are not stored; each entry holds `sha256("parinay-proposals:<email>:<password>")`. Sessions last 12 hours on a device, or until **Sign out**.

Emails are not case-sensitive and passwords are. Stray spaces, invisible characters and full-width look-alikes from phone keyboards are ignored. After 5 wrong attempts, sign-in pauses for 30 seconds.

To add or change an account, compute the value and edit the list, then rebuild:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('parinay-proposals:' + process.argv[1].toLowerCase() + ':' + process.argv[2]).digest('hex'))" name@example.com 'the-password'
```

**Limits:** this check runs in the browser, so it keeps casual visitors out but is not real security. Short passwords can be guessed offline from the published code. For anything sensitive, put the site behind hosting-level authentication (for example Cloudflare Access or Netlify password protection).

## Updating offerings — no code changes

Everything the team sells and the venue directory live in JSON files in `public/config/` (copied as-is to `dist/config/`). Edit them, reload the page — no rebuild needed. If an edit has a mistake, the app shows a list of exactly what to fix instead of loading.

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

Company name, logo (`images/parinay-logo-gold.png`, a transparent gold PNG used in the app and embedded in the Excel and PDF files), address, GSTIN, point of contact, default co-ordination %, GST %, colours used in the Excel file, and the standard terms.

### `venues.json`

The venue directory. `venueTypes` lists the filter types (`hotel`, `resort`, `venue`). Each venue has `id`, `name`, `type`, `area`, `city`, and optionally `aka`, `address`, `stars` (1–5), `phone`, `website`, `gallery` (link to the venue's own photos), `featured`, `description`, `photo`, `photoIsRepresentative`, `photoCredit`, `features`, `verification` and `sources`. It also has `spaces`: a list of `{ name, size?, capacity?, note? }`.

**Taj Green Cove, Kovalam** is `featured`: it's listed first and shown as a large card above the grid. Only one venue can be featured.

All 29 venues were researched online on 4 November 2026, using official sites first, then Kerala Tourism and reputable listings. Each one has a short description, its address and phone where published, its event spaces and capacities, and its sources. Where sources disagree, the venue's `verification` note says so. Six names from the team's list (Gardenia, SS Pooja, Royal Palace, Chinnus, Diya Gardens and Sunrise Resort, Kovalam) couldn't be found online, so they carry only the original name and area, marked as unconfirmed. **Confirm names, addresses, star ratings and capacities with each venue before quoting them.**

**Photos:**
- **Real venues only.** A photo is shown only if it is of the actual venue and freely licensed: Taj Green Cove's infinity pool and The Leela's Charles Correa building, both from Wikimedia Commons.
- **Credits.** Each photo needs a `photoCredit` with the photographer, licence and source page. The card and the details show the credit, and the app refuses to load a photo without one.
- **No copying official photos.** Venues' official and listing-site photos are copyrighted, so they aren't copied in. Link them with `gallery` instead, or add one when the venue gives permission.
- **No photo.** Other venues show a monogram.

### Logo and look

The gold crest at `public/images/parinay-logo-gold.png` appears on the sign-in page, home page, top bar, proposal preview, and the Excel and PDF files. To replace it, swap the file, or point `logo` in `brand.json` at a new transparent PNG. The default palette and fonts (antique gold on ivory and espresso; Cinzel, Cormorant Garamond, Pinyon Script), the five alternative themes and the Sans/Mono font modes are all defined in `src/styles/tokens.css`.

The couple photo at `src/assets/_JKN4027.webp` is the site's background, softly tinted to match the current theme, and the landing page's hero image. To use a different photo, replace that file and keep the same name, or change both references: `url(...)` in the "Site background photo" block at the end of `src/styles/app.css`, and the import at the top of `src/pages/Landing.tsx`. Then rebuild. A landscape WebP or JPEG under about 200 KB keeps pages fast.

### Images

The sample photos are hot-linked from Unsplash, so they need an internet connection. To use your own, drop files into `public/images/` and set e.g. `"image": "images/hindu-wedding.jpg"`. A soft neutral background is shown if an image is missing.

## Exports

On the review step, **Export to Excel** downloads the workbook. The ▾ next to it opens a menu with **Excel workbook** and **PDF document**. Both files are built in the browser, carry the quotation reference, and are named `Proposal_<Client>_<Style>_<Event>_<Date>.xlsx` / `.pdf`.

### Excel workbook

Three tabs:

- **Proposal**: event details, items by section, live formulas for Amount, Sub Total, co-ordination (% in its own cell), Rounded Off (yellow input), Grand Total, plus GST and total-incl.-GST reference rows. Set up for A4, fit to width.
- **Additional Options**: optional items and offered upgrades with their total (never part of the Grand Total).
- **Terms**: terms & conditions and point of contact.

The workbook stores calculated values alongside the formulas, so totals display correctly even before Excel recalculates.

### PDF document

An A4, client-ready PDF:
- the crest, event title and quotation reference
- client details
- items by section, with notes and included upgrades
- totals, with GST for reference
- additional options, marked as not included
- terms, point of contact and page numbers

The text stays sharp and searchable. pdfmake's bundled Roboto font includes the ₹ sign.

## Project layout

| Path | What's there |
|---|---|
| `public/config/` | `catalog.json`, `brand.json` and `venues.json`: offerings, branding and venue directory, editable without a rebuild |
| `public/images/` | logo, favicon, your own photos |
| `src/assets/` | the site background and landing photo, bundled into the build |
| `src/site.ts` | the site's name (Event Bridge) and tagline |
| `src/pages/` | `Landing` (Event Bridge's public entry), `Login`, `Home` (Proposal Studio's saved proposals), `Builder` (the four-step wizard), `Venues` (Venue Directory) |
| `src/components/` | the main menu (`SiteNav`), preview, element cards, line editor, totals panel and other UI pieces |
| `src/lib/` | totals, ₹ formatting, Excel and PDF export, quotation references, venue search |
| `src/state/` | saved proposals, theme and font preference |
| `src/auth/` | allow-listed accounts and the 12-hour session |
| `src/config/` | loading and validating the JSON config |
| `src/styles/` | design tokens and all styles |

Built with Vite, React 18, TypeScript, ExcelJS, pdfmake and Vitest. Guidance for AI coding assistants is in `CLAUDE.md`.
