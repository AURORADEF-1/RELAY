"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { StatusBadge } from "@/components/status-badge";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import {
  ticketStatusOptions,
  ticketStatuses,
  type TicketStatus,
  type TicketStatusFilter,
} from "@/lib/statuses";
import { getSupabaseClient } from "@/lib/supabase";

type ControlTicket = {
  id: string;
  requester_name: string | null;
  machine_reference: string | null;
  job_number: string | null;
  request_summary: string | null;
  request_details: string | null;
  status: TicketStatus | null;
  assigned_to: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type TicketDraft = {
  status: TicketStatus;
  assigned_to: string;
  notes: string;
};

export default function ControlPage() {
  const router = useRouter();
  const { requesterUnreadCount, adminBadgeCount } = useNotifications();
  const [tickets, setTickets] = useState<ControlTicket[]>([]);
  const [drafts, setDrafts] = useState<Record<string, TicketDraft>>({});
  const [statusFilter, setStatusFilter] = useState<TicketStatusFilter>("ALL");
  const [requesterFilter, setRequesterFilter] = useState("");
  const [machineFilter, setMachineFilter] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [savingTicketId, setSavingTicketId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadTickets() {
      setIsLoading(true);
      setErrorMessage("");

      const supabase = getSupabaseClient();

      if (!supabase) {
        if (isMounted) {
          setErrorMessage("Supabase environment variables are not configured.");
          setIsLoading(false);
        }
        return;
      }

      const { user, role } = await getCurrentUserWithRole(supabase);

      if (!isMounted) {
        return;
      }

      if (!user) {
        router.replace("/login?next=/control");
        return;
      }

      if (role !== "admin") {
        router.replace("/");
        return;
      }

      const { data, error } = await supabase
        .from("tickets")
        .select(
          "id, requester_name, machine_reference, job_number, request_summary, request_details, status, assigned_to, notes, created_at, updated_at",
        )
        .order("updated_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        setTickets([]);
        setIsLoading(false);
        return;
      }

      const nextTickets = (data ?? []) as ControlTicket[];
      setTickets(nextTickets);
      setDrafts(
        Object.fromEntries(
          nextTickets.map((ticket) => [
            ticket.id,
            {
              status: ticket.status ?? "PENDING",
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
  }, [router]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (statusFilter !== "ALL" && ticket.status !== statusFilter) {
        return false;
      }

      if (
        requesterFilter &&
        !(ticket.requester_name ?? "")
          .toLowerCase()
          .includes(requesterFilter.toLowerCase())
      ) {
        return false;
      }

      if (
        machineFilter &&
        !(ticket.machine_reference ?? "")
          .toLowerCase()
          .includes(machineFilter.toLowerCase())
      ) {
        return false;
      }

      if (
        jobFilter &&
        !(ticket.job_number ?? "").toLowerCase().includes(jobFilter.toLowerCase())
      ) {
        return false;
      }

      if (
        userFilter &&
        !(ticket.assigned_to ?? "").toLowerCase().includes(userFilter.toLowerCase())
      ) {
        return false;
      }

      return true;
    });
  }, [tickets, statusFilter, requesterFilter, machineFilter, jobFilter, userFilter]);

  async function handleSave(ticket: ControlTicket) {
    const draft = drafts[ticket.id];
    const supabase = getSupabaseClient();

    if (!draft || !supabase) {
      setNotice({
        type: "error",
        message: "Supabase environment variables are not configured.",
      });
      return;
    }

    setSavingTicketId(ticket.id);
    setErrorMessage("");
    setNotice(null);

    const ticketPatch = {
      status: draft.status,
      assigned_to: draft.assigned_to.trim() || null,
      notes: draft.notes.trim() || null,
    };

    const { error: updateError } = await supabase
      .from("tickets")
      .update(ticketPatch)
      .eq("id", ticket.id);

    if (updateError) {
      setSavingTicketId(null);
      setNotice({ type: "error", message: updateError.message });
      return;
    }

    if (draft.status !== (ticket.status ?? "PENDING")) {
      const { error: statusError } = await supabase.from("ticket_updates").insert({
        ticket_id: ticket.id,
        status: draft.status,
      });

      if (statusError) {
        setSavingTicketId(null);
        setNotice({ type: "error", message: statusError.message });
        return;
      }
    }

    if (draft.notes.trim() && draft.notes.trim() !== (ticket.notes ?? "").trim()) {
      const { error: noteError } = await supabase.from("ticket_updates").insert({
        ticket_id: ticket.id,
        comment: draft.notes.trim(),
      });

      if (noteError) {
        setSavingTicketId(null);
        setNotice({ type: "error", message: noteError.message });
        return;
      }
    }

    setTickets((current) =>
      current.map((currentTicket) =>
        currentTicket.id === ticket.id
          ? {
              ...currentTicket,
              ...ticketPatch,
              updated_at: new Date().toISOString(),
            }
          : currentTicket,
      ),
    );

    setNotice({
      type: "success",
      message: `Workshop control updated job ${ticket.job_number ?? ticket.id}.`,
    });
    setSavingTicketId(null);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-[92rem] space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">
              Home
            </Link>
            <Link href="/submit" className="rounded-full px-4 py-2 hover:bg-white">
              Submit Ticket
            </Link>
            <Link href="/requests" className="rounded-full px-4 py-2 hover:bg-white">
              My Requests
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
            <Link href="/admin" className="rounded-full px-4 py-2 hover:bg-white">
              Admin
              <NotificationBadge count={adminBadgeCount} />
            </Link>
            <Link
              href="/control"
              className="rounded-full bg-slate-950 px-4 py-2 text-white hover:bg-slate-800"
            >
              Workshop Control
            </Link>
            <LogoutButton />
          </div>
        </nav>

        <AuthGuard requiredRole="admin">
          <section className="rounded-[2rem] border border-white/80 bg-white/90 p-8 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur sm:p-10">
            <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl space-y-5">
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                  Workshop Control
                </div>
                <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                  Request Control Board
                </h1>
                <p className="text-base leading-8 text-slate-600">
                  Date-ordered workshop view of every request with direct status,
                  user assignment, and comments control.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <FilterInput
                  label="Submitter"
                  value={requesterFilter}
                  onChange={setRequesterFilter}
                  placeholder="Requester name"
                />
                <FilterInput
                  label="Machine"
                  value={machineFilter}
                  onChange={setMachineFilter}
                  placeholder="Machine ref"
                />
                <FilterInput
                  label="Job"
                  value={jobFilter}
                  onChange={setJobFilter}
                  placeholder="Job number"
                />
                <FilterInput
                  label="User"
                  value={userFilter}
                  onChange={setUserFilter}
                  placeholder="Assigned user"
                />
                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Status
                  </span>
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as TicketStatusFilter)
                    }
                    className="h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400"
                  >
                    {ticketStatusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3 xl:grid-cols-7">
              {ticketStatuses.map((status) => (
                <div
                  key={status}
                  className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] px-4 py-3"
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

            {notice ? (
              <div
                className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${
                  notice.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {notice.message}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.4)]">
              <div className="max-h-[70vh] overflow-auto">
                <table className="min-w-[1100px] divide-y divide-slate-200">
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <th className="px-4 py-4">Updated</th>
                      <th className="px-4 py-4">Submitter</th>
                      <th className="px-4 py-4">Job Number</th>
                      <th className="px-4 py-4">Machine Ref</th>
                      <th className="px-4 py-4">Part Requested</th>
                      <th className="px-4 py-4">User</th>
                      <th className="px-4 py-4">Status</th>
                      <th className="px-4 py-4">Comments</th>
                      <th className="px-4 py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {isLoading ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                          Loading workshop control board...
                        </td>
                      </tr>
                    ) : filteredTickets.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                          No requests match the current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredTickets.map((ticket) => {
                        const draft = drafts[ticket.id] ?? {
                          status: ticket.status ?? "PENDING",
                          assigned_to: ticket.assigned_to ?? "",
                          notes: ticket.notes ?? "",
                        };

                        return (
                          <tr key={ticket.id} className="align-top">
                            <td className="px-4 py-4 text-sm text-slate-500">
                              {formatDate(ticket.updated_at ?? ticket.created_at)}
                            </td>
                            <td className="px-4 py-4 text-sm font-medium text-slate-900">
                              {ticket.requester_name ?? "-"}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-700">
                              <Link
                                href={`/tickets/${ticket.id}`}
                                className="font-semibold transition hover:text-slate-500"
                              >
                                {ticket.job_number ?? "-"}
                              </Link>
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-600">
                              {ticket.machine_reference ?? "-"}
                            </td>
                            <td className="px-4 py-4 text-sm leading-7 text-slate-600">
                              {ticket.request_summary ?? ticket.request_details ?? "-"}
                            </td>
                            <td className="px-4 py-4">
                              <input
                                value={draft.assigned_to}
                                onChange={(event) =>
                                  setDrafts((current) => ({
                                    ...current,
                                    [ticket.id]: {
                                      ...draft,
                                      assigned_to: event.target.value,
                                    },
                                  }))
                                }
                                placeholder="Assign user"
                                className="h-10 w-36 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                              />
                            </td>
                            <td className="px-4 py-4">
                              <div className="space-y-3">
                                <StatusBadge status={draft.status} />
                                <select
                                  value={draft.status}
                                  onChange={(event) =>
                                    setDrafts((current) => ({
                                      ...current,
                                      [ticket.id]: {
                                        ...draft,
                                        status: event.target.value as TicketStatus,
                                      },
                                    }))
                                  }
                                  className="h-10 w-40 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400"
                                >
                                  {ticketStatuses.map((status) => (
                                    <option key={status} value={status}>
                                      {status}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <textarea
                                value={draft.notes}
                                onChange={(event) =>
                                  setDrafts((current) => ({
                                    ...current,
                                    [ticket.id]: {
                                      ...draft,
                                      notes: event.target.value,
                                    },
                                  }))
                                }
                                placeholder="Add comments"
                                rows={3}
                                className="w-60 rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                              />
                            </td>
                            <td className="px-4 py-4">
                              <button
                                type="button"
                                onClick={() => handleSave(ticket)}
                                disabled={savingTicketId === ticket.id}
                                className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {savingTicketId === ticket.id ? "Saving..." : "Save"}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </AuthGuard>
      </div>
    </main>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-slate-400"
      />
    </label>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "No date";
  }

  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
