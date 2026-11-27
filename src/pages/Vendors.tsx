import { useEffect, useRef, useState } from "react";
import EmptyState from "../components/EmptyState";
import { createPortal } from "react-dom";
import { uid } from "../state/proposals";
import { useVendors, VENDORS_FORMAT } from "../state/vendors";
import { downloadList, readListFile } from "../state/local";
import { listExpenses } from "../state/expenses";
import { areasOf, categoryLabel, cleanVendor, isVendor, searchVendors, spendByVendor, VENDOR_CATEGORIES, type Vendor } from "../lib/vendors";
import { maskUpi, type Expense } from "../lib/expenses";
import { formatINRShort, todayISO } from "../lib/format";
import { waLink, waNumber } from "../lib/whatsapp";
import PageHeader from "../components/PageHeader";
import { useConfig } from "../config/context";

const blank = (): Vendor => ({ id: `v-${uid()}`, name: "", category: "florist", tags: [], createdAt: "", updatedAt: "" });

/**
 * #/vendors: the vendor rolodex. Florists, caterers, photographers and the rest, with how to reach and pay them,
 * a rating and notes, and what's been paid to each across events. The team's shared list is read-only here.
 */
export default function Vendors() {
  const { brand } = useConfig();
  const store = useVendors();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [area, setArea] = useState("");
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    listExpenses().then(setExpenses).catch(() => {});
  }, []);

  const shown = searchVendors(store.all, { q, category, area });
  const spend = spendByVendor(store.all, expenses);
  const areas = areasOf(store.all);

  async function importFile(file: File | undefined) {
    if (!file) return;
    const items = await readListFile(file, VENDORS_FORMAT, isVendor);
    setMsg(items ? `Imported ${store.importMany(items.map(cleanVendor))} vendor${items.length === 1 ? "" : "s"}.` : "That file isn't a vendor list from Event Bridge.");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="ev-page">
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "#/dashboard" }, { label: "Vendors" }]}
        title="Vendor rolodex"
        subtitle={`${store.all.length} vendor${store.all.length === 1 ? "" : "s"}: how to reach and pay them, what they charge, and what you've paid them.`}
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>Import</button>
            <button type="button" className="btn-ghost" disabled={!store.list.length} onClick={() => downloadList(`Vendors_${todayISO()}.json`, VENDORS_FORMAT, store.list)}>Export</button>
            <button type="button" className="btn-primary" onClick={() => setEditing(blank())}>Add vendor</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
          </>
        }
      />
      <main className="ev-main">
        {msg && <p className="toast" role="status">{msg}</p>}
        <div className="ev-filters">
          <input type="search" placeholder="Search name, area, tag or note" aria-label="Search vendors" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {VENDOR_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select aria-label="Area" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">All areas</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {shown.length === 0 ? (
          store.all.length ? (
            <div className="empty-state"><p>No vendors match.</p></div>
          ) : (
            <EmptyState icon="book" title="No vendors yet" actions={<button type="button" className="btn-primary" onClick={() => setEditing(blank())}>Add the first vendor</button>}>
              Add the florists, caterers and artists you work with, once, and find them again for every wedding.
            </EmptyState>
          )
        ) : (
          <ul className="vn-grid">
            {shown.map((v) => {
              const wa = waNumber(v.phone);
              const s = spend.get(v.id);
              return (
                <li key={v.id} className="vn-card">
                  <div className="vn-card-head">
                    <span className="vn-cat">{categoryLabel(v.category)}{v.team ? " · Team list" : ""}</span>
                    {v.rating && <span className="vn-rating" aria-label={`Rated ${v.rating} of 5`}>{"★".repeat(v.rating)}<span aria-hidden="true">{"★".repeat(5 - v.rating)}</span></span>}
                  </div>
                  <strong>{v.name}</strong>
                  <span>{[v.contact, v.area].filter(Boolean).join(" · ") || " "}</span>
                  {v.priceNote && <span className="vn-price">{v.priceNote}</span>}
                  {v.upi && <span className="vn-muted">UPI {maskUpi(v.upi)}</span>}
                  {v.tags.length > 0 && <span className="vn-muted">{v.tags.map((t) => `#${t}`).join(" ")}</span>}
                  {s && <span className="vn-spend">Paid {formatINRShort(s.total)} over {s.count} payment{s.count === 1 ? "" : "s"}, {s.events} event{s.events === 1 ? "" : "s"}</span>}
                  <div className="vn-actions">
                    {wa && <a className="btn-ghost btn-sm" href={waLink(wa, `Hello ${v.contact || v.name}, this is the ${brand.company} team.`)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
                    {v.phone && <a className="btn-ghost btn-sm" href={`tel:${v.phone.replace(/[^\d+]/g, "")}`}>Call</a>}
                    {!v.team && <button type="button" className="link-btn" onClick={() => setEditing(v)}>Edit</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      {editing && (
        <VendorDialog
          vendor={editing}
          isNew={!store.list.some((x) => x.id === editing.id)}
          onSave={(v) => {
            const now = new Date().toISOString();
            store.save(cleanVendor({ ...v, createdAt: v.createdAt || now, updatedAt: now }));
            setEditing(null);
          }}
          onDelete={(v) => {
            if (confirm(`Delete ${v.name} from the rolodex?`)) {
              store.remove(v.id);
              setEditing(null);
            }
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function VendorDialog({ vendor, isNew, onSave, onDelete, onClose }: { vendor: Vendor; isNew: boolean; onSave: (v: Vendor) => void; onDelete: (v: Vendor) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [v, setV] = useState(vendor);
  const [tags, setTags] = useState(vendor.tags.join(", "));
  // no close() on cleanup: it fires onClose, and React's dev double-run would dismiss the dialog
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const set = (patch: Partial<Vendor>) => setV((cur) => ({ ...cur, ...patch }));
  const field = (key: keyof Vendor, label: string, extra: Record<string, unknown> = {}) => (
    <label className="field">
      <span>{label}</span>
      <input value={(v[key] as string | undefined) ?? ""} onChange={(e) => set({ [key]: e.target.value } as Partial<Vendor>)} {...extra} />
    </label>
  );
  return createPortal(
    <dialog ref={ref} className="venue-dialog xi exp-dialog" onClose={onClose} aria-labelledby="vd-title">
      <header className="xi-head">
        <h2 id="vd-title">{isNew ? "Add a vendor" : `Edit ${vendor.name}`}</h2>
        <button className="vd-close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="xi-body">
        <div className="exp-grid">
          <label className="field field-wide">
            <span>Name</span>
            <input autoFocus value={v.name} maxLength={120} placeholder="e.g. Chalai Flower Market, Ravi's stall" onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="field">
            <span>Category</span>
            <select value={v.category} onChange={(e) => set({ category: e.target.value })}>
              {VENDOR_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          {field("contact", "Contact person", { maxLength: 80 })}
          {field("phone", "Phone / WhatsApp", { inputMode: "tel", maxLength: 20 })}
          {field("email", "Email", { type: "email", maxLength: 120, autoCapitalize: "none" })}
          {field("area", "Area", { maxLength: 60, placeholder: "e.g. Kowdiar" })}
          {field("upi", "UPI ID", { maxLength: 80, autoCapitalize: "none", spellCheck: false, placeholder: "name@bank" })}
          <label className="field field-wide">
            <span>Prices <small>(optional)</small></span>
            <input value={v.priceNote ?? ""} maxLength={200} placeholder="e.g. ₹450 a plate veg, ₹600 non-veg, 300 minimum" onChange={(e) => set({ priceNote: e.target.value })} />
          </label>
          <label className="field">
            <span>Rating</span>
            <select value={v.rating ?? ""} onChange={(e) => set({ rating: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">Not rated</option>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}
            </select>
          </label>
          <label className="field">
            <span>Tags <small>(comma separated)</small></span>
            <input value={tags} maxLength={200} placeholder="e.g. jasmine, last-minute" onChange={(e) => { setTags(e.target.value); set({ tags: e.target.value.split(",") }); }} />
          </label>
          <label className="field field-wide">
            <span>Notes</span>
            <textarea rows={3} value={v.notes ?? ""} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} />
          </label>
        </div>
        <div className="xi-actions">
          {!isNew && <button type="button" className="link-btn link-danger exp-remove" onClick={() => onDelete(vendor)}>Delete</button>}
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!v.name.trim()} onClick={() => onSave(v)}>Save</button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
