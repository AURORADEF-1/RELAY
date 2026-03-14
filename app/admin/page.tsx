"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const statuses = ["ALL", "PENDING", "QUERY", "ORDERED", "READY", "COMPLETED"] as const;
type Status = (typeof statuses)[number];
type TicketStatus = Exclude<Status, "ALL">;

type Ticket = {
  id: string;
  requester: string;
  machineReference: string;
  requestSummary: string;
  status: TicketStatus;
  assignedTo: string;
};

const initialTickets: Ticket[] = [
  {
    id: "RLY-1042",
    requester: "Amelia Hart",
    machineReference: "MLP-EXTR-07",
    requestSummary: "Replace worn feeder rollers on line 2 assembly unit.",
    status: "PENDING",
    assignedTo: "Jordan P",
  },
  {
    id: "RLY-1039",
    requester: "Luca Mason",
    machineReference: "MLP-CNC-14",
    requestSummary: "Confirm spindle belt specification before order release.",
    status: "QUERY",
    assignedTo: "Priya S",
  },
  {
    id: "RLY-1035",
    requester: "Elena Brooks",
    machineReference: "MLP-PACK-03",
    requestSummary: "Order replacement photoeye sensor and mounting bracket.",
    status: "ORDERED",
    assignedTo: "Jordan P",
  },
  {
    id: "RLY-1028",
    requester: "Marcus Lee",
    machineReference: "MLP-MILL-11",
    requestSummary: "Seal kit and coolant hose ready for collection.",
    status: "READY",
    assignedTo: "Hannah T",
  },
  {
    id: "RLY-1016",
    requester: "Nina Patel",
    machineReference: "MLP-PRESS-02",
    requestSummary: "Hydraulic pressure switch replaced and job closed out.",
    status: "COMPLETED",
    assignedTo: "Hannah T",
  },
  {
    id: "RLY-1011",
    requester: "Owen Clarke",
    machineReference: "MLP-WELD-05",
    requestSummary: "Source replacement torch consumables and cable set.",
    status: "PENDING",
    assignedTo: "Priya S",
  },
];

const statusTones: Record<TicketStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 ring-amber-200",
  QUERY: "bg-orange-100 text-orange-800 ring-orange-200",
  ORDERED: "bg-sky-100 text-sky-800 ring-sky-200",
  READY: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  COMPLETED: "bg-slate-100 text-slate-700 ring-slate-200",
};

export default function AdminPage() {
  const [statusFilter, setStatusFilter] = useState<Status>("ALL");
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);

  const filteredTickets = useMemo(() => {
    if (statusFilter === "ALL") {
      return tickets;
    }

    return tickets.filter((ticket) => ticket.status === statusFilter);
  }, [statusFilter, tickets]);

  function handleStatusChange(ticketId: string, nextStatus: TicketStatus) {
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === ticketId ? { ...ticket, status: nextStatus } : ticket,
      ),
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
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
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                RELAY
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Internal Parts Dashboard
              </h1>
              <p className="text-sm leading-7 text-slate-600 sm:text-base">
                Review all request activity, filter the queue by status, and
                adjust workflow state directly from the dashboard.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="text-sm font-medium text-slate-600">
                Filter by status
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as Status)}
                className="h-11 rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400"
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {statuses.slice(1).map((status) => (
              <div
                key={status}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <p className="text-xs font-semibold tracking-wide text-slate-500">
                  {status}
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {tickets.filter((ticket) => ticket.status === status).length}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200">
            <div className="hidden overflow-x-auto xl:block">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-4">Ticket</th>
                    <th className="px-6 py-4">Requester</th>
                    <th className="px-6 py-4">Machine Reference</th>
                    <th className="px-6 py-4">Request Summary</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Assigned To</th>
                    <th className="px-6 py-4">Update Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredTickets.map((ticket) => (
                    <tr key={ticket.id} className="align-top">
                      <td className="px-6 py-4 text-sm font-semibold text-slate-900">
                        {ticket.id}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {ticket.requester}
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
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {ticket.assignedTo}
                      </td>
                      <td className="px-6 py-4">
                        <StatusSelect
                          ticketId={ticket.id}
                          value={ticket.status}
                          onChange={handleStatusChange}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 bg-slate-50 p-4 xl:hidden">
              {filteredTickets.map((ticket) => (
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
                        {ticket.requester}
                      </p>
                    </div>
                    <StatusBadge status={ticket.status} />
                  </div>

                  <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Machine Reference
                      </dt>
                      <dd className="mt-1 text-sm text-slate-700">
                        {ticket.machineReference}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Assigned To
                      </dt>
                      <dd className="mt-1 text-sm text-slate-700">
                        {ticket.assignedTo}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Request Summary
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {ticket.requestSummary}
                    </p>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Update Status
                    </p>
                    <div className="mt-2 max-w-xs">
                      <StatusSelect
                        ticketId={ticket.id}
                        value={ticket.status}
                        onChange={handleStatusChange}
                      />
                    </div>
                  </div>
                </article>
              ))}

              {filteredTickets.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                  No tickets match the current status filter.
                </div>
              ) : null}
            </div>
          </div>

          {filteredTickets.length === 0 ? (
            <div className="mt-4 hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500 xl:block">
              No tickets match the current status filter.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: TicketStatus }) {
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

function StatusSelect({
  ticketId,
  value,
  onChange,
}: {
  ticketId: string;
  value: TicketStatus;
  onChange: (ticketId: string, nextStatus: TicketStatus) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) =>
        onChange(ticketId, event.target.value as TicketStatus)
      }
      className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400"
    >
      {statuses.slice(1).map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  );
}
