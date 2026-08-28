import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  context,
  tone = "slate",
  onClick,
}: {
  label: string;
  value: string;
  context?: ReactNode;
  tone?: "slate" | "red" | "amber" | "blue" | "green";
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className={`relay-stat-accent relay-stat-accent-${tone}`} />
      <span className="relay-stat-label">{label}</span>
      <strong>{value}</strong>
      {context ? <span className="relay-stat-context">{context}</span> : null}
    </>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className="relay-stat-card relay-stat-card-action">
      {content}
    </button>
  ) : (
    <article className="relay-stat-card">{content}</article>
  );
}
