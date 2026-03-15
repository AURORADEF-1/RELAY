"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { StatusBadge } from "@/components/status-badge";
import { getCurrentUserWithRole } from "@/lib/profile-access";
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
  const { requesterUnreadCount, adminBadgeCount } = useNotifications();
  const [tickets, setTickets] = useState<CompletedTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

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
        router.replace("/login?next=/completed");
        return;
      }

      if (role !== "admin") {
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

      if (!isMounted) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        setTickets([]);
        setIsLoading(false);
        return;
      }

      setTickets((data ?? []) as CompletedTicket[]);
      setIsLoading(false);
    }

    loadTickets();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">
              Home
            </Link>
            <Link href="/legal" className="rounded-full px-4 py-2 hover:bg-white">
              Legal
            </Link>
            <Link href="/submit" className="rounded-full px-4 py-2 hover:bg-white">
              Submit Ticket
            </Link>
            <Link href="/requests" className="rounded-full px-4 py-2 hover:bg-white">
              My Requests
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
            <Link href="/control" className="rounded-full px-4 py-2 hover:bg-white">
              Workshop Control
            </Link>
            <Link href="/admin" className="rounded-full px-4 py-2 hover:bg-white">
              Admin
              <NotificationBadge count={adminBadgeCount} />
            </Link>
            <Link
              href="/completed"
              className="rounded-full bg-slate-950 px-4 py-2 text-white hover:bg-slate-800"
            >
              Completed Jobs
            </Link>
            <LogoutButton />
          </div>
        </nav>

        <AuthGuard requiredRole="admin">
          <section className="rounded-[2rem] border border-white/80 bg-white/90 p-8 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur sm:p-10">
            <div className="space-y-5">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                Archive
              </div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                Completed Jobs
              </h1>
              <p className="max-w-3xl text-base leading-8 text-slate-600">
                Completed requests are archived here, newest first, so active workload views stay focused on live jobs.
              </p>
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
                      <th className="px-6 py-4">Completed</th>
                      <th className="px-6 py-4">Job Number</th>
                      <th className="px-6 py-4">Submitter</th>
                      <th className="px-6 py-4">Request</th>
                      <th className="px-6 py-4">Handled By</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {isLoading ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-500">
                          Loading completed jobs...
                        </td>
                      </tr>
                    ) : tickets.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-500">
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
