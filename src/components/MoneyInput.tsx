import { useEffect, useState } from "react";
import { groupINR } from "../lib/format";

/** Rupee input that shows Indian grouping while not focused. */
export default function MoneyInput({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  label: string;
  placeholder?: string;
}) {
  const [focus, setFocus] = useState(false);
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => {
    if (!focus) setText(value === null ? "" : String(value));
  }, [value, focus]);

  return (
    <label className="money">
      <span className="money-sym">₹</span>
      <input
        aria-label={label}
        inputMode="decimal"
        placeholder={placeholder}
        value={focus ? text : value === null ? "" : groupINR(value, value % 1 ? 2 : 0)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.]/g, "");
          setText(t);
          onChange(t === "" ? null : Number(t) || 0);
        }}
      />
    </label>
  );
}
