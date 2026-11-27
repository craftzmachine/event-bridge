// #/rsvp/<token>[/<code>]: where a guest tells the couple whether they're coming, per function. Public and
// mobile-first. A personal link (with the code) shows that household only; the open link asks for a name and phone.
import { useEffect, useState } from "react";
import type { RsvpStatus } from "../types";
import { api, ApiError } from "../lib/api";
import { formatDate } from "../lib/format";
import type { RsvpInvite, WireReply } from "../lib/guestList";

type Invite = Omit<RsvpInvite, "guests"> & { closed: boolean };
type Household = { name: string; invited: number; fns: string[]; reply?: WireReply };
type Answer = Record<string, { status: RsvpStatus; count: number }>;

const CHOICES: { id: RsvpStatus; label: string }[] = [
  { id: "yes", label: "Joyfully accept" },
  { id: "maybe", label: "Not sure yet" },
  { id: "no", label: "Regretfully decline" },
];

export default function Rsvp({ token, code }: { token?: string; code?: string }) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [guest, setGuest] = useState<Household | null>(null);
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState<Answer>({});
  const [meal, setMeal] = useState("");
  const [dietary, setDietary] = useState("");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [trap, setTrap] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("This RSVP link is incomplete. Please open the full link you were sent.");
      return;
    }
    api<{ invite: Invite; guest?: Household }>("rsvp", { json: { token, code } })
      .then((r) => {
        setInvite(r.invite);
        setGuest(r.guest ?? null);
        const last = r.guest?.reply;
        if (last) {
          setAnswer(last.replies);
          setMeal(last.meal ?? "");
          setDietary(last.dietary ?? "");
          setNote(last.note ?? "");
          setSent(true);
        }
      })
      .catch((e: ApiError) => setError(e.status === 0 ? "We couldn't reach the RSVP service. Please check your connection and try again." : e.message));
  }, [token, code]);

  const fns = invite ? invite.fns.filter((f) => !guest || guest.fns.includes(f.id)) : [];
  const party = guest?.invited ?? 10;

  const submit = async () => {
    setFormError("");
    if (!fns.some((f) => answer[f.id])) return setFormError("Please choose an answer for at least one celebration.");
    if (!guest && !name.trim()) return setFormError("Please enter your name.");
    if (!guest && !phone.trim()) return setFormError("Please enter your phone number.");
    setBusy(true);
    try {
      await api("rsvp", { json: { token, code, website: trap, reply: { replies: answer, meal, dietary, note, ...(guest ? {} : { name, phone }) } } });
      setSent(true);
    } catch (e) {
      setFormError((e as ApiError).status === 0 ? "We couldn't send your reply. Please check your connection and try again." : (e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-paper text-ink" data-page-theme={invite?.theme}>
      <main className="mx-auto w-full max-w-xl px-4 py-10 sm:py-16">
        {error ? (
          <Card>
            <h1 className="m-0 font-serif text-3xl">This invitation isn't available</h1>
            <p className="m-0 mt-3 text-ink-2">{error}</p>
          </Card>
        ) : !invite ? (
          <p className="text-center text-ink-2" role="status">Opening your invitation…</p>
        ) : (
          <>
            <header className="mb-8 text-center">
              <p className="m-0 font-script text-3xl text-gold-text">You're invited</p>
              <h1 className="m-0 mt-2 font-serif text-4xl leading-tight sm:text-5xl">{invite.title}</h1>
              {guest && <p className="m-0 mt-3 text-lg text-ink-2">Dear {guest.name}</p>}
              {invite.message && <p className="mx-auto m-0 mt-4 max-w-md whitespace-pre-line text-ink-2">{invite.message}</p>}
              {invite.deadline && !invite.closed && <p className="m-0 mt-4 text-sm text-stone">Kindly reply by {formatDate(invite.deadline)}</p>}
            </header>

            {sent ? (
              <Card>
                <h2 className="m-0 font-serif text-3xl">Thank you{guest ? `, ${guest.name}` : name ? `, ${name}` : ""}</h2>
                <p className="m-0 mt-2 text-ink-2">Your reply has reached the family.</p>
                <ul className="m-0 mt-5 grid list-none gap-2 p-0">
                  {fns.filter((f) => answer[f.id]).map((f) => (
                    <li key={f.id} className="flex justify-between gap-3 border-0 border-b border-solid border-line pb-2">
                      <span>{f.label}</span>
                      <span className="text-ink-2">{answer[f.id].status === "yes" ? `Coming · ${answer[f.id].count}` : answer[f.id].status === "maybe" ? "Not sure yet" : "Not coming"}</span>
                    </li>
                  ))}
                </ul>
                {!invite.closed && <button type="button" className="btn-ghost mt-6" onClick={() => setSent(false)}>Change my reply</button>}
              </Card>
            ) : invite.closed ? (
              <Card>
                <h2 className="m-0 font-serif text-2xl">Replies have closed</h2>
                <p className="m-0 mt-2 text-ink-2">Please contact the family directly.</p>
              </Card>
            ) : (
              <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                {!guest && (
                  <Card>
                    <div className="grid gap-4">
                      <label className="field"><span>Your name</span><input autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
                      <label className="field"><span>Phone / WhatsApp</span><input autoComplete="tel" inputMode="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
                    </div>
                  </Card>
                )}
                {fns.map((f) => {
                  const a = answer[f.id];
                  return (
                    <Card key={f.id}>
                      <h2 className="m-0 font-serif text-2xl">{f.label}</h2>
                      <p className="m-0 mt-1 text-sm text-ink-2">{[f.date && formatDate(f.date), f.venue].filter(Boolean).join(" · ")}</p>
                      <div className="mt-4 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={`Your reply for ${f.label}`}>
                        {CHOICES.map((c) => (
                          <button key={c.id} type="button" role="radio" aria-checked={a?.status === c.id}
                            onClick={() => setAnswer((cur) => ({ ...cur, [f.id]: { status: c.id, count: c.id === "no" ? 0 : cur[f.id]?.count || (guest ? party : 1) } }))}
                            className={`min-h-[var(--tap)] rounded-md border border-solid px-3 text-sm transition-colors ${a?.status === c.id ? "border-gold bg-gold-soft text-ink" : "border-line bg-card text-ink-2 hover:border-gold"}`}>
                            {c.label}
                          </button>
                        ))}
                      </div>
                      {a && a.status !== "no" && party > 1 && (
                        <label className="mt-4 flex items-center justify-between gap-3 text-sm">
                          <span className="text-ink-2">How many of you{guest ? ` (up to ${party})` : ""}?</span>
                          <Stepper value={a.count || 1} max={party} onChange={(n) => setAnswer((cur) => ({ ...cur, [f.id]: { ...cur[f.id], count: n } }))} />
                        </label>
                      )}
                    </Card>
                  );
                })}
                <Card>
                  <div className="grid gap-4">
                    {invite.meals.length > 0 && (
                      <fieldset className="m-0 grid gap-2 border-0 p-0">
                        <legend className="mb-2 text-xs font-medium text-ink-2">Meal preference</legend>
                        <div className="flex flex-wrap gap-2">
                          {invite.meals.map((m) => (
                            <button key={m} type="button" aria-pressed={meal === m} onClick={() => setMeal(meal === m ? "" : m)}
                              className={`rounded-md border border-solid px-4 py-2 text-sm ${meal === m ? "border-gold bg-gold-soft text-ink" : "border-line bg-card text-ink-2"}`}>{m}</button>
                          ))}
                        </div>
                      </fieldset>
                    )}
                    <label className="field"><span>Allergies or dietary needs <small className="text-stone">(optional)</small></span><input maxLength={300} value={dietary} onChange={(e) => setDietary(e.target.value)} /></label>
                    <label className="field"><span>A note for the couple <small className="text-stone">(optional)</small></span><textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
                    {/* left empty by people; bots fill it in */}
                    <label className="absolute -left-[9999px]" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} /></label>
                  </div>
                </Card>
                {formError && <p className="m-0 text-sm text-danger-ink" role="alert">{formError}</p>}
                <button type="submit" className="btn-primary btn-lg w-full justify-center" disabled={busy}>{busy ? "Sending…" : "Send my reply"}</button>
              </form>
            )}
            {invite.host && <p className="m-0 mt-10 text-center text-xs text-stone">Planned with {invite.host}</p>}
          </>
        )}
      </main>
    </div>
  );
}

const Card = ({ children }: { children: React.ReactNode }) => <section className="rounded-lg border border-solid border-line bg-card p-5 sm:p-6">{children}</section>;

function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  const btn = "grid h-10 w-10 place-items-center rounded-full border border-solid border-line bg-card text-lg text-ink disabled:opacity-40";
  return (
    <span className="flex items-center gap-3">
      <button type="button" className={btn} aria-label="One fewer" disabled={value <= 1} onClick={() => onChange(value - 1)}>−</button>
      <span className="w-6 text-center tabular-nums text-ink" aria-live="polite">{value}</span>
      <button type="button" className={btn} aria-label="One more" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </span>
  );
}
