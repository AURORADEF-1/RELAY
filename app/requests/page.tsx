"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { StatusBadge } from "@/components/status-badge";
import { notifyAdminsOfPartCollected } from "@/lib/notifications";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { activeTicketStatuses } from "@/lib/statuses";
import { getSupabaseClient } from "@/lib/supabase";

type Ticket = {
  id: string;
  user_id?: string | null;
  requester_name?: string | null;
  machine_reference: string | null;
  job_number: string | null;
  request_summary: string | null;
  request_details: string | null;
  status: string | null;
  updated_at: string | null;
  assigned_to?: string | null;
};

export default function RequestsPage() {
  const { requesterUnreadCount, adminBadgeCount, isAdmin, taskUnreadCount } = useNotifications();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [collectedTicketIds, setCollectedTicketIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [workingCollectedTicketId, setWorkingCollectedTicketId] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    const supabase = getSupabaseClient();

    if (!supabase) {
      setTickets([]);
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      return;
    }

    const { user, profile, accessLevel, isAdmin } = await getCurrentUserWithRole(
      supabase,
    );

    if (!user) {
      setTickets([]);
      setErrorMessage("Sign in to view your requests.");
      setIsLoading(false);
      return;
    }

    let query = supabase
      .from("tickets")
      .select(
        "id, user_id, requester_name, machine_reference, job_number, request_summary, request_details, status, updated_at, assigned_to",
      )
      .neq("status", "COMPLETED")
      .order("updated_at", { ascending: false });

    if (!isAdmin) {
      query = query.eq("user_id", user.id);
    }

    console.log("RELAY request query debug", {
      email: user?.email,
      profileRole: profile?.role,
      profileUsername: profile?.username,
      access: accessLevel,
      mode: isAdmin ? "admin-all-requests" : "user-own-requests",
    });

    const { data, error } = await query;

    if (error) {
      setTickets([]);
      setErrorMessage(error.message);
      setIsLoading(false);
      return;
    }

    console.log("RELAY request query debug result", {
      email: user?.email,
      access: accessLevel,
      rowCount: data?.length ?? 0,
    });

    const nextTickets = (data ?? []) as Ticket[];
    setTickets(nextTickets);

    if (nextTickets.length > 0) {
      const { data: updates } = await supabase
        .from("ticket_updates")
        .select("ticket_id, comment")
        .in(
          "ticket_id",
          nextTickets.map((ticket) => ticket.id),
        )
        .eq("comment", "Part collected by requester.");

      setCollectedTicketIds(
        new Set(
          (updates ?? [])
            .map((update) => update.ticket_id)
            .filter((ticketId): ticketId is string => typeof ticketId === "string"),
        ),
      );
    } else {
      setCollectedTicketIds(new Set());
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTickets();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadTickets]);

  async function handleMarkCollected(ticket: Ticket) {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      return;
    }

    setWorkingCollectedTicketId(ticket.id);
    setErrorMessage("");

    try {
      const { error: insertError } = await supabase.from("ticket_updates").insert({
        ticket_id: ticket.id,
        comment: "Part collected by requester.",
      });

      if (insertError) {
        throw new Error(insertError.message);
      }

      await notifyAdminsOfPartCollected(supabase, {
        ticketId: ticket.id,
        requesterName: ticket.requester_name ?? null,
        jobNumber: ticket.job_number ?? null,
        requestSummary: ticket.request_summary ?? ticket.request_details,
      });

      setCollectedTicketIds((current) => new Set(current).add(ticket.id));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to mark the request as collected.",
      );
    } finally {
      setWorkingCollectedTicketId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">
              Home
            </Link>
            <Link href="/legal" className="rounded-full px-4 py-2 hover:bg-white">
              Legal
            </Link>
            <Link href="/settings" className="rounded-full px-4 py-2 hover:bg-white">
              Settings
            </Link>
            <Link
              href="/submit"
              className="rounded-full px-4 py-2 hover:bg-white"
            >
              Submit Ticket
            </Link>
            <Link href="/tasks" className="rounded-full px-4 py-2 hover:bg-white">
              Tasks
              <NotificationBadge count={taskUnreadCount} />
            </Link>
            {isAdmin ? (
              <>
                <Link
                  href="/incidents"
                  className="rounded-full px-4 py-2 hover:bg-white"
                >
                  Workshop Control
                </Link>
                <Link href="/admin" className="rounded-full px-4 py-2 hover:bg-white">
                  Parts Control
                  <NotificationBadge count={adminBadgeCount} />
                </Link>
              </>
            ) : null}
            <LogoutButton />
          </div>
        </nav>

        <AuthGuard>
          <section className="rounded-[2rem] border border-white/80 bg-white/90 p-8 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur sm:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-5">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                Requester Dashboard
              </div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                My Requests
                <NotificationBadge count={requesterUnreadCount} />
              </h1>
              <p className="text-base leading-8 text-slate-600">
                Track active parts requests. Completed jobs are archived and remain
                visible to admin only.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
              {activeTicketStatuses.map((status) => (
                <div
                  key={status}
                  className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] px-4 py-3 text-center"
                >
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-500">
                    {status}
                  </p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">
                    {tickets.filter((ticket) => ticket.status === status).length}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => void loadTickets()}
              disabled={isLoading}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {errorMessage ? (
            <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.4)]">
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-6 py-4">Job Number</th>
                    <th className="px-6 py-4">Parts Requested</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Updated</th>
                    <th className="px-6 py-4">Handled By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {isLoading ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-10 text-center text-sm text-slate-500"
                      >
                        Loading requests...
                      </td>
                    </tr>
                  ) : tickets.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-10 text-center text-sm text-slate-500"
                      >
                        No requests found.
                      </td>
                    </tr>
                  ) : (
                    tickets.map((ticket) => (
                      <tr key={ticket.id} className="align-top">
                        <td className="px-6 py-5 text-sm text-slate-600">
                          <div className="space-y-1">
                            <Link
                              href={`/tickets/${ticket.id}`}
                              className="text-base font-semibold text-slate-900 transition hover:text-slate-600"
                            >
                              {ticket.job_number ?? "No job number"}
                            </Link>
                            <p className="text-xs text-slate-500">
                              Machine {ticket.machine_reference ?? "-"}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-sm text-slate-600">
                          <div className="space-y-2">
                          <Link
                            href={`/tickets/${ticket.id}`}
                            className="font-semibold text-slate-900 transition hover:text-slate-600"
                          >
                            {ticket.request_summary ?? ticket.request_details ?? "-"}
                          </Link>
                            <p className="text-xs uppercase tracking-wide text-slate-500">
                              Request record only
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <StatusBadge status={ticket.status ?? "PENDING"} />
                        </td>
                        <td className="px-6 py-5 text-sm text-slate-500">
                          {formatDate(ticket.updated_at)}
                        </td>
                        <td className="px-6 py-5 text-sm text-slate-500">
                          <div className="space-y-2">
                            <p>{ticket.assigned_to ?? "Stores queue"}</p>
                            {ticket.status === "READY" && !collectedTicketIds.has(ticket.id) ? (
                              <button
                                type="button"
                                onClick={() => void handleMarkCollected(ticket)}
                                disabled={workingCollectedTicketId === ticket.id}
                                className="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {workingCollectedTicketId === ticket.id ? "Saving..." : "Collected"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 bg-slate-50 p-4 lg:hidden">
              {isLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
                  Loading requests...
                </div>
              ) : tickets.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
                  No requests found.
                </div>
              ) : (
                tickets.map((ticket) => (
                  <article
                    key={ticket.id}
                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Job Number
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">
                          <Link
                            href={`/tickets/${ticket.id}`}
                            className="transition hover:text-slate-600"
                          >
                            {ticket.job_number ?? "No job number"}
                          </Link>
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Machine {ticket.machine_reference ?? "-"}
                        </p>
                      </div>
                      <StatusBadge status={ticket.status ?? "PENDING"} />
                    </div>
                    <p className="mt-4 text-sm leading-7 text-slate-600">
                      {ticket.request_summary ?? ticket.request_details ?? "-"}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                      <span>Updated {formatDate(ticket.updated_at)}</span>
                      <span>Handled by {ticket.assigned_to ?? "Stores queue"}</span>
                    </div>
                    {ticket.status === "READY" && !collectedTicketIds.has(ticket.id) ? (
                      <button
                        type="button"
                        onClick={() => void handleMarkCollected(ticket)}
                        disabled={workingCollectedTicketId === ticket.id}
                        className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {workingCollectedTicketId === ticket.id ? "Saving..." : "Collected"}
                      </button>
                    ) : collectedTicketIds.has(ticket.id) ? (
                      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                        Part collected
                      </p>
                    ) : null}
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

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
