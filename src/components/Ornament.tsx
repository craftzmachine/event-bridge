/** Thin gold rule with a small flourish, echoing the rules in the Parinay crest. */
export default function Ornament({ className = "" }: { className?: string }) {
  return (
    <svg className={`ornament ${className}`} viewBox="0 0 240 18" aria-hidden focusable="false">
      <path d="M0 9H98M142 9H240" stroke="currentColor" strokeWidth="1" />
      <path d="M120 2.5 126.5 9 120 15.5 113.5 9Z" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M120 6 123 9 120 12 117 9Z" fill="currentColor" />
      <circle cx="105" cy="9" r="1.7" fill="currentColor" />
      <circle cx="135" cy="9" r="1.7" fill="currentColor" />
    </svg>
  );
}
