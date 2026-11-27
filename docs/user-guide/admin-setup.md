# Admin setup

For the person who sets Event Bridge up for a company: company details, catalogue, team accounts and sharing.

## Start with the Settings page
Open **Settings** (the gear in the top bar). Everything a planner needs to make Event Bridge their own is there:

| Tab | What you set |
|---|---|
| **Company** | Company name, tagline, legal name, GSTIN, phone, email, address, and the point of contact printed on proposals |
| **Logo & money** | Your logo (PNG, JPG, WebP or SVG under 400 KB), co-ordination % and label, GST %, how many days before the first event the balance falls due |
| **Terms** | The standard terms on every proposal, one per line, in order |
| **Catalogue** | Categories (rename, reorder, add) and elements: name, category, unit, default quantity, rate or *as per actuals*, per-guest quantity, description, and which event types and ceremony styles they suit |
| **Backup** | Export the settings to a file, import them on another device, or reset to the original |

Press **Save changes**. New proposals, PDFs and Excel files use them straight away. Proposals already made keep their own copy of each element.

[Screenshot: Settings → Catalogue]

**Good to know**
- Settings are saved **on this device**. Set up one device, then **Export settings** and **Import settings** on each colleague's device. (Cloud sync is on the [roadmap](../PRODUCT_PLAN.md#4-roadmap).)
- A proposal shared as a **web page** shows the logo published with the site, not one uploaded in Settings. PDFs and Excel files use your uploaded logo.
- The **Set up Event Bridge** card on the Dashboard ticks off company details, catalogue, first enquiry, first proposal and first share as you go.

## For the person who hosts the site
The settings above are laid over files in `public/config/`, which set the defaults for every device. Everything not on the Settings page (Excel colours, payment plan, expense categories, advance managers, packages, checklists, questionnaires, vendors, venues) is still set there. More detail is in the project [README](../../README.md).

## 1. Company defaults
Set in `public/config/brand.json`:
- Company name, tagline and legal name
- **Logo** — a transparent PNG; used in the app, PDFs and Excel files
- Address, phone, email, **GSTIN**
- Point of contact (name, role, phone, email) printed on proposals
- **Co-ordination %** and its label, **GST %**
- Excel colours
- **Standard terms** printed on every proposal
- Optional payment plan, expense categories, and who may manage staff advances

Reload the page after an edit — no rebuild needed. If something is wrong, the app shows a list of exactly what to fix instead of loading.

## 2. Your catalogue
Set in `public/config/catalog.json`:
- **Event types** (Wedding, Engagement, Reception…) and **ceremony styles** (Hindu, Christian, Muslim…), each with a label, short description and image
- **Categories** — the sections of the proposal, in order
- **Elements** — name, category, unit, default qty, default price (or *as per actuals*), description, which event types and styles it suits, optional per-guest quantity, and upgrades

Tip: the quickest way to build a catalogue is to start from your most recent Excel quotation — import it in Proposal Studio (**From Excel**) to see your items, then add them to the catalogue.

## 3. Optional team lists
Files in `public/config/` that everyone sees:
- `packages.json` — team packages
- `checklists.json` — the wedding checklist template
- `questionnaires.json` — the team's questionnaires
- `vendors.json` — a read-only team vendor list
- `venues.json` — the venue directory (every venue fact needs a source)

## 4. Team accounts
Today accounts are added by the person who hosts the site (see "Sign-in" in the [README](../../README.md#sign-in)). For each person you need their work email and a password they'll be given privately.

- Use long passwords. Never send a password in the same message as the site link.
- Once sharing is set up (step 5), accounts are checked on the server and lock for 15 minutes after 5 wrong passwords.
- To remove someone, take them off the list; they're signed out on their next visit.

## 5. Client sharing (Visualize, web-page shares, Client Portal)
Sharing needs the small server part of Event Bridge: a private file store, a Redis database and three secrets. The step-by-step is under "Setting up Visualize Proposal" in the [README](../../README.md#setting-up-visualize-proposal). Keep the file-encryption key safe: changing it makes every shared file unreadable.

## 6. Onboarding your team
1. Send each person their sign-in details (link and password separately).
2. Ask them to take the **Wedding Quest** tour.
3. Agree a **weekly backup** habit until cloud sync arrives.
4. Point them at this guide and the in-app **Help**.
