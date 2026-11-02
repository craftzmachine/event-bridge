import type { CatalogElement } from "../types";
import { formatINRShort } from "../lib/format";

export default function ElementCard({
  element,
  count,
  fits,
  onAdd,
}: {
  element: CatalogElement;
  count: number;
  fits: boolean;
  onAdd: () => void;
}) {
  const price =
    element.defaultPrice === null
      ? "As per actuals"
      : `${formatINRShort(element.defaultPrice)}${element.defaultQty > 1 ? ` × ${element.defaultQty} ${element.unit}` : ""}`;
  return (
    <article className={`el-card ${count ? "is-added" : ""}`}>
      <div className="el-main">
        <h4>{element.name}</h4>
        {element.description && <p className="el-desc">{element.description}</p>}
        <p className="el-meta">
          <span>{price}</span>
          {!!element.upgrades?.length && <span className="pill">{element.upgrades.length} upgrade{element.upgrades.length > 1 ? "s" : ""}</span>}
          {!fits && <span className="pill pill-muted">other occasion</span>}
        </p>
      </div>
      <button className={count ? "btn-added" : "btn-add"} onClick={onAdd} aria-label={`Add ${element.name}`} title={count ? "Add another" : undefined}>
        {count ? `✓ Added${count > 1 ? ` ×${count}` : ""}` : "+ Add"}
      </button>
    </article>
  );
}
