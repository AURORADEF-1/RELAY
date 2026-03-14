import Link from "next/link";

const tickets = [
  {
    id: "RLY-1042",
    machineReference: "MLP-EXTR-07",
    requestSummary: "Replace worn feeder rollers on line 2 assembly unit.",
    status: "PENDING",
    updatedDate: "14 Mar 2026",
  },
  {
    id: "RLY-1039",
    machineReference: "MLP-CNC-14",
    requestSummary: "Confirm spindle belt specification before order release.",
    status: "QUERY",
    updatedDate: "13 Mar 2026",
  },
  {
    id: "RLY-1035",
    machineReference: "MLP-PACK-03",
    requestSummary: "Order replacement photoeye sensor and mounting bracket.",
    status: "ORDERED",
    updatedDate: "12 Mar 2026",
  },
  {
    id: "RLY-1028",
    machineReference: "MLP-MILL-11",
    requestSummary: "Seal kit and coolant hose ready for collection.",
    status: "READY",
    updatedDate: "12 Mar 2026",
  },
  {
    id: "RLY-1016",
    machineReference: "MLP-PRESS-02",
    requestSummary: "Hydraulic pressure switch replaced and job closed out.",
    status: "COMPLETED",
    updatedDate: "10 Mar 2026",
  },
];

const statusTones: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 ring-amber-200",
  QUERY: "bg-orange-100 text-orange-800 ring-orange-200",
  ORDERED: "bg-sky-100 text-sky-800 ring-sky-200",
  READY: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  COMPLETED: "bg-slate-100 text-slate-700 ring-slate-200",
};

export default function RequestsPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-6">
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
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                RELAY
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                My Requests
              </h1>
              <p className="text-sm leading-7 text-slate-600 sm:text-base">
                Track active and completed parts requests with clear status
                visibility across the RELAY workflow.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {Object.keys(statusTones).map((status) => (
                <div
                  key={status}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center"
                >
                  <p className="text-xs font-semibold tracking-wide text-slate-500">
                    {status}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {tickets.filter((ticket) => ticket.status === status).length}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200">
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-4">Ticket ID</th>
                    <th className="px-6 py-4">Machine Reference</th>
                    <th className="px-6 py-4">Request Summary</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} className="align-top">
                      <td className="px-6 py-4 text-sm font-semibold text-slate-900">
                        {ticket.id}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {ticket.machineReference}
                      </td>
                      <td className="px-6 py-4 text-sm leading-6 text-slate-600">
                        {ticket.requestSummary}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={ticket.status} />
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {ticket.updatedDate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 bg-slate-50 p-4 lg:hidden">
              {tickets.map((ticket) => (
                <article
                  key={ticket.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {ticket.id}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {ticket.machineReference}
                      </p>
                    </div>
                    <StatusBadge status={ticket.status} />
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-600">
                    {ticket.requestSummary}
                  </p>
                  <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Updated {ticket.updatedDate}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${
        statusTones[status]
      }`}
    >
      {status}
    </span>
  );
}
