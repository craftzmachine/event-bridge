export const STEPS = ["Client & event", "Occasion", "Elements", "Review & export"];

export default function StepRail({ step, onStep, canReach }: { step: number; onStep: (i: number) => void; canReach: (i: number) => boolean }) {
  return (
    <nav className="steprail" aria-label="Proposal steps">
      {STEPS.map((label, i) => (
        <button
          key={label}
          className={`step ${i === step ? "is-current" : ""} ${i < step ? "is-done" : ""}`}
          aria-current={i === step ? "step" : undefined}
          disabled={!canReach(i)}
          onClick={() => onStep(i)}
        >
          <span className="step-num">{i < step ? "✓" : i + 1}</span>
          <span className="step-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
