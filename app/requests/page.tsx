import Link from "next/link";

export default function RequestsPage() {
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
          <Link href="/admin" className="rounded-full px-3 py-1 hover:bg-white">
            Admin
          </Link>
        </nav>

        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.25)] sm:p-10">
          <div className="max-w-3xl space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              RELAY
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              My Requests
            </h1>
            <p className="text-sm leading-7 text-slate-600 sm:text-base">
              This requester view will show submitted tickets, statuses, and
              follow-up actions once data is connected.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm font-medium text-slate-700">
                Request list placeholder
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                A table or card list of active and historical tickets will live
                here.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm font-medium text-slate-700">
                Status detail placeholder
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Selected request details, comments, and updates will appear in
                this panel.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
