import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";

const statuses = [
  { label: "PENDING", tone: "border-amber-200 bg-amber-50 text-amber-900", dot: "bg-amber-500" },
  { label: "QUERY", tone: "border-orange-200 bg-orange-50 text-orange-900", dot: "bg-orange-500" },
  { label: "ORDERED", tone: "border-sky-200 bg-sky-50 text-sky-900", dot: "bg-sky-500" },
  { label: "READY", tone: "border-emerald-200 bg-emerald-50 text-emerald-900", dot: "bg-emerald-500" },
  { label: "COMPLETED", tone: "border-slate-200 bg-slate-100 text-slate-800", dot: "bg-slate-500" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <nav className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
            <Link href="/login" className="rounded-full px-4 py-2 transition hover:bg-slate-100">
              Login
            </Link>
            <Link
              href="/submit"
              className="rounded-full px-4 py-2 transition hover:bg-slate-100"
            >
              Submit Ticket
            </Link>
            <Link
              href="/requests"
              className="rounded-full px-4 py-2 transition hover:bg-slate-100"
            >
              My Requests
            </Link>
            <Link
              href="/admin"
              className="rounded-full px-4 py-2 transition hover:bg-slate-100"
            >
              Admin Dashboard
            </Link>
            <LogoutButton />
          </div>
        </nav>

        <div className="flex min-h-[calc(100vh-9rem)] items-center">
          <section className="w-full overflow-hidden rounded-[2rem] border border-white/80 bg-white/90 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur">
            <div className="grid gap-10 px-8 py-10 sm:px-10 sm:py-12 lg:grid-cols-[1.2fr_0.8fr] lg:px-12 lg:py-14">
              <div className="flex flex-col justify-between gap-10">
                <div className="space-y-7">
                  <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold tracking-[0.24em] text-slate-600">
                    MLP Operations Platform
                  </div>
                  <div className="space-y-5">
                    <RelayLogo compact className="lg:hidden" />
                    <h1 className="text-5xl font-semibold tracking-[-0.06em] text-slate-950 sm:text-6xl lg:text-7xl">
                      RELAY
                    </h1>
                    <p className="text-lg font-medium tracking-[-0.02em] text-slate-600 sm:text-[1.35rem]">
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

                <div className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50/90 p-5 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Routing
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      Ticket-linked workflow from request to fulfillment.
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Visibility
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      Clear status tracking across Stores and workshop teams.
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Platform
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      Designed for AURORA SystemsTM internal operations.
                    </p>
                  </div>
                </div>
              </div>

              <aside className="rounded-[1.75rem] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-6 sm:p-7">
                <div className="space-y-7">
                  <div className="hidden lg:block">
                    <RelayLogo />
                  </div>
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
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Brand
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      RELAY is the internal request workflow for
                      {" "}
                      <span className="font-semibold text-slate-900">
                        AURORA SystemsTM
                      </span>
                      .
                    </p>
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
