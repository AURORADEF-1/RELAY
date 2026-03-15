const statusTones: Record<string, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-900",
  ESTIMATE: "border-violet-200 bg-violet-50 text-violet-900",
  QUOTE: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900",
  QUERY: "border-orange-200 bg-orange-50 text-orange-900",
  IN_PROGRESS: "border-blue-200 bg-blue-50 text-blue-900",
  ORDERED: "border-sky-200 bg-sky-50 text-sky-900",
  READY: "border-emerald-200 bg-emerald-50 text-emerald-900",
  COMPLETED: "border-slate-200 bg-slate-100 text-slate-800",
};

const statusDots: Record<string, string> = {
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
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-semibold tracking-[0.14em] ${
        statusTones[status] ?? "border-slate-200 bg-slate-100 text-slate-800"
      }`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${statusDots[status] ?? "bg-slate-500"}`}
      />
      {status}
    </span>
  );
}
