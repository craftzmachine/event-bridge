# Event Bridge — Parinay Weddings

**Event Bridge** is the Parinay Weddings (Events IQ) team's workspace for planning celebrations. It carries the Parinay crest and brings the team's tools together as feature apps:

- **Proposal Studio**: build tailored event proposals and export them as a branded Excel workbook or a client-ready PDF.
- **Venue Directory**: a searchable list of venues in and around Thiruvananthapuram.
- **Visualize Proposal**: share a finished PDF or Excel proposal with a client as a private, password-protected, view-only page.

Proposals and their exports are branded **Parinay Weddings**, because that's what clients receive. Event Bridge is the name of the app the team uses.

## Navigation

The main menu sits on the landing page and the Proposal Studio home: **Home**, **Proposal Studio**, **Venue Directory** and **Visualize Proposal**, plus the theme and font buttons and **Team sign in** / **Sign out**. Below 1280 px wide it folds into a ☰ menu.

| Address | Page |
|---|---|
| `/#/` | landing page: what Event Bridge does, with Proposal Studio featured (public) |
| `/#/login` | sign-in, with a **Back to home** link |
| `/#/studio` | Proposal Studio (needs sign-in) |
| `/#/venues` | Venue Directory (needs sign-in) |
| `/#/visualize` | Visualize Proposal: upload and share (needs sign-in) |
| `/#/view/<code>` | a client's private proposal link (password-protected; `/#/view` lets them paste a link) |

Opening a feature app while signed out goes to sign-in first, then straight back to that app.

## Proposal Studio

1. **Sign in** with an authorised team account, then choose **Proposal Studio** from the menu.
2. **Client & event**: client name, one or more event dates (pick a date, then **+ Add date** for multi-day celebrations; each shows as a removable chip), contact, venue (with suggestions from the venue directory) and location. The quotation reference is filled in automatically.
3. **Occasion**: any event type (Wedding, Engagement, Reception) with any ceremony style (Hindu, Christian, Muslim).
4. **Elements**: browse the catalogue, filtered to the chosen occasion (or show everything), search, and filter by category. For each selected element, set qty, rate (or *as per actuals*), notes for the client, optional upgrades, and whether it is an *additional option*. You can also reorder elements or add a custom one-off line.
5. **Review**: a branded preview of the proposal as the client will see it. Adjust co-ordination %, round off the Grand Total (one-click suggestions) and edit notes and terms.
6. **Export**: **Export to Excel**, or use the ▾ menu next to it to download a **PDF**.

**Venue Directory**: **Venue Directory** in the menu, or **Browse venues** in Proposal Studio, opens a searchable list of 29 hotels, resorts, convention centres and wedding halls in and around Thiruvananthapuram. Each venue shows its name, area, type, star rating, photo and event spaces. You can search, filter by type (hotels, resorts, event venues) and area, open the full details, or **Start proposal** to begin a quotation with the venue already filled in. The Venue field in step 1 also suggests directory venues.

**Quotation references** are generated automatically when a proposal is created or duplicated, in the form `YYYYDDMM-ABC`: year, day, month, then three random capital letters (3 Nov 2026 → `20260311-KQZ`). They are unique among the proposals on that device and cannot be edited. Drafts saved before this feature were given one dated from when they were created.

**Themes and fonts**: the theme button switches between Parinay, Solarized Light, Solarized Dark, Nord, Dark and White. **Dark** is the default for everyone (themes picked before this change were reset to Dark once); after that, a theme someone picks is kept. The **Aa** button cycles the font between Classic, Sans Serif and Mono. Both apply across the whole app and are remembered on each device.

Drafts save automatically in the browser on each device. Use **Save file** / **Back up all** on the home page to move proposals between devices, and **Import** to load them. Clearing the browser's site data deletes that device's drafts, so back up regularly.

### Create a proposal from Excel

**From Excel** on the Proposal Studio home page (or an `.xlsx` chosen with **Import**) turns an estimate spreadsheet into a new proposal.

- **What it reads.**
  - **Items table:** a header row with an item column (Element, Item, Description or Particulars) and at least one of Qty, Rate or Amount; Unit, Notes and Category columns are used when present.
  - **Client details above the table,** as label and value: Client, Contact, Event (e.g. "Hindu Wedding"), Event date(s), Venue, Location, Quotation ref.
  - **Section rows** (a heading with no figures) set the category of the items under them.
  - **Also read:** the co-ordination %, a Grand Total, notes under the table, and a Terms sheet. Items on an "Additional Options" sheet become additional options.
  - **Round trip:** files exported from Proposal Studio convert back unchanged.
- **Nothing is invented.** Anything missing, unclear or contradictory becomes a question, asked only when needed:
  - the client's name, if missing
  - the event type and ceremony style, if the file doesn't name one clearly (or "decide later")
  - the event date, if it can't be read, or could be read two ways (03/04/2027)
  - a catalogue category for sections or items that don't match one
  - items with only an amount: a lump sum (1 × the amount), or enter each quantity
  - a missing quantity or rate (the rate can be "as per actuals")
  - when quantity × rate disagrees with the amount, which one is right
  - rows with figures but no item name: name them or leave them out
  - the co-ordination % and terms, if the file has none
  - whether to keep a quoted Grand Total that differs from the calculated one
  - which sheet to use, if more than one has items
- **Preview.** Before anything is saved, the dialog shows every value with the cell it came from (or "Your answer"), what wasn't in the file, rows left out, and things to check, such as the file's own total differing from the items. **Create proposal** saves it like an imported one and opens it; **Save as JSON** downloads it in the backup format instead.
- **Files it can't use** get a plain explanation: damaged, empty, password-protected, over 10 MB, not an Excel file, or no items table.
- **Old `.xls` files** (Excel 97–2003) can't be read yet: save them as `.xlsx` in Excel first. Reading them would need the SheetJS library.

It works on phones, tablets and laptops. On smaller screens the selection becomes a bottom drawer.

## Run

Requires Node 18+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # totals, config, sign-in, exports, references, venues, Visualize Proposal security
npm run build      # static site in dist/
npm run preview    # serve the production build locally (http://localhost:4173)
```

## Deploy

`npm run build` produces a static site in `dist/` with relative paths. Upload it to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, an internal web server). Config files in `dist/config/` can be edited on the host afterwards. **Visualize Proposal** also needs the small server API in `api/`, which runs as Vercel Functions. On other hosts everything else works, and Visualize says it can't reach the sharing service. `vercel.json` also sets the site's security headers.

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

**Server sign-in:** once Visualize Proposal is set up, the sign-in form checks the email and password **on the server** against `STAFF_ACCOUNTS`, and locks an account for 15 minutes after 5 wrong passwords. The browser list above is used only where the server isn't available. **Keep both lists in step:** an account must be in `STAFF_ACCOUNTS` to sign in, and in `src/auth/auth.ts` to stay signed in after a reload. If a team account is missing from the server list, sign-in says so.

**Limits:** the browser check keeps casual visitors out but is not real security. Short passwords can be guessed offline from the published code. For anything sensitive, put the site behind hosting-level authentication (for example Cloudflare Access or Netlify password protection).

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
- **No photo.** Other venues show a monogram in the same size and style as a photo.
- **Alt text.** `photoAlt` describes what the photo shows, for screen readers.
- **Search, 4 November 2026.** Every venue was searched for on Openverse (Creative Commons photos from Flickr, Wikimedia and others) and Wikimedia Commons, under its name and common variants. Only photos that show the actual venue and allow commercial use were accepted: CC BY, CC BY-SA, CC0 or public domain, not "NonCommercial" or "NoDerivatives". Only Taj Green Cove and The Leela had one. Rejected along the way:
  - two Poovar sunset photos with no evidence they were taken at the resort
  - Poovar Island Resort photos licensed for non-commercial use only
  - a Hotel Hycinth photo of a plate of food
  - a Veli "Tourist Facilitation Centre" that isn't the 2024 convention centre
  - photos of same-named places elsewhere: the Lake Palace in Udaipur, Sunrise and Crystal venues abroad
- **Adding the team's own photos** (the quickest way to fill the gaps):
  1. Save a landscape photo the team took, or one a venue has given written permission for, as `public/images/venues/<venue id>.jpg`, about 1280 px wide.
  2. Set `"photo": "images/venues/<venue id>.jpg"`, `"photoIsRepresentative": false`, a `photoAlt`, and a `photoCredit` (for example `{ "author": "Parinay Weddings", "license": "Own photo", "source": "<the venue's website>" }`).

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

## Visualize Proposal

Share a finished proposal with a client as a private page instead of an attachment.

**For the team:** choose **Visualize Proposal** in the menu.
1. Drop in a PDF or `.xlsx` file (up to 4 MB; PDFs up to 30 pages).
2. Enter the client's name and a title.
3. Choose a password (or tap **Generate**) and how long the link lasts: 7, 30 or 90 days.
4. **Create private link** gives you the link and the password. Send them **separately**, for example the link by email and the password by WhatsApp.

The list shows each share's status, views and when it was last opened. **Copy link** copies it again; **Revoke** ends access immediately and deletes the file.

**For the client:** they open the link (or **Open a shared proposal** on the landing page), enter the password, and read it in the browser.
- **PDF:** watermarked page images.
- **Excel:** a read-only table with sheet tabs.
- **Session:** lasts up to 2 hours, or 30 minutes idle. **Sign out** ends it.

### How it's protected

| | |
|---|---|
| **Links** | A 256-bit random code after `#/view/`. It can't be guessed, and browsers don't send it to servers or in referrers. Only a keyed hash of it is stored. |
| **Passwords** | Stored as scrypt hashes. A link locks for 15 minutes after 5 wrong passwords, each network gets 30 attempts an hour, and failures are slowed down. Unknown, wrong, expired and revoked links all get the same message, so nothing can be probed. |
| **Server checks** | Every request for a proposal or page image checks, on the server, a valid HttpOnly viewer session for *that* share, and that the share isn't expired or revoked. Staff actions need a server-side staff session. Requests that change anything must come from the site itself. |
| **Files** | Kept in a **private** Vercel Blob store and **encrypted with AES-256-GCM** with a key only the server has. The original file is never sent to a client. PDFs become watermarked page images on the server; Excel files become a values-only grid with no formulas. |
| **Browser** | No-store caching, a strict Content-Security-Policy, and the site can't be framed by others. |
| **Viewer** | No download links or `<img>` elements (pages are drawn on a canvas). Right-click, dragging, selection and copy are blocked. Ctrl/⌘+P and Ctrl/⌘+S are intercepted, and printing produces a blank page. |
| **Screen capture** | When a screenshot shortcut reaches the page, a **"Screen capture blocked"** popup appears (like WhatsApp's), the proposal blanks for about 2 seconds, and the clipboard copy is replaced. When the window loses focus or the client switches apps, the proposal is hidden until they come back. See the table below for what each platform allows. |

### What can't be prevented

These are limits of every website, not of this app:
- **Screenshots and screen recording.** Browsers give web pages no screenshot event on any platform; only installed apps get one. What Event Bridge does on each:

  | Platform | What a web page can do | What Event Bridge does |
  |---|---|---|
  | **Windows** | Sees the **Print Screen** key; can't see Win+Shift+S, the Snipping Tool, the Game Bar or other capture apps, but notices the window losing focus | Print Screen → popup, page blanked, clipboard copy replaced. Snipping Tool and similar → proposal hidden while the window isn't active |
  | **macOS** | Sometimes sees ⌘⇧3 / ⌘⇧4 / ⌘⇧5 before the system takes over | When seen → popup and page blanked. Otherwise the proposal is hidden when focus moves away |
  | **Android** | Nothing: the browser isn't told about screenshots, and pages can't use Android's "secure window" flag | Proposal hidden when the client switches apps; no popup is possible |
  | **iOS / iPadOS** | Nothing: Safari doesn't pass on iOS's screenshot or screen-recording notices | Same as Android |

  Real blocking or detection needs installed apps: Android's secure-window flag blocks screenshots outright, iOS can detect screenshots and recording (but not block screenshots), and a Windows desktop app can exclude its window from captures. A phone camera can't be stopped by anything. The watermark with the client's name stays the main deterrent.
- Someone using the browser's **developer tools** can save the page images or Excel values while they're displayed. Nothing beyond what's on screen is ever sent.
- **Print blocking is best effort:** shortcuts are intercepted and print output is blanked, but browser menus and extensions can't be fully controlled.
- **A client can pass on the link and password.** Expiry, revocation, view counts and the watermark limit the damage.

### Setting up Visualize Proposal

It runs on Vercel's free Hobby plan at a sales team's volume: Blob 1 GB, with 10,000 reads and 2,000 writes a month; Upstash Redis 500K commands a month. Vercel's terms limit Hobby to non-commercial use, so a business should use Pro.

1. **Private file store.** In Vercel → your project → **Storage** → **Create** → **Blob**, set access to **Private**, and connect it to the project (Production).
2. **Redis.** In **Storage** → **Create** → **Upstash for Redis**, choose the Free plan and the Mumbai region. When connecting it, set the **environment variable prefix to `VIZ`**. This avoids the "REDIS_URL already exists" error if the project already has a Redis variable. Then add the variable `VISUALIZE_REDIS_PREFIX` = `VIZ`. (Without a prefix, the standard `KV_REST_API_*` / `UPSTASH_REDIS_REST_*` names work too.)
3. **Secrets and staff accounts.** Run the setup script, type each staff email and password at the hidden prompt, and add the three printed values (`SESSION_SECRET`, `FILE_ENCRYPTION_KEY`, `STAFF_ACCOUNTS`) under **Settings → Environment Variables** (Production). Add **all** team accounts. **Keep `FILE_ENCRYPTION_KEY` safe:** changing it makes every shared file unreadable.
   ```bash
   node scripts/visualize-setup.mjs
   ```
4. **Redeploy** (Deployments → ⋯ → Redeploy), then sign in, upload a test file, and open the link in a private window.

Until step 3 is done, Visualize says it isn't set up, and sign-in keeps using the browser list.

**Trying it locally:** run `node scripts/visualize-setup.mjs --dev`. It writes a gitignored `.env.local` that keeps files and sessions in memory. Then `npm run dev` serves the API too.

## Project layout

| Path | What's there |
|---|---|
| `public/config/` | `catalog.json`, `brand.json` and `venues.json`: offerings, branding and venue directory, editable without a rebuild |
| `public/images/` | logo, favicon, your own photos |
| `src/assets/` | the site background and landing photo, bundled into the build |
| `src/site.ts` | the site's name (Event Bridge) and tagline |
| `src/pages/` | `Landing` (Event Bridge's public entry), `Login`, `Home` (Proposal Studio's saved proposals), `Builder` (the four-step wizard), `Venues` (Venue Directory), `Visualize` (staff sharing), `ClientView` (the client's password gate and viewer) |
| `api/` | Vercel Functions for Visualize Proposal: staff sign-in, shares, client viewing |
| `server/` | the code behind them: sessions, rate limits, encryption, storage, PDF and Excel rendering, and their tests |
| `scripts/` | `visualize-setup.mjs`: generates the secrets and hashes staff passwords |
| `src/components/` | the main menu (`SiteNav`), preview, element cards, line editor, totals panel and other UI pieces |
| `src/lib/` | totals, ₹ formatting, Excel and PDF export, quotation references, venue search |
| `src/state/` | saved proposals, theme and font preference |
| `src/auth/` | allow-listed accounts and the 12-hour session |
| `src/config/` | loading and validating the JSON config |
| `src/styles/` | design tokens and all styles |

Built with Vite, React 18, TypeScript, ExcelJS, pdfmake and Vitest; Visualize Proposal adds Vercel Functions, a private Vercel Blob store, Upstash Redis, pdf.js and @napi-rs/canvas. Guidance for AI coding assistants is in `CLAUDE.md`.
