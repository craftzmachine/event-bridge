import type { ReactNode } from "react";

export interface Crumb {
  label: string;
  href?: string;
}

/** "← Dashboard › Events › Ananya Menon": where this page sits, each step a link back. The Dashboard is the way into every app. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`}>
            {c.href && i < items.length - 1 ? (
              <a href={c.href} className={i === 0 && c.href === "#/dashboard" ? "crumbs-home" : undefined}>{i === 0 && c.href === "#/dashboard" ? `← ${c.label}` : c.label}</a>
            ) : (
              <span aria-current={i === items.length - 1 ? "page" : undefined}>{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A page's head in the app shell: breadcrumb, title, a line about the page, and its actions on the right. */
export default function PageHeader({ crumbs, title, subtitle, actions, children, tour }: { crumbs?: Crumb[]; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; tour?: string }) {
  return (
    <header className="page-head" data-tour={tour}>
      {crumbs && crumbs.length > 0 && <Breadcrumbs items={crumbs} />}
      <div className="page-head-row">
        <div className="page-head-text">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="page-head-actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
