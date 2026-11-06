import { decisionLine, type ShareDecision } from "../lib/shares";

/** The client's answer from the shared page, for the Visualize list and the Studio cards. */
export default function ClientAnswer({ d }: { d: ShareDecision }) {
  return (
    <span className={`client-answer is-${d.kind}`}>
      <span className="client-answer-line">Client: {decisionLine(d)}</span>
      {d.comment && <q className="client-answer-comment">{d.comment}</q>}
    </span>
  );
}
