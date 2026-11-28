// Drawn illustrations for Help: simple wireframes of each screen in the theme's own colours (CSS variables, so they
// follow all six themes), with gold numbered callouts that match the topic's steps. Loaded only with the Help page
// and the in-app help panel. A topic names its figure in src/lib/help.ts (`figure`); help.test.ts checks they exist.
import type { ReactNode } from "react";
import type { FigureId } from "../../lib/help";

const W = 480;
const H = 280;

/** a panel or card */
const Box = ({ x, y, w, h, fill = "var(--card)", dash, r = 6 }: { x: number; y: number; w: number; h: number; fill?: string; dash?: boolean; r?: number }) => (
  <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} stroke="var(--line)" strokeWidth={1} strokeDasharray={dash ? "4 3" : undefined} />
);
/** a line of text, drawn as a bar */
const Bar = ({ x, y, w, h = 5, fill = "var(--line)" }: { x: number; y: number; w: number; h?: number; fill?: string }) => <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} />;
/** real words, small */
const T = ({ x, y, children, size = 9, fill = "var(--ink-2)", anchor = "start", bold }: { x: number; y: number; children: ReactNode; size?: number; fill?: string; anchor?: "start" | "middle" | "end"; bold?: boolean }) => (
  <text x={x} y={y} fontSize={size} fill={fill} textAnchor={anchor} fontWeight={bold ? 600 : 400} fontFamily="var(--sans), system-ui, sans-serif">{children}</text>
);
/** a button */
const Btn = ({ x, y, w, label, primary }: { x: number; y: number; w: number; label: string; primary?: boolean }) => (
  <g>
    <rect x={x} y={y} width={w} height={16} rx={4} fill={primary ? "var(--primary)" : "var(--paper)"} stroke={primary ? "none" : "var(--line)"} />
    <T x={x + w / 2} y={y + 11} size={8} anchor="middle" fill={primary ? "var(--on-primary)" : "var(--ink)"}>{label}</T>
  </g>
);
/** the numbered callout for step n */
const C = ({ n, x, y }: { n: number; x: number; y: number }) => (
  <g aria-hidden="true">
    <circle cx={x} cy={y} r={9} fill="var(--gold)" stroke="var(--paper)" strokeWidth={2} />
    <T x={x} y={y + 3.5} size={10} anchor="middle" fill="var(--espresso)" bold>{n}</T>
  </g>
);
const Arrow = ({ d }: { d: string }) => <path d={d} fill="none" stroke="var(--gold)" strokeWidth={1.5} strokeDasharray="5 3" markerEnd="url(#hf-arrow)" />;
/** a round table with chairs, top-down */
const Table = ({ x, y, r = 14, seats = 8, label, filled = 0, selected }: { x: number; y: number; r?: number; seats?: number; label?: string; filled?: number; selected?: boolean }) => (
  <g>
    {Array.from({ length: seats }, (_, i) => {
      const a = (i / seats) * Math.PI * 2;
      return <circle key={i} cx={x + Math.cos(a) * (r + 6)} cy={y + Math.sin(a) * (r + 6)} r={3.2} fill={i < filled ? "var(--gold)" : "var(--paper-2)"} stroke="var(--taupe)" strokeWidth={0.8} />;
    })}
    <circle cx={x} cy={y} r={r} fill="var(--card)" stroke={selected ? "var(--gold)" : "var(--taupe)"} strokeWidth={selected ? 1.6 : 1} strokeDasharray={selected ? "3 2" : undefined} />
    {label && <T x={x} y={y + 3} size={7.5} anchor="middle">{label}</T>}
  </g>
);

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="hp-figure-svg">
      <title>{title}</title>
      <defs>
        <marker id="hf-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--gold)" />
        </marker>
      </defs>
      <rect x={0} y={0} width={W} height={H} rx={10} fill="var(--paper-2)" />
      {children}
    </svg>
  );
}

const FIG: Record<FigureId, { title: string; draw: () => ReactNode }> = {
  dashboard: {
    title: "The Dashboard: the apps bar, four figures, upcoming events, Needs attention, and the pipeline and spending",
    draw: () => (
      <>
        <Box x={16} y={14} w={448} h={26} />
        {["Events", "Guests", "Plans", "Studio", "CRM", "Tasks", "Expenses"].map((l, i) => <T key={l} x={30 + i * 62} y={31}>{l}</T>)}
        <C n={1} x={16} y={14} />
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <Box x={16 + i * 113} y={50} w={105} h={44} />
            <T x={26 + i * 113} y={68} size={14} fill="var(--ink)" bold>{["4", "6", "₹3.2L", "5"][i]}</T>
            <Bar x={26 + i * 113} y={78} w={60} />
          </g>
        ))}
        <C n={2} x={16} y={50} />
        <Box x={16} y={104} w={250} h={112} />
        <T x={26} y={120} fill="var(--ink)" bold>Upcoming</T>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect x={26} y={130 + i * 20} width={26} height={14} rx={3} fill="var(--gold-soft)" />
            <Bar x={60} y={135 + i * 20} w={110 - i * 12} />
            <Bar x={200} y={135 + i * 20} w={50} fill="var(--gold-soft)" />
          </g>
        ))}
        <C n={3} x={16} y={104} />
        <Box x={276} y={104} w={188} h={112} />
        <T x={286} y={120} fill="var(--ink)" bold>Needs attention</T>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <circle cx={291} cy={136 + i * 20} r={3} fill={i < 2 ? "var(--danger)" : "var(--gold)"} />
            <Bar x={300} y={133 + i * 20} w={140 - i * 15} />
          </g>
        ))}
        <C n={4} x={276} y={104} />
        <Box x={16} y={226} w={448} h={40} />
        <rect x={28} y={240} width={150} height={10} rx={5} fill="var(--gold)" opacity={0.35} />
        <rect x={178} y={240} width={90} height={10} rx={0} fill="var(--gold)" opacity={0.65} />
        <rect x={268} y={240} width={60} height={10} rx={5} fill="var(--gold)" />
        <Btn x={370} y={237} w={84} label="Record expense" />
        <C n={5} x={16} y={226} />
      </>
    ),
  },
  studio: {
    title: "Proposal Studio: start a proposal, the four steps, the review and sending it",
    draw: () => (
      <>
        <Btn x={16} y={16} w={90} label="+ New proposal" primary />
        <C n={1} x={16} y={16} />
        {["Client & event", "Occasion", "Elements", "Review"].map((l, i) => (
          <g key={l}>
            <circle cx={150 + i * 92} cy={24} r={8} fill={i === 2 ? "var(--primary)" : "var(--card)"} stroke="var(--line)" />
            <T x={150 + i * 92} y={27} size={8} anchor="middle" fill={i === 2 ? "var(--on-primary)" : "var(--ink-2)"}>{i + 1}</T>
            <T x={150 + i * 92} y={46} size={8} anchor="middle">{l}</T>
            <C n={i + 2} x={150 + i * 92 + 12} y={12} />
          </g>
        ))}
        <Box x={16} y={60} w={290} h={204} />
        <T x={28} y={78} fill="var(--ink)" bold>Elements</T>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i}>
            <rect x={28} y={88 + i * 28} width={266} height={22} rx={4} fill="var(--paper)" stroke="var(--line)" />
            <Bar x={36} y={97 + i * 28} w={90 + (i % 3) * 20} />
            <T x={286} y={102 + i * 28} anchor="end" fill="var(--ink)">{["₹45,000", "₹1,20,000", "As per actuals", "₹30,000", "₹18,000", "₹60,000"][i]}</T>
          </g>
        ))}
        <Box x={316} y={60} w={148} h={204} fill="var(--card)" />
        <T x={328} y={78} fill="var(--ink)" bold>Preview</T>
        <rect x={328} y={86} width={124} height={120} rx={3} fill="var(--doc-paper)" stroke="var(--line)" />
        {[0, 1, 2, 3, 4, 5].map((i) => <Bar key={i} x={336} y={96 + i * 16} w={90 - (i % 2) * 30} fill="var(--doc-line)" />)}
        <T x={336} y={196} size={8} fill="var(--doc-ink)" bold>Grand Total ₹2,73,000</T>
        <Btn x={328} y={216} w={60} label="PDF ▾" />
        <Btn x={392} y={216} w={60} label="Share" primary />
        <C n={6} x={452} y={216} />
      </>
    ),
  },
  share: {
    title: "Sharing a private link: upload, name, password and expiry, the link, then views and the client's answer",
    draw: () => (
      <>
        <Box x={16} y={16} w={210} h={248} />
        <rect x={28} y={30} width={186} height={50} rx={6} fill="var(--paper)" stroke="var(--line)" strokeDasharray="4 3" />
        <T x={121} y={58} anchor="middle">Drop a PDF or .xlsx</T>
        <C n={1} x={28} y={30} />
        <T x={28} y={100}>Client</T>
        <rect x={28} y={104} width={186} height={18} rx={4} fill="var(--paper)" stroke="var(--line)" />
        <C n={2} x={214} y={104} />
        <T x={28} y={140}>Password</T>
        <rect x={28} y={144} width={120} height={18} rx={4} fill="var(--paper)" stroke="var(--line)" />
        <T x={34} y={156} fill="var(--ink)">••••••••••</T>
        <Btn x={154} y={145} w={60} label="Generate" />
        {["7", "30", "90"].map((d, i) => <Btn key={d} x={28 + i * 44} y={172} w={40} label={`${d} days`} />)}
        <C n={3} x={214} y={144} />
        <Btn x={28} y={232} w={186} label="Create private link" primary />
        <C n={4} x={214} y={232} />
        <Arrow d="M232 140 C 262 140, 262 80, 292 80" />
        <Box x={296} y={30} w={168} h={80} />
        <T x={308} y={50} fill="var(--ink)" bold>Link</T>
        <Bar x={308} y={58} w={140} fill="var(--gold-soft)" />
        <T x={308} y={84} fill="var(--ink)" bold>Password</T>
        <T x={308} y={98}>sent separately</T>
        <Box x={296} y={124} w={168} h={140} />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <Bar x={308} y={140 + i * 38} w={90} />
            <T x={308} y={160 + i * 38} size={8}>{["3 views · Approved ✓", "1 view · Changes asked", "Not opened yet"][i]}</T>
          </g>
        ))}
        <C n={5} x={296} y={124} />
      </>
    ),
  },
  events: {
    title: "Events: the list of weddings, and one wedding's workspace with its tabs",
    draw: () => (
      <>
        <Box x={16} y={16} w={150} h={248} />
        {["Upcoming", "Past", "All"].map((l, i) => <T key={l} x={28 + i * 46} y={34} fill={i ? "var(--ink-2)" : "var(--ink)"} bold={!i}>{l}</T>)}
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect x={26} y={46 + i * 42} width={130} height={34} rx={5} fill={i === 0 ? "var(--gold-soft)" : "var(--paper)"} stroke="var(--line)" />
            <Bar x={34} y={54 + i * 42} w={80} fill="var(--ink-2)" />
            <T x={34} y={73 + i * 42} size={8}>{["In 12 days", "In 26 days", "In 2 months", "In 3 months", "In 5 months"][i]}</T>
          </g>
        ))}
        <C n={1} x={16} y={16} />
        <Arrow d="M166 64 L 186 64" />
        <Box x={190} y={16} w={274} h={248} />
        <T x={202} y={36} fill="var(--ink)" size={12} bold>Anjali & Rahul</T>
        {["Overview", "Guests", "Layout", "Seating", "Checklist", "Payments"].map((l, i) => (
          <g key={l}>
            <T x={202 + i * 43} y={56} size={7.5} fill={i === 4 ? "var(--ink)" : "var(--ink-2)"} bold={i === 4}>{l}</T>
            {i === 4 && <rect x={202 + i * 43} y={60} width={36} height={2} fill="var(--gold)" />}
          </g>
        ))}
        <C n={3} x={190} y={48} />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect x={204} y={76 + i * 26} width={10} height={10} rx={2} fill={i < 2 ? "var(--gold)" : "var(--paper)"} stroke="var(--taupe)" />
            <Bar x={222} y={79 + i * 26} w={150 - i * 10} />
            <T x={452} y={85 + i * 26} anchor="end" size={8}>{["Done", "Done", "Due in 3 days", "Due in 9 days", "Family"][i]}</T>
          </g>
        ))}
        <C n={4} x={190} y={76} />
        <rect x={202} y={214} width={250} height={36} rx={5} fill="var(--paper)" stroke="var(--line)" />
        <T x={212} y={236} fill="var(--ink)">Paid ₹1,91,100 of ₹2,86,650</T>
        <rect x={360} y={228} width={80} height={8} rx={4} fill="var(--gold-soft)" />
        <rect x={360} y={228} width={54} height={8} rx={4} fill="var(--gold)" />
        <C n={6} x={190} y={214} />
      </>
    ),
  },
  guests: {
    title: "Guests and RSVP: the replies so far, households with their functions, the RSVP link and a guest answering on a phone",
    draw: () => (
      <>
        {["Haldi", "Wedding", "Reception"].map((l, i) => (
          <g key={l}>
            <Box x={16 + i * 100} y={14} w={92} h={40} />
            <T x={26 + i * 100} y={30} size={8}>{l}</T>
            <T x={26 + i * 100} y={46} size={12} fill="var(--ink)" bold>{["64", "212", "180"][i]}</T>
          </g>
        ))}
        <C n={6} x={16} y={14} />
        <Box x={16} y={64} w={292} h={200} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i}>
            <Bar x={28} y={80 + i * 30} w={70 + (i % 3) * 14} fill="var(--ink-2)" />
            <T x={28} y={98 + i * 30} size={7.5}>{["4 people · Bride's side", "2 people · Groom's side", "5 people · Family", "1 person · Friends", "3 people · Bride's side", "2 people · College"][i]}</T>
            {[0, 1, 2].map((j) => <rect key={j} x={190 + j * 18} y={80 + i * 30} width={10} height={10} rx={2} fill={(i + j) % 4 ? "var(--gold)" : "var(--paper)"} stroke="var(--taupe)" />)}
            <rect x={252} y={79 + i * 30} width={44} height={12} rx={6} fill="var(--paper)" stroke="var(--line)" />
            <T x={274} y={88 + i * 30} size={7} anchor="middle">WhatsApp</T>
          </g>
        ))}
        <C n={2} x={16} y={64} />
        <C n={3} x={208} y={66} />
        <C n={5} x={296} y={76} />
        <Box x={318} y={14} w={146} h={74} />
        <T x={330} y={32} fill="var(--ink)" bold>RSVP link</T>
        <T x={330} y={48} size={8}>Reply by 10 Feb · meals</T>
        <Btn x={330} y={58} w={122} label="Create RSVP link" primary />
        <C n={4} x={318} y={14} />
        <rect x={350} y={102} width={86} height={160} rx={12} fill="var(--card)" stroke="var(--taupe)" strokeWidth={1.4} />
        <T x={393} y={124} anchor="middle" size={8} fill="var(--ink)" bold>The Menons</T>
        {["Coming", "Not sure", "Not coming"].map((l, i) => (
          <g key={l}>
            <rect x={360} y={134 + i * 24} width={66} height={18} rx={9} fill={i === 0 ? "var(--primary)" : "var(--paper)"} stroke="var(--line)" />
            <T x={393} y={146 + i * 24} anchor="middle" size={7.5} fill={i === 0 ? "var(--on-primary)" : "var(--ink-2)"}>{l}</T>
          </g>
        ))}
        <Bar x={362} y={216} w={62} />
        <Bar x={362} y={228} w={48} />
        <Arrow d="M308 160 C 326 160, 330 170, 346 170" />
      </>
    ),
  },
  layout: {
    title: "The floor plan editor: functions, the toolbar, the Add panel, a selected table with its handles and toolbar, and a selection box",
    draw: () => (
      <>
        {["Haldi", "Wedding", "Reception"].map((l, i) => <Btn key={l} x={16 + i * 66} y={12} w={60} label={l} primary={i === 1} />)}
        <C n={1} x={16} y={12} />
        <Box x={16} y={34} w={344} h={20} />
        {["↶", "↷", "Fit", "Select", "Hand", "Measure", "Layers", "Checks"].map((l, i) => <T key={l} x={26 + i * 41} y={48} size={8}>{l}</T>)}
        <Box x={16} y={62} w={344} h={204} fill="var(--paper)" />
        {Array.from({ length: 10 }, (_, i) => <line key={`v${i}`} x1={16 + (i + 1) * 31} y1={62} x2={16 + (i + 1) * 31} y2={266} stroke="var(--line)" strokeWidth={0.5} />)}
        {Array.from({ length: 6 }, (_, i) => <line key={`h${i}`} x1={16} y1={62 + (i + 1) * 29} x2={360} y2={62 + (i + 1) * 29} stroke="var(--line)" strokeWidth={0.5} />)}
        <rect x={140} y={72} width={96} height={40} rx={3} fill="var(--gold-soft)" stroke="var(--taupe)" />
        <T x={188} y={96} anchor="middle" size={8}>Stage</T>
        <Table x={70} y={160} label="1" />
        <Table x={130} y={160} label="2" />
        <Table x={250} y={160} label="3" selected />
        {[[230, 140], [270, 140], [230, 180], [270, 180]].map(([x, y], i) => <rect key={i} x={x - 3} y={y - 3} width={6} height={6} fill="var(--card)" stroke="var(--gold)" />)}
        <circle cx={250} cy={128} r={3.5} fill="var(--card)" stroke="var(--gold)" />
        <C n={4} x={284} y={150} />
        <rect x={210} y={116} width={90} height={16} rx={4} fill="var(--card)" stroke="var(--line)" />
        <T x={255} y={127} anchor="middle" size={7.5}>− 8 seats + ⟳ ⧉ 🔒</T>
        <C n={5} x={310} y={124} />
        <rect x={40} y={200} width={130} height={56} fill="var(--gold-soft)" opacity={0.4} stroke="var(--gold)" strokeDasharray="4 3" />
        <Table x={70} y={228} r={11} seats={6} label="4" />
        <Table x={130} y={228} r={11} seats={6} label="5" />
        <C n={6} x={40} y={200} />
        <Box x={370} y={12} w={94} h={254} />
        <T x={380} y={30} fill="var(--ink)" bold>Add</T>
        {["Round table", "Long table", "Chair row", "Mandap", "Stage", "Aisle", "Dance floor", "Buffet"].map((l, i) => (
          <g key={l}>
            <rect x={380} y={38 + i * 26} width={74} height={20} rx={4} fill="var(--paper)" stroke="var(--line)" />
            <T x={388} y={51 + i * 26} size={7.5}>{l}</T>
          </g>
        ))}
        <C n={3} x={370} y={12} />
      </>
    ),
  },
  seating: {
    title: "Floor plan tabs, guests to seat, a household dragged onto a table, and the counts",
    draw: () => (
      <>
        {["Layout", "Guests", "Seating"].map((l, i) => (
          <g key={l}>
            <T x={26 + i * 60} y={26} fill={i === 2 ? "var(--ink)" : "var(--ink-2)"} bold={i === 2}>{l}</T>
            {i === 2 && <rect x={26 + i * 60} y={30} width={40} height={2} fill="var(--gold)" />}
          </g>
        ))}
        <C n={2} x={20} y={12} />
        <C n={3} x={80} y={12} />
        <Box x={16} y={42} w={130} h={222} />
        <T x={28} y={60} fill="var(--ink)" bold>To seat</T>
        {["The Menons · 4", "Rahul · 1", "Iyer family · 5", "Priya & Arun · 2", "College · 6"].map((l, i) => (
          <g key={l}>
            <rect x={26} y={70 + i * 30} width={110} height={22} rx={4} fill={i === 0 ? "var(--gold-soft)" : "var(--paper)"} stroke="var(--line)" />
            <circle cx={36} cy={81 + i * 30} r={3} fill={i % 2 ? "var(--ink-2)" : "var(--gold)"} />
            <T x={44} y={84 + i * 30} size={8}>{l}</T>
          </g>
        ))}
        <Box x={156} y={42} w={200} h={222} fill="var(--paper)" />
        <Table x={206} y={100} label="1" filled={6} />
        <Table x={296} y={100} label="2" filled={3} selected />
        <Table x={206} y={200} label="3" filled={8} />
        <Table x={296} y={200} label="4" />
        <Arrow d="M136 81 C 200 60, 250 70, 282 92" />
        <C n={4} x={240} y={60} />
        <Box x={366} y={42} w={98} h={222} />
        <T x={376} y={60} fill="var(--ink)" bold>Counts</T>
        {[["Tables", "4"], ["Chairs", "32"], ["Seated", "17"], ["Mandap", "5 × 5 m"]].map(([a, b], i) => (
          <g key={a}>
            <T x={376} y={84 + i * 22} size={8}>{a}</T>
            <T x={454} y={84 + i * 22} size={8} anchor="end" fill="var(--ink)" bold>{b}</T>
          </g>
        ))}
        <Btn x={376} y={180} w={78} label="Inventory ▾" />
        <C n={5} x={366} y={42} />
      </>
    ),
  },
  expenses: {
    title: "Expenses: record with proof, the ledgers, a staff advance, the handover file, the review and the reply",
    draw: () => (
      <>
        <rect x={20} y={22} width={76} height={136} rx={12} fill="var(--card)" stroke="var(--taupe)" strokeWidth={1.4} />
        <rect x={30} y={36} width={56} height={56} rx={4} fill="var(--gold-soft)" />
        <T x={58} y={68} anchor="middle" size={8}>GPay ✓</T>
        <Bar x={30} y={102} w={44} />
        <T x={30} y={124} size={9} fill="var(--ink)" bold>₹12,500</T>
        <Btn x={30} y={134} w={56} label="Save" primary />
        <C n={1} x={20} y={22} />
        <C n={2} x={86} y={36} />
        <Box x={112} y={16} w={170} h={142} />
        <T x={124} y={34} fill="var(--ink)" bold>Ledgers</T>
        {[["Company", "₹42,300"], ["Menon wedding", "₹1,86,000"], ["Iyer reception", "₹64,200"]].map(([a, b], i) => (
          <g key={a}>
            <rect x={122} y={44 + i * 26} width={150} height={20} rx={4} fill="var(--paper)" stroke="var(--line)" />
            <T x={130} y={57 + i * 26} size={8}>{a}</T>
            <T x={264} y={57 + i * 26} size={8} anchor="end" fill="var(--ink)">{b}</T>
          </g>
        ))}
        <rect x={122} y={124} width={150} height={24} rx={4} fill="var(--gold-wash)" stroke="var(--gold)" />
        <T x={130} y={139} size={8}>Advance · Arjun · ₹6,000 left</T>
        <C n={3} x={112} y={16} />
        <C n={4} x={272} y={124} />
        <Arrow d="M290 86 L 318 86" />
        <Box x={322} y={52} w={142} h={70} />
        <T x={393} y={76} anchor="middle" fill="var(--ink)" bold>Prepare handover</T>
        <rect x={376} y={86} width={34} height={26} rx={3} fill="var(--gold-soft)" stroke="var(--taupe)" />
        <T x={393} y={103} anchor="middle" size={7.5}>.zip</T>
        <C n={5} x={322} y={52} />
        <Arrow d="M393 126 L 393 166" />
        <Box x={250} y={170} w={214} h={94} />
        <T x={262} y={188} fill="var(--ink)" bold>A colleague reviews</T>
        {[["Fuel", "Checked ✓"], ["Flowers", "Query ?"], ["Lunch", "Checked ✓"]].map(([a, b], i) => (
          <g key={a}>
            <T x={262} y={206 + i * 16} size={8}>{a}</T>
            <T x={452} y={206 + i * 16} size={8} anchor="end" fill={b.startsWith("Query") ? "var(--danger-ink)" : "var(--ink)"}>{b}</T>
          </g>
        ))}
        <C n={6} x={250} y={170} />
        <Arrow d="M246 216 C 180 216, 140 216, 110 186" />
        <Box x={16} y={176} w={180} h={88} />
        <T x={28} y={196} fill="var(--ink)" bold>Import the reply</T>
        <T x={28} y={214} size={8}>Reviews land on your expenses;</T>
        <T x={28} y={228} size={8}>advances show what's settled.</T>
        <C n={7} x={16} y={176} />
      </>
    ),
  },
  portal: {
    title: "Client portal: pick the wedding, create the link and password, the family's page, and updating it",
    draw: () => (
      <>
        <Box x={16} y={16} w={196} h={248} />
        <T x={28} y={36} fill="var(--ink)" bold>Client Portal</T>
        {["Menon wedding", "Iyer reception", "Thomas engagement"].map((l, i) => (
          <g key={l}>
            <rect x={26} y={46 + i * 28} width={176} height={22} rx={4} fill={i === 0 ? "var(--gold-soft)" : "var(--paper)"} stroke="var(--line)" />
            <T x={34} y={60 + i * 28} size={8}>{l}</T>
          </g>
        ))}
        <C n={1} x={16} y={46} />
        <rect x={26} y={140} width={176} height={60} rx={5} fill="var(--paper)" stroke="var(--line)" />
        <T x={34} y={158} size={8}>Link</T>
        <Bar x={34} y={164} w={150} fill="var(--gold-soft)" />
        <T x={34} y={186} size={8}>Password ••••••••</T>
        <C n={2} x={202} y={140} />
        <Btn x={26} y={212} w={84} label="Update portal" primary />
        <Btn x={118} y={212} w={84} label="Turn off" />
        <C n={4} x={26} y={212} />
        <Arrow d="M218 160 L 250 160" />
        <rect x={258} y={16} width={206} height={248} rx={10} fill="var(--card)" stroke="var(--taupe)" strokeWidth={1.4} />
        <T x={361} y={38} anchor="middle" fill="var(--ink)" size={11} bold>Anjali & Rahul</T>
        {[["Proposal", "Approve · Ask for changes"], ["Your to-dos", "3 of 5 done"], ["Payments", "Next ₹95,550 on 5 Feb"], ["Questions", "Planning questionnaire"]].map(([a, b], i) => (
          <g key={a}>
            <rect x={270} y={50 + i * 50} width={182} height={40} rx={6} fill="var(--paper)" stroke="var(--line)" />
            <T x={280} y={66 + i * 50} size={9} fill="var(--ink)" bold>{a}</T>
            <T x={280} y={80 + i * 50} size={8}>{b}</T>
          </g>
        ))}
        <C n={3} x={258} y={16} />
      </>
    ),
  },
  crm: {
    title: "CRM: add an enquiry, move it through the stages, follow up, and create a proposal from it",
    draw: () => (
      <>
        <Btn x={16} y={14} w={90} label="+ Add enquiry" primary />
        <C n={1} x={16} y={14} />
        {["New", "Contacted", "Meeting", "Proposal sent", "Won"].map((l, i) => (
          <g key={l}>
            <Box x={16 + i * 90} y={40} w={84} h={224} fill="var(--card)" />
            <T x={24 + i * 90} y={56} size={8} fill="var(--ink)" bold>{l}</T>
            {Array.from({ length: [3, 2, 2, 1, 1][i] }, (_, j) => (
              <g key={j}>
                <rect x={22 + i * 90} y={64 + j * 50} width={72} height={42} rx={4} fill={i === 2 && j === 0 ? "var(--gold-wash)" : "var(--paper)"} stroke={i === 2 && j === 0 ? "var(--gold)" : "var(--line)"} />
                <Bar x={28 + i * 90} y={72 + j * 50} w={50} fill="var(--ink-2)" />
                <T x={28 + i * 90} y={94 + j * 50} size={7}>{i === 2 && j === 0 ? "Follow up today" : "Feb 2027 · 300"}</T>
              </g>
            ))}
          </g>
        ))}
        <C n={2} x={16} y={40} />
        <Arrow d="M96 85 L 108 85" />
        <C n={3} x={194} y={64} />
        <Btn x={202} y={118} w={88} label="Create proposal" />
        <C n={4} x={290} y={118} />
      </>
    ),
  },
};

export const figureTitle = (id: FigureId) => FIG[id].title;

/** the illustration for a topic */
export default function Figure({ id }: { id: FigureId }) {
  const f = FIG[id];
  return <Frame title={f.title}>{f.draw()}</Frame>;
}

export const FIGURE_IDS = Object.keys(FIG) as FigureId[];
