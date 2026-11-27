// The first-run state of a list: an icon, a short title, one line on what goes here, and the action that starts it.
import type { ReactNode } from "react";
import Icon from "./icons";
import type { IconName } from "../lib/nav";

export default function EmptyState({ icon, title, children, actions }: { icon: IconName; title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty-state flex flex-col items-center gap-3 px-6 py-12">
      <span className="grid h-14 w-14 place-items-center rounded-full border border-taupe bg-gold-soft text-gold-text">
        <Icon name={icon} size={26} />
      </span>
      <h2 className="m-0 font-serif text-2xl text-ink">{title}</h2>
      <p className="m-0 max-w-md text-sm leading-relaxed text-ink-2">{children}</p>
      {actions && <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
