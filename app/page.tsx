import Link from "next/link";

const statuses = [
  { label: "PENDING", tone: "bg-amber-100 text-amber-800 ring-amber-200" },
  { label: "QUERY", tone: "bg-orange-100 text-orange-800 ring-orange-200" },
  { label: "ORDERED", tone: "bg-sky-100 text-sky-800 ring-sky-200" },
  { label: "READY", tone: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  { label: "COMPLETED", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center">
        <section className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]">
          <div className="grid gap-10 px-8 py-10 sm:px-10 lg:grid-cols-[1.2fr_0.8fr] lg:px-12 lg:py-12">
            <div className="flex flex-col justify-between gap-10">
              <div className="space-y-6">
                <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold tracking-[0.22em] text-slate-600">
                  MLP Operations
                </div>
                <div className="space-y-3">
                  <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                    RELAY
                  </h1>
                  <p className="text-lg text-slate-600 sm:text-xl">
                    MLP Parts Request Workflow
                  </p>
                </div>
                <p className="max-w-xl text-sm leading-7 text-slate-500 sm:text-base">
                  Submit and track parts requests through a clear workflow built
                  for fast coordination between requesters and fulfillment teams.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/submit"
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Submit Ticket
                </Link>
                <Link
                  href="/requests"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  View My Requests
                </Link>
              </div>
            </div>

            <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Status Legend
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Current workflow states for all submitted requests.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {statuses.map((status) => (
                    <span
                      key={status.label}
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${status.tone}`}
                    >
                      {status.label}
                    </span>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
