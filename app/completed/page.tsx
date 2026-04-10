"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { PartsControlTabs } from "@/components/parts-control-tabs";
import { RelayLogo } from "@/components/relay-logo";
import { RoleAwareRequestsLink } from "@/components/role-aware-requests-link";
import { StatusBadge } from "@/components/status-badge";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { sanitizeUserFacingError } from "@/lib/security";
import { getSupabaseClient } from "@/lib/supabase";

type CompletedTicket = {
  id: string;
  requester_name: string | null;
  machine_reference: string | null;
  job_number: string | null;
  request_summary: string | null;
  request_details: string | null;
  assigned_to: string | null;
  updated_at: string | null;
};

export default function CompletedPage() {
  const router = useRouter();
  const { adminBadgeCount } = useNotifications();
  const [tickets, setTickets] = useState<CompletedTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const loadTickets = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      return;
    }

    const { user, isAdmin } = await getCurrentUserWithRole(supabase);

    if (!user) {
      router.replace("/login?next=/completed");
      return;
    }

    if (!isAdmin) {
      router.replace("/");
      return;
    }

    const { data, error } = await supabase
      .from("tickets")
      .select(
        "id, requester_name, machine_reference, job_number, request_summary, request_details, assigned_to, updated_at",
      )
      .eq("status", "COMPLETED")
      .order("updated_at", { ascending: false });

    if (error) {
      setErrorMessage(
        sanitizeUserFacingError(error, "Unable to load completed jobs."),
      );
      setTickets([]);
      setIsLoading(false);
      return;
    }

    setTickets((data ?? []) as CompletedTicket[]);
    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTickets();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadTickets]);

  async function handleDeleteTicket(ticket: CompletedTicket) {
    const confirmed = window.confirm(
      `Permanently delete completed job ${ticket.job_number ?? ticket.id}? This cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setNotice({
        type: "error",
        message: "Supabase environment variables are not configured.",
      });
      return;
    }

    setDeletingTicketId(ticket.id);
    setNotice(null);
    setErrorMessage("");

    const { error } = await supabase.from("tickets").delete().eq("id", ticket.id);

    if (error) {
      setNotice({
        type: "error",
        message: sanitizeUserFacingError(error, "Unable to delete this completed job."),
      });
      setDeletingTicketId(null);
      return;
    }

    setTickets((current) =>
      current.filter((currentTicket) => currentTicket.id !== ticket.id),
    );
    setNotice({
      type: "success",
      message: `Completed job ${ticket.job_number ?? ticket.id} deleted.`,
    });
    setDeletingTicketId(null);
  }

  async function handleReopenTicket(ticket: CompletedTicket) {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setNotice({
        type: "error",
        message: "Supabase environment variables are not configured.",
      });
      return;
    }

    setDeletingTicketId(ticket.id);
    setNotice(null);
    setErrorMessage("");

    const { error: updateError } = await supabase
      .from("tickets")
      .update({
        status: "PENDING",
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticket.id);

    if (updateError) {
      setNotice({
        type: "error",
        message: sanitizeUserFacingError(updateError, "Unable to reopen this completed job."),
      });
      setDeletingTicketId(null);
      return;
    }

    const { error: historyError } = await supabase.from("ticket_updates").insert({
      ticket_id: ticket.id,
      status: "PENDING",
      comment: "Ticket reopened from completed archive.",
    });

    if (historyError) {
      setNotice({
        type: "error",
        message: sanitizeUserFacingError(historyError, "Unable to record the reopen event."),
      });
      setDeletingTicketId(null);
      return;
    }

    setTickets((current) =>
      current.filter((currentTicket) => currentTicket.id !== ticket.id),
    );
    setNotice({
      type: "success",
      message: `Completed job ${ticket.job_number ?? ticket.id} reopened to PENDING.`,
    });
    setDeletingTicketId(null);
  }

  function handleExportTickets() {
    if (tickets.length === 0) {
      setNotice({
        type: "error",
        message: "There are no completed jobs to export.",
      });
      return;
    }

    const csvRows = [
      [
        "completed_at",
        "job_number",
        "submitter",
        "machine_reference",
        "request_summary",
        "handled_by",
      ],
      ...tickets.map((ticket) => [
        ticket.updated_at ?? "",
        ticket.job_number ?? "",
        ticket.requester_name ?? "",
        ticket.machine_reference ?? "",
        ticket.request_summary ?? ticket.request_details ?? "",
        ticket.assigned_to ?? "",
      ]),
    ];

    const csvContent = csvRows
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll("\"", "\"\"")}"`)
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `relay-completed-jobs-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(downloadUrl);

    setNotice({
      type: "success",
      message: `Exported ${tickets.length} completed job${tickets.length === 1 ? "" : "s"}.`,
    });
  }

  return (
    <main className="aurora-shell">
      <div className="aurora-shell-inner max-w-7xl space-y-8">
        <nav className="aurora-nav">
          <RelayLogo />
          <div className="aurora-nav-links text-sm font-medium">
            <Link href="/" className="aurora-link">
              Home
            </Link>
            <Link href="/legal" className="aurora-link">
              Legal
            </Link>
            <Link href="/submit" className="aurora-link">
              Submit Ticket
            </Link>
            <RoleAwareRequestsLink className="aurora-link" />
            <Link href="/incidents" className="aurora-link">
              Workshop Control
            </Link>
            <Link href="/control" className="aurora-link">
              Admin Control
            </Link>
            <Link href="/admin" className="aurora-link">
              Parts Control
              <NotificationBadge count={adminBadgeCount} />
            </Link>
            <ThemeToggleButton />
            <LogoutButton />
          </div>
        </nav>

        <AuthGuard requiredRole="admin">
          <section className="aurora-section sm:p-10">
            <div className="space-y-5">
              <div className="aurora-kicker">
                Archive
              </div>
              <h1 className="aurora-title text-4xl sm:text-5xl">
                Completed Jobs
              </h1>
              <p className="max-w-3xl aurora-copy">
                Completed requests are archived here, newest first, so active workload views stay focused on live jobs.
              </p>
            </div>

            <div className="mt-8">
              <PartsControlTabs activeTab="completed" />
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={handleExportTickets}
                disabled={isLoading || tickets.length === 0}
                className="aurora-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => void loadTickets()}
                disabled={isLoading}
                className="aurora-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {notice ? (
              <div
                className={`mt-6 rounded-2xl px-4 py-3 text-sm ${
                  notice.type === "success"
                    ? "aurora-alert aurora-alert-success"
                    : "aurora-alert aurora-alert-error"
                }`}
              >
                {notice.message}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="aurora-alert aurora-alert-error mt-6">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.4)]">
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <th className="px-6 py-4">Completed</th>
                      <th className="px-6 py-4">Job Number</th>
                      <th className="px-6 py-4">Submitter</th>
                      <th className="px-6 py-4">Request</th>
                      <th className="px-6 py-4">Handled By</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {isLoading ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-500">
                          Loading completed jobs...
                        </td>
                      </tr>
                    ) : tickets.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-500">
                          No completed jobs found.
                        </td>
                      </tr>
                    ) : (
                      tickets.map((ticket) => (
                        <tr key={ticket.id} className="align-top">
                          <td className="px-6 py-5 text-sm text-slate-500">
                            {formatDate(ticket.updated_at)}
                          </td>
                          <td className="px-6 py-5 text-sm font-semibold text-slate-900">
                            <Link href={`/tickets/${ticket.id}`} className="transition hover:text-slate-600">
                              {ticket.job_number ?? "-"}
                            </Link>
                          </td>
                          <td className="px-6 py-5 text-sm text-slate-600">
                            <div className="space-y-1">
                              <p>{ticket.requester_name ?? "-"}</p>
                              <p className="text-xs text-slate-500">{ticket.machine_reference ?? "-"}</p>
                            </div>
                          </td>
                          <td className="px-6 py-5 text-sm leading-7 text-slate-600">
                            {ticket.request_summary ?? ticket.request_details ?? "-"}
                          </td>
                          <td className="px-6 py-5 text-sm text-slate-600">
                            {ticket.assigned_to ?? "-"}
                          </td>
                          <td className="px-6 py-5">
                            <StatusBadge status="COMPLETED" />
                          </td>
                          <td className="px-6 py-5 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => void handleReopenTicket(ticket)}
                                disabled={deletingTicketId === ticket.id}
                                className="inline-flex h-10 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {deletingTicketId === ticket.id ? "Working..." : "Re-open"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteTicket(ticket)}
                                disabled={deletingTicketId === ticket.id}
                                className="inline-flex h-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {deletingTicketId === ticket.id ? "Working..." : "Delete"}
                              </button>
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
                    Loading completed jobs...
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                    No completed jobs found.
                  </div>
                ) : (
                  tickets.map((ticket) => (
                    <article key={ticket.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            <Link href={`/tickets/${ticket.id}`} className="transition hover:text-slate-600">
                              Job {ticket.job_number ?? "-"}
                            </Link>
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {ticket.requester_name ?? "-"}
                          </p>
                        </div>
                        <StatusBadge status="COMPLETED" />
                      </div>
                      <p className="mt-4 text-sm leading-7 text-slate-600">
                        {ticket.request_summary ?? ticket.request_details ?? "-"}
                      </p>
                      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Completed {formatDate(ticket.updated_at)}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleReopenTicket(ticket)}
                          disabled={deletingTicketId === ticket.id}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingTicketId === ticket.id ? "Working..." : "Re-open"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteTicket(ticket)}
                          disabled={deletingTicketId === ticket.id}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingTicketId === ticket.id ? "Working..." : "Delete"}
                        </button>
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
