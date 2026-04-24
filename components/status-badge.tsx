const statusTones: Record<string, string> = {
  OPEN: "border-[color:rgba(4,120,87,0.28)] bg-[color:rgba(4,120,87,0.1)] text-[color:var(--success)]",
  CLOSED: "border-[color:var(--border)] bg-[color:var(--background-muted)] text-[color:var(--foreground-muted)]",
  PENDING: "border-[color:rgba(180,83,9,0.28)] bg-[color:rgba(180,83,9,0.1)] text-[color:var(--warning)]",
  ESTIMATE: "border-[color:rgba(124,58,237,0.28)] bg-[color:rgba(124,58,237,0.1)] text-violet-500",
  QUOTE: "border-[color:rgba(192,38,211,0.28)] bg-[color:rgba(192,38,211,0.1)] text-fuchsia-500",
  QUERY: "border-[color:rgba(234,88,12,0.28)] bg-[color:rgba(234,88,12,0.1)] text-orange-500",
  IN_PROGRESS: "border-[color:rgba(37,99,235,0.28)] bg-[color:rgba(37,99,235,0.1)] text-blue-500",
  ORDERED: "border-[color:rgba(2,132,199,0.28)] bg-[color:rgba(2,132,199,0.1)] text-sky-500",
  READY: "border-[color:rgba(4,120,87,0.28)] bg-[color:rgba(4,120,87,0.1)] text-[color:var(--success)]",
  COMPLETED: "border-[color:var(--border)] bg-[color:var(--background-muted)] text-[color:var(--foreground-muted)]",
};

const statusDots: Record<string, string> = {
  OPEN: "bg-emerald-500",
  CLOSED: "bg-slate-500",
  PENDING: "bg-amber-500",
  ESTIMATE: "bg-violet-500",
  QUOTE: "bg-fuchsia-500",
  QUERY: "bg-orange-500",
  IN_PROGRESS: "bg-blue-500",
  ORDERED: "bg-sky-500",
  READY: "bg-emerald-500",
  COMPLETED: "bg-slate-500",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-semibold tracking-[0.16em] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${
        statusTones[status] ?? "border-[color:var(--border)] bg-[color:var(--background-muted)] text-[color:var(--foreground-muted)]"
      }`}
    >
      <span
        className={`aurora-status-dot ${statusDots[status] ?? "bg-slate-500"}`}
      />
      {status}
    </span>
  );
}
