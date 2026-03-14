"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { LogoutButton } from "@/components/logout-button";
import { StatusBadge } from "@/components/status-badge";
import { getSupabaseClient } from "@/lib/supabase";

const statuses = ["ALL", "PENDING", "QUERY", "ORDERED", "READY", "COMPLETED"] as const;
type Status = (typeof statuses)[number];
type TicketStatus = Exclude<Status, "ALL">;

type Ticket = {
  id: string;
  requester_name: string | null;
  department: string | null;
  machine_reference: string | null;
  job_number: string | null;
  request_summary: string | null;
  request_details: string | null;
  status: TicketStatus | null;
  assigned_to: string | null;
  notes: string | null;
};

export default function AdminPage() {
  const [statusFilter, setStatusFilter] = useState<Status>("ALL");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { assigned_to: string; notes: string }>>(
    {},
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadTickets() {
      setIsLoading(true);
      setErrorMessage("");

      const supabase = getSupabaseClient();

      if (!supabase) {
        setTickets([]);
        setErrorMessage("Supabase environment variables are not configured.");
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("tickets")
        .select(
          "id, requester_name, department, machine_reference, job_number, request_summary, request_details, status, assigned_to, notes",
        )
        .order("updated_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (error) {
        setTickets([]);
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      const nextTickets = (data ?? []) as Ticket[];
      setTickets(nextTickets);
      setDrafts(
        Object.fromEntries(
          nextTickets.map((ticket) => [
            ticket.id,
            {
              assigned_to: ticket.assigned_to ?? "",
              notes: ticket.notes ?? "",
            },
          ]),
        ),
      );
      setIsLoading(false);
    }

    loadTickets();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredTickets = useMemo(() => {
    if (statusFilter === "ALL") {
      return tickets;
    }

    return tickets.filter((ticket) => ticket.status === statusFilter);
  }, [statusFilter, tickets]);

  async function handleStatusChange(ticketId: string, nextStatus: TicketStatus) {
    const currentTicket = tickets.find((ticket) => ticket.id === ticketId);

    if (!currentTicket || currentTicket.status === nextStatus) {
      return;
    }

    setUpdatingTicketId(ticketId);
    setErrorMessage("");

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setUpdatingTicketId(null);
      return;
    }

    const { error: updateError } = await supabase
      .from("tickets")
      .update({ status: nextStatus })
      .eq("id", ticketId);

    if (updateError) {
      setErrorMessage(updateError.message);
      setUpdatingTicketId(null);
      return;
    }

    const { error: insertError } = await supabase
      .from("ticket_updates")
      .insert({ ticket_id: ticketId, status: nextStatus });

    if (insertError) {
      setErrorMessage(insertError.message);
      setUpdatingTicketId(null);
      return;
    }

    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === ticketId ? { ...ticket, status: nextStatus } : ticket,
      ),
    );
    setUpdatingTicketId(null);
  }

  async function handleTicketSave(ticketId: string) {
    const supabase = getSupabaseClient();
    const draft = drafts[ticketId];

    if (!supabase || !draft) {
      setErrorMessage("Supabase environment variables are not configured.");
      return;
    }

    setUpdatingTicketId(ticketId);
    setErrorMessage("");

    const { error: updateError } = await supabase
      .from("tickets")
      .update({
        assigned_to: draft.assigned_to || null,
        notes: draft.notes || null,
      })
      .eq("id", ticketId);

    if (updateError) {
      setErrorMessage(updateError.message);
      setUpdatingTicketId(null);
      return;
    }

    if (draft.notes.trim()) {
      const { error: insertError } = await supabase.from("ticket_updates").insert({
        ticket_id: ticketId,
        comment: draft.notes.trim(),
      });

      if (insertError) {
        setErrorMessage(insertError.message);
        setUpdatingTicketId(null);
        return;
      }
    }

    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              assigned_to: draft.assigned_to || null,
              notes: draft.notes || null,
            }
          : ticket,
      ),
    );
    setUpdatingTicketId(null);
  }

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900 sm:py-12">
      <div className="mx-auto max-w-7xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 text-sm font-medium text-slate-600">
          <div className="flex flex-wrap gap-3">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">
              Home
            </Link>
            <Link
              href="/submit"
              className="rounded-full px-4 py-2 hover:bg-white"
            >
              Submit Ticket
            </Link>
            <Link
              href="/requests"
              className="rounded-full px-4 py-2 hover:bg-white"
            >
              My Requests
            </Link>
            <Link
              href="/login"
              className="rounded-full px-4 py-2 hover:bg-white"
            >
              Login
            </Link>
          </div>
          <LogoutButton />
        </nav>

        <AuthGuard>
          <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.25)] sm:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-5">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                RELAY
              </p>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                Internal Parts Dashboard
              </h1>
              <p className="text-base leading-8 text-slate-600">
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
                <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-500">
                  {status}
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {tickets.filter((ticket) => ticket.status === status).length}
                </p>
              </div>
            ))}
          </div>

          {errorMessage ? (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200">
            <div className="hidden overflow-x-auto xl:block">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-6 py-4">Ticket</th>
                    <th className="px-6 py-4">Requester</th>
                    <th className="px-6 py-4">Machine Reference</th>
                    <th className="px-6 py-4">Request Summary</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Assigned To</th>
                    <th className="px-6 py-4">Notes</th>
                    <th className="px-6 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {isLoading ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-6 py-10 text-center text-sm text-slate-500"
                      >
                        Loading tickets...
                      </td>
                    </tr>
                  ) : filteredTickets.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-6 py-10 text-center text-sm text-slate-500"
                      >
                        No tickets match the current status filter.
                      </td>
                    </tr>
                  ) : (
                    filteredTickets.map((ticket) => (
                      <tr key={ticket.id} className="align-top">
                        <td className="px-6 py-5 text-sm font-semibold text-slate-900">
                          <Link
                            href={`/tickets/${ticket.id}`}
                            className="transition hover:text-slate-600"
                          >
                            {ticket.id}
                          </Link>
                        </td>
                        <td className="px-6 py-5 text-sm text-slate-600">
                          <div className="space-y-1">
                            <p>{ticket.requester_name ?? "-"}</p>
                            <p className="text-xs text-slate-500">
                              {ticket.department ?? "-"}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-sm text-slate-600">
                          <div className="space-y-1">
                            <p>{ticket.machine_reference ?? "-"}</p>
                            <p className="text-xs text-slate-500">
                              Job {ticket.job_number ?? "-"}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-sm leading-7 text-slate-600">
                          {ticket.request_summary ?? ticket.request_details ?? "-"}
                        </td>
                        <td className="px-6 py-5">
                          <StatusBadge status={ticket.status ?? "PENDING"} />
                        </td>
                        <td className="px-6 py-5">
                          <input
                            type="text"
                            value={drafts[ticket.id]?.assigned_to ?? ""}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [ticket.id]: {
                                  assigned_to: event.target.value,
                                  notes: current[ticket.id]?.notes ?? "",
                                },
                              }))
                            }
                            className="w-40 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                          />
                        </td>
                        <td className="px-6 py-5">
                          <textarea
                            rows={3}
                            value={drafts[ticket.id]?.notes ?? ""}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [ticket.id]: {
                                  assigned_to: current[ticket.id]?.assigned_to ?? "",
                                  notes: event.target.value,
                                },
                              }))
                            }
                            className="w-56 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                          />
                        </td>
                        <td className="px-6 py-5">
                          <div className="space-y-3">
                          <StatusSelect
                            ticketId={ticket.id}
                            value={ticket.status ?? "PENDING"}
                            onChange={handleStatusChange}
                            disabled={updatingTicketId === ticket.id}
                          />
                            <button
                              type="button"
                              onClick={() => handleTicketSave(ticket.id)}
                              disabled={updatingTicketId === ticket.id}
                              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Save
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 bg-slate-50 p-4 xl:hidden">
              {isLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
                  Loading tickets...
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                  No tickets match the current status filter.
                </div>
              ) : (
                filteredTickets.map((ticket) => (
                  <article
                    key={ticket.id}
                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          <Link
                            href={`/tickets/${ticket.id}`}
                            className="transition hover:text-slate-600"
                          >
                            {ticket.id}
                          </Link>
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {ticket.requester_name ?? "-"}
                        </p>
                      </div>
                      <StatusBadge status={ticket.status ?? "PENDING"} />
                    </div>

                    <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Machine Reference
                        </dt>
                        <dd className="mt-1 text-sm text-slate-700">
                          {ticket.machine_reference ?? "-"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Assigned To
                        </dt>
                        <dd className="mt-2">
                          <input
                            type="text"
                            value={drafts[ticket.id]?.assigned_to ?? ""}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [ticket.id]: {
                                  assigned_to: event.target.value,
                                  notes: current[ticket.id]?.notes ?? "",
                                },
                              }))
                            }
                            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                          />
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Request Summary
                      </p>
                      <p className="mt-1 text-sm leading-7 text-slate-600">
                        {ticket.request_summary ?? ticket.request_details ?? "-"}
                      </p>
                    </div>

                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Notes
                      </p>
                      <textarea
                        rows={4}
                        value={drafts[ticket.id]?.notes ?? ""}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [ticket.id]: {
                              assigned_to: current[ticket.id]?.assigned_to ?? "",
                              notes: event.target.value,
                            },
                          }))
                        }
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                      />
                    </div>

                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Update Status
                      </p>
                      <div className="mt-2 space-y-3">
                        <StatusSelect
                          ticketId={ticket.id}
                          value={ticket.status ?? "PENDING"}
                          onChange={handleStatusChange}
                          disabled={updatingTicketId === ticket.id}
                        />
                        <button
                          type="button"
                          onClick={() => handleTicketSave(ticket.id)}
                          disabled={updatingTicketId === ticket.id}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Save Ticket
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
          </section>
        </AuthGuard>
      </div>
    </main>
  );
}

function StatusSelect({
  ticketId,
  value,
  onChange,
  disabled = false,
}: {
  ticketId: string;
  value: TicketStatus;
  onChange: (ticketId: string, nextStatus: TicketStatus) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) =>
        onChange(ticketId, event.target.value as TicketStatus)
      }
      className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {statuses.slice(1).map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  );
}
