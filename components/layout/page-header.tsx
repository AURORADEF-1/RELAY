import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  meta,
  actions,
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="relay-page-header">
      <div className="relay-page-header-copy">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {meta ? <div className="relay-page-header-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="relay-page-header-actions">{actions}</div> : null}
    </header>
  );
}
