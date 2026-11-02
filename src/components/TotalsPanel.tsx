import type { Totals } from "../lib/totals";
import { formatINR } from "../lib/format";
import { useConfig } from "../config/context";

export default function TotalsPanel({ t, pct, compact = false }: { t: Totals; pct: number; compact?: boolean }) {
  const { brand } = useConfig();
  return (
    <dl className={`totals ${compact ? "totals-compact" : ""}`}>
      <div><dt>Sub Total</dt><dd>{formatINR(t.subTotal)}</dd></div>
      {pct > 0 && <div><dt>{brand.coordinationLabel} ({pct}%)</dt><dd>{formatINR(t.coordination)}</dd></div>}
      {t.roundOff !== 0 && <div><dt>Rounded Off</dt><dd>{formatINR(t.roundOff)}</dd></div>}
      <div className="totals-gt"><dt>Grand Total</dt><dd>{formatINR(t.grandTotal)}</dd></div>
      {!compact && (
        <div className="totals-ref"><dt>Incl. GST @ {brand.gstPct}%</dt><dd>{formatINR(t.totalWithGst)}</dd></div>
      )}
      {t.optionsTotal > 0 && (
        <div className="totals-ref"><dt>Additional options (not included)</dt><dd>{formatINR(t.optionsTotal)}</dd></div>
      )}
    </dl>
  );
}
