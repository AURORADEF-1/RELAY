"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { StatusBadge } from "@/components/status-badge";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { activeTicketStatuses, type TicketStatus } from "@/lib/statuses";
import { getSupabaseClient } from "@/lib/supabase";

type WallboardTicket = {
  id: string;
  requester_name: string | null;
  department: string | null;
  machine_reference: string | null;
  job_number: string | null;
  request_summary: string | null;
  request_details: string | null;
  status: TicketStatus | null;
  assigned_to: string | null;
  updated_at: string | null;
  created_at: string | null;
};

const WALLBOARD_REFRESH_MS = 15000;

export default function WallboardPage() {
  const router = useRouter();
  const { requesterUnreadCount, adminBadgeCount } = useNotifications();
  const [tickets, setTickets] = useState<WallboardTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const loadTickets = useCallback(async () => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      return;
    }

    const { user, isAdmin } = await getCurrentUserWithRole(supabase);

    if (!user) {
      router.replace("/login?next=/wallboard");
      return;
    }

    if (!isAdmin) {
      router.replace("/");
      return;
    }

    const { data, error } = await supabase
      .from("tickets")
      .select(
        "id, requester_name, department, machine_reference, job_number, request_summary, request_details, status, assigned_to, updated_at, created_at",
      )
      .neq("status", "COMPLETED")
      .order("updated_at", { ascending: false });

    if (error) {
      setErrorMessage(error.message);
      setTickets([]);
      setIsLoading(false);
      return;
    }

    setErrorMessage("");
    setTickets((data ?? []) as WallboardTicket[]);
    setLastUpdatedAt(new Date().toISOString());
    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTickets();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadTickets]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadTickets();
    }, WALLBOARD_REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, [loadTickets]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const groupedTickets = useMemo(
    () =>
      Object.fromEntries(
        activeTicketStatuses.map((status) => [
          status,
          tickets.filter((ticket) => ticket.status === status),
        ]),
      ) as Record<(typeof activeTicketStatuses)[number], WallboardTicket[]>,
    [tickets],
  );

  const metrics = useMemo(() => {
    const activeCount = tickets.length;
    const unassignedCount = tickets.filter((ticket) => !ticket.assigned_to?.trim()).length;
    const readyCount = tickets.filter((ticket) => ticket.status === "READY").length;
    const pendingCount = tickets.filter((ticket) => ticket.status === "PENDING").length;
    const currentTime = now.getTime();
    const oldestOpenHours = tickets.reduce((maxHours, ticket) => {
      const createdAt = ticket.created_at ? new Date(ticket.created_at).getTime() : null;

      if (!createdAt) {
        return maxHours;
      }

      const hoursOpen = (currentTime - createdAt) / (1000 * 60 * 60);
      return Math.max(maxHours, hoursOpen);
    }, 0);

    return {
      activeCount,
      pendingCount,
      readyCount,
      unassignedCount,
      oldestOpenHours,
    };
  }, [now, tickets]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#0f172a_0%,#111827_45%,#020617_100%)] px-6 py-6 text-slate-100">
      <div className="mx-auto max-w-[120rem] space-y-6">
        <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/10 bg-white/5 px-5 py-4 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.8)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-300">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white/10">
              Home
            </Link>
            <Link href="/legal" className="rounded-full px-4 py-2 hover:bg-white/10">
              Legal
            </Link>
            <Link href="/requests" className="rounded-full px-4 py-2 hover:bg-white/10">
              My Requests
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
            <Link href="/incidents" className="rounded-full px-4 py-2 hover:bg-white/10">
              Workshop Incidents
            </Link>
            <Link href="/control" className="rounded-full px-4 py-2 hover:bg-white/10">
              Workshop Control
            </Link>
            <Link href="/admin" className="rounded-full px-4 py-2 hover:bg-white/10">
              Parts Control
              <NotificationBadge count={adminBadgeCount} />
            </Link>
            <Link
              href="/wallboard"
              className="rounded-full bg-white px-4 py-2 font-semibold text-slate-950"
            >
              Live Wallboard
            </Link>
            <LogoutButton />
          </div>
        </nav>

        <AuthGuard requiredRole="admin">
          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-[0_32px_90px_-48px_rgba(15,23,42,0.85)] backdrop-blur">
            <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-5">
                <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">
                  Live Operations Board
                </div>
                <div className="space-y-3">
                  <h1 className="text-5xl font-semibold tracking-[-0.05em] text-white sm:text-6xl">
                    Parts Control Wallboard
                  </h1>
                  <p className="max-w-3xl text-lg leading-8 text-slate-300">
                    Live operational view for active requests, queue pressure, and workflow movement.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <InfoCard label="Current Time" value={formatClock(now)} />
                <InfoCard label="Last Sync" value={lastUpdatedAt ? formatDateTime(lastUpdatedAt) : "Waiting..."} />
                <button
                  type="button"
                  onClick={() => void loadTickets()}
                  className="rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-left transition hover:bg-white/15"
                >
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                    Control
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    Refresh Now
                  </p>
                </button>
              </div>
            </div>

            {errorMessage ? (
              <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard label="Active Jobs" value={String(metrics.activeCount)} tone="slate" />
              <MetricCard label="Pending Queue" value={String(metrics.pendingCount)} tone="amber" />
              <MetricCard label="Ready To Issue" value={String(metrics.readyCount)} tone="emerald" />
              <MetricCard label="Unassigned" value={String(metrics.unassignedCount)} tone="rose" />
              <MetricCard label="Oldest Open" value={`${Math.round(metrics.oldestOpenHours)}h`} tone="blue" />
            </div>

            <div className="mt-8 grid gap-4 xl:grid-cols-7">
              {activeTicketStatuses.map((status) => (
                <section
                  key={status}
                  className="min-h-[24rem] rounded-[1.75rem] border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <StatusBadge status={status} />
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm font-semibold text-white">
                      {groupedTickets[status].length}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {isLoading ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-4 text-sm text-slate-400">
                        Loading lane...
                      </div>
                    ) : groupedTickets[status].length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-4 text-sm text-slate-400">
                        No live jobs in this lane.
                      </div>
                    ) : (
                      groupedTickets[status].map((ticket) => (
                        <Link
                          key={ticket.id}
                          href={`/tickets/${ticket.id}`}
                          className="block rounded-2xl border border-white/10 bg-black/15 p-4 transition hover:border-white/20 hover:bg-black/25"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-lg font-semibold text-white">
                                Job {ticket.job_number ?? ticket.id.slice(0, 8)}
                              </p>
                              <p className="mt-1 truncate text-sm text-slate-300">
                                {ticket.requester_name ?? "Unknown requester"}
                              </p>
                            </div>
                            <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                              {ticket.department ?? "-"}
                            </span>
                          </div>

                          <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-200">
                            {ticket.request_summary ?? ticket.request_details ?? "No request summary provided."}
                          </p>

                          <dl className="mt-4 grid gap-2 text-xs text-slate-400">
                            <div className="flex items-center justify-between gap-3">
                              <dt>Machine</dt>
                              <dd className="truncate text-right text-slate-200">
                                {ticket.machine_reference ?? "-"}
                              </dd>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <dt>Assigned</dt>
                              <dd className="truncate text-right text-slate-200">
                                {ticket.assigned_to ?? "Unassigned"}
                              </dd>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <dt>Updated</dt>
                              <dd className="truncate text-right text-slate-200">
                                {formatRelativeTime(ticket.updated_at ?? ticket.created_at)}
                              </dd>
                            </div>
                          </dl>
                        </Link>
                      ))
                    )}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </AuthGuard>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "slate" | "amber" | "emerald" | "rose" | "blue";
}) {
  const toneClasses: Record<string, string> = {
    slate: "border-white/10 bg-white/5",
    amber: "border-amber-400/20 bg-amber-500/10",
    emerald: "border-emerald-400/20 bg-emerald-500/10",
    rose: "border-rose-400/20 bg-rose-500/10",
    blue: "border-sky-400/20 bg-sky-500/10",
  };

  return (
    <div className={`rounded-[1.5rem] border p-5 ${toneClasses[tone]}`}>
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
        {label}
      </p>
      <p className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white">
        {value}
      </p>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatClock(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function formatRelativeTime(value: string | null) {
  if (!value) {
    return "No update";
  }

  const elapsedMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / (1000 * 60)),
  );

  if (elapsedMinutes < 1) {
    return "Just now";
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.round(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  const elapsedDays = Math.round(elapsedHours / 24);
  return `${elapsedDays}d ago`;
}
