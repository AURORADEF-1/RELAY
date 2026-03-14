import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";

const statuses = [
  { label: "PENDING", tone: "border-amber-200 bg-amber-50 text-amber-900", dot: "bg-amber-500" },
  { label: "QUERY", tone: "border-orange-200 bg-orange-50 text-orange-900", dot: "bg-orange-500" },
  { label: "ORDERED", tone: "border-sky-200 bg-sky-50 text-sky-900", dot: "bg-sky-500" },
  { label: "READY", tone: "border-emerald-200 bg-emerald-50 text-emerald-900", dot: "bg-emerald-500" },
  { label: "COMPLETED", tone: "border-slate-200 bg-slate-100 text-slate-800", dot: "bg-slate-500" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <nav className="mb-8 flex flex-wrap items-center justify-between gap-4 text-sm font-medium text-slate-600">
          <div className="flex flex-wrap gap-3">
            <Link href="/login" className="rounded-full px-4 py-2 hover:bg-white">
              Login
            </Link>
            <Link href="/submit" className="rounded-full px-4 py-2 hover:bg-white">
              Submit Ticket
            </Link>
            <Link
              href="/requests"
              className="rounded-full px-4 py-2 hover:bg-white"
            >
              My Requests
            </Link>
            <Link href="/admin" className="rounded-full px-4 py-2 hover:bg-white">
              Admin Dashboard
            </Link>
          </div>
          <LogoutButton />
        </nav>

        <div className="flex min-h-[calc(100vh-8.5rem)] items-center">
          <section className="w-full overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]">
            <div className="grid gap-12 px-8 py-10 sm:px-10 sm:py-12 lg:grid-cols-[1.2fr_0.8fr] lg:px-12 lg:py-14">
              <div className="flex flex-col justify-between gap-12">
                <div className="space-y-7">
                  <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold tracking-[0.24em] text-slate-600">
                  MLP Operations
                  </div>
                  <div className="space-y-4">
                    <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-6xl">
                      RELAY
                    </h1>
                    <p className="text-lg font-medium text-slate-600 sm:text-[1.35rem]">
                      MLP Parts Request Workflow
                    </p>
                  </div>
                  <p className="max-w-xl text-base leading-8 text-slate-500">
                    Submit and track parts requests through a clear workflow built
                    for fast coordination between requesters and fulfillment teams.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Link
                    href="/submit"
                    className="inline-flex h-12 items-center justify-center rounded-xl bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Submit Ticket
                  </Link>
                  <Link
                    href="/requests"
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    View My Requests
                  </Link>
                  <Link
                    href="/admin"
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-6 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
                  >
                    Admin Dashboard
                  </Link>
                </div>
              </div>

              <aside className="rounded-3xl border border-slate-200 bg-slate-50 p-6 sm:p-7">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-900">
                      Status Legend
                    </p>
                    <p className="text-sm leading-6 text-slate-500">
                      Current workflow states for all submitted requests.
                    </p>
                  </div>
                  <div className="grid gap-3">
                    {statuses.map((status) => (
                      <span
                        key={status.label}
                        className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold tracking-[0.14em] ${status.tone}`}
                      >
                        <span className={`h-2.5 w-2.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
