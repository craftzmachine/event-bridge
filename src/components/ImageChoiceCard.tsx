import type { Choice } from "../types";
import Img from "./Img";

export default function ImageChoiceCard({ choice, selected, onSelect }: { choice: Choice; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`choice ${selected ? "is-selected" : ""}`} aria-pressed={selected} onClick={onSelect}>
      <Img src={choice.image} alt={choice.label} className="choice-img" />
      <span className="choice-body">
        <span className="choice-label">{choice.label}</span>
        {choice.blurb && <span className="choice-blurb">{choice.blurb}</span>}
      </span>
      <span className="choice-tick" aria-hidden>
        ✓
      </span>
    </button>
  );
}
