import Link from "next/link";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <nav className="flex flex-wrap gap-3 text-sm font-medium text-slate-600">
          <Link href="/" className="rounded-full px-3 py-1 hover:bg-white">
            Home
          </Link>
          <Link
            href="/submit"
            className="rounded-full px-3 py-1 hover:bg-white"
          >
            Submit Ticket
          </Link>
          <Link
            href="/requests"
            className="rounded-full px-3 py-1 hover:bg-white"
          >
            My Requests
          </Link>
        </nav>

        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.25)] sm:p-10">
          <div className="max-w-3xl space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              RELAY
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Internal Parts Dashboard
            </h1>
            <p className="text-sm leading-7 text-slate-600 sm:text-base">
              This internal view will support triage, ordering, and fulfillment
              workflows for parts teams in a later backend phase.
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm font-medium text-slate-700">
                Queue placeholder
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Pending and query-state tickets will be surfaced here.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm font-medium text-slate-700">
                Order tracking placeholder
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Ordered and ready requests will be grouped for follow-through.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm font-medium text-slate-700">
                Activity placeholder
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Internal notes, assignment, and operational summaries will be
                added here.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
