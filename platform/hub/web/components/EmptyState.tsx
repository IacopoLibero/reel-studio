import type { ReactNode } from "react";

/** A first-step message for a page that has nothing to show yet: what it is for, and what to do first. */
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="card empty-state" role="status">
      <strong>{title}</strong>
      <p className="muted">{children}</p>
      {action && <div className="row wrap">{action}</div>}
    </div>
  );
}
