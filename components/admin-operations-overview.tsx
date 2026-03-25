"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractRequesterReturnReason } from "@/lib/requester-ticket-actions";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getAdaptivePollDelay, usePageActivity } from "@/lib/page-activity";
import { activeTicketStatuses, type TicketStatus } from "@/lib/statuses";
import { getSupabaseClient } from "@/lib/supabase";
import { fetchRecentlyActiveUsers } from "@/lib/user-tasks";

const OPERATIONS_REFRESH_MS = 90_000;

type OverviewTicketRow = {
  id: string;
  job_number: string | null;
  status: TicketStatus | null;
  assigned_to: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type OverviewIncidentRow = {
  id: string;
  status: string | null;
  assigned_to: string | null;
  updated_at: string | null;
  severity: string | null;
};

type OverviewTaskRow = {
  id: string;
  assigned_to: string | null;
  due_at: string | null;
  created_at: string | null;
};

type OverviewReturnRow = {
  ticket_id: string | null;
  comment: string | null;
  created_at: string | null;
};

type OverviewSnapshot = {
  activeTickets: OverviewTicketRow[];
  activeIncidents: OverviewIncidentRow[];
  openTasks: OverviewTaskRow[];
  activeUsersCount: number;
  returns: Array<{
    ticketId: string;
    jobNumber: string | null;
    reason: string;
    createdAt: string | null;
  }>;
  dailySummary: {
    ticketsCreatedToday: number;
    ticketsCompletedToday: number;
    incidentsReportedToday: number;
    tasksCompletedToday: number;
  };
};

export function AdminOperationsOverview({
  standalone = false,
}: {
  standalone?: boolean;
}) {
  const { isVisible, isIdle, isInteractive } = usePageActivity();
  const failureCountRef = useRef(0);
  const [snapshot, setSnapshot] = useState<OverviewSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const { user, isAdmin } = await getCurrentUserWithRole(supabase, {
        forceFresh: true,
      });

      if (!user || !isAdmin) {
        setErrorMessage("Admin access is required for the operations overview.");
        setIsLoading(false);
        return;
      }

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const startOfTodayIso = startOfToday.toISOString();

      const [
        activeTicketsResult,
        activeIncidentsResult,
        openTasksResult,
        recentUsersResult,
        recentReturnsResult,
        ticketsCreatedTodayResult,
        ticketsCompletedTodayResult,
        incidentsReportedTodayResult,
        tasksCompletedTodayResult,
      ] = await Promise.all([
        supabase
          .from("tickets")
          .select("id, job_number, status, assigned_to, updated_at, created_at")
          .in("status", activeTicketStatuses)
          .order("updated_at", { ascending: false }),
        supabase
          .from("workshop_incidents")
          .select("id, status, assigned_to, updated_at, severity")
          .neq("status", "CLOSED")
          .order("updated_at", { ascending: false }),
        supabase
          .from("user_tasks")
          .select("id, assigned_to, due_at, created_at")
          .eq("status", "OPEN")
          .order("created_at", { ascending: false }),
        fetchRecentlyActiveUsers(supabase),
        supabase
          .from("ticket_updates")
          .select("ticket_id, comment, created_at")
          .like("comment", "Part return requested by requester.%")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .gte("created_at", startOfTodayIso),
        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("status", "COMPLETED")
          .gte("updated_at", startOfTodayIso),
        supabase
          .from("workshop_incidents")
          .select("id", { count: "exact", head: true })
          .gte("created_at", startOfTodayIso),
        supabase
          .from("user_tasks")
          .select("id", { count: "exact", head: true })
          .eq("status", "DONE")
          .gte("updated_at", startOfTodayIso),
      ]);

      if (activeTicketsResult.error) {
        throw new Error(activeTicketsResult.error.message);
      }

      if (activeIncidentsResult.error) {
        throw new Error(activeIncidentsResult.error.message);
      }

      if (openTasksResult.error) {
        throw new Error(openTasksResult.error.message);
      }

      if (recentReturnsResult.error) {
        throw new Error(recentReturnsResult.error.message);
      }

      const returnedTicketIds = Array.from(
        new Set(
          ((recentReturnsResult.data ?? []) as OverviewReturnRow[])
            .map((row) => row.ticket_id)
            .filter((ticketId): ticketId is string => Boolean(ticketId)),
        ),
      );

      const returnedTicketJobNumbers =
        returnedTicketIds.length > 0
          ? await supabase
              .from("tickets")
              .select("id, job_number")
              .in("id", returnedTicketIds)
          : { data: [], error: null };

      if (returnedTicketJobNumbers.error) {
        throw new Error(returnedTicketJobNumbers.error.message);
      }

      const jobNumberByTicketId = new Map(
        ((returnedTicketJobNumbers.data ?? []) as Array<{
          id: string;
          job_number: string | null;
        }>).map((ticket) => [ticket.id, ticket.job_number ?? null]),
      );

      setSnapshot({
        activeTickets: (activeTicketsResult.data ?? []) as OverviewTicketRow[],
        activeIncidents: (activeIncidentsResult.data ?? []) as OverviewIncidentRow[],
        openTasks: (openTasksResult.data ?? []) as OverviewTaskRow[],
        activeUsersCount: recentUsersResult.length,
        returns: ((recentReturnsResult.data ?? []) as OverviewReturnRow[])
          .map((row) => ({
            ticketId: row.ticket_id ?? "",
            jobNumber: row.ticket_id ? (jobNumberByTicketId.get(row.ticket_id) ?? null) : null,
            reason: extractRequesterReturnReason(row.comment) ?? "",
            createdAt: row.created_at ?? null,
          }))
          .filter((row) => row.ticketId && row.reason),
        dailySummary: {
          ticketsCreatedToday: ticketsCreatedTodayResult.count ?? 0,
          ticketsCompletedToday: ticketsCompletedTodayResult.count ?? 0,
          incidentsReportedToday: incidentsReportedTodayResult.count ?? 0,
          tasksCompletedToday: tasksCompletedTodayResult.count ?? 0,
        },
      });
      setLastUpdatedAt(new Date().toISOString());
      setErrorMessage(null);
      failureCountRef.current = 0;
    } catch (error) {
      failureCountRef.current += 1;
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load the operations overview.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    const scheduleRefresh = () => {
      if (cancelled) {
        return;
      }

      const nextDelay = getAdaptivePollDelay(OPERATIONS_REFRESH_MS, {
        isVisible,
        isIdle,
        failureCount: failureCountRef.current,
        maxMs: 10 * 60_000,
      });

      timeoutId = window.setTimeout(() => {
        void (async () => {
          try {
            if (isInteractive) {
              await loadOverview();
            }
          } finally {
            scheduleRefresh();
          }
        })();
      }, nextDelay);
    };

    scheduleRefresh();

    return () => {
      cancelled = true;

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isIdle, isInteractive, isVisible, loadOverview]);

  const derivedSummary = useMemo(() => {
    const activeTickets = snapshot?.activeTickets ?? [];
    const activeIncidents = snapshot?.activeIncidents ?? [];
    const openTasks = snapshot?.openTasks ?? [];

    const queueCount = activeTickets.filter((ticket) =>
      ticket.status === "PENDING" ||
      ticket.status === "QUERY" ||
      ticket.status === "ESTIMATE" ||
      ticket.status === "QUOTE",
    ).length;
    const readyCount = activeTickets.filter((ticket) => ticket.status === "READY").length;
    const orderedCount = activeTickets.filter((ticket) => ticket.status === "ORDERED").length;
    const unassignedTickets = activeTickets.filter(
      (ticket) => !ticket.assigned_to?.trim(),
    ).length;
    const staleTicketHours = activeTickets.reduce((oldest, ticket) => {
      const updatedAt = ticket.updated_at ?? ticket.created_at;

      if (!updatedAt) {
        return oldest;
      }

      const ageHours = (Date.now() - new Date(updatedAt).getTime()) / 3_600_000;
      return Math.max(oldest, ageHours);
    }, 0);

    const awaitingPartsIncidents = activeIncidents.filter(
      (incident) => incident.status === "AWAITING_PARTS",
    ).length;
    const criticalIncidents = activeIncidents.filter(
      (incident) => incident.severity === "CRITICAL" || incident.severity === "HIGH",
    ).length;
    const unassignedIncidents = activeIncidents.filter(
      (incident) => !incident.assigned_to?.trim(),
    ).length;
    const overdueTasks = openTasks.filter((task) => {
      if (!task.due_at) {
        return false;
      }

      return new Date(task.due_at).getTime() < Date.now();
    }).length;

    return {
      queueCount,
      readyCount,
      orderedCount,
      unassignedTickets,
      staleTicketHours,
      awaitingPartsIncidents,
      criticalIncidents,
      unassignedIncidents,
      overdueTasks,
    };
  }, [snapshot]);

  const suggestedActions = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const suggestions: string[] = [];

    if (derivedSummary.unassignedTickets > 0) {
      suggestions.push(
        `Assign owners to ${derivedSummary.unassignedTickets} unassigned parts job${derivedSummary.unassignedTickets === 1 ? "" : "s"}.`,
      );
    }

    if (snapshot.returns.length > 0) {
      suggestions.push(
        `Review ${snapshot.returns.length} recent returned part request${snapshot.returns.length === 1 ? "" : "s"} and move the linked jobs back through Stores triage.`,
      );
    }

    if (derivedSummary.readyCount >= 3) {
      suggestions.push(
        `Clear the READY queue by prompting collection or completion on ${derivedSummary.readyCount} job${derivedSummary.readyCount === 1 ? "" : "s"}.`,
      );
    }

    if (derivedSummary.awaitingPartsIncidents > 0) {
      suggestions.push(
        `Cross-check ${derivedSummary.awaitingPartsIncidents} workshop incident${derivedSummary.awaitingPartsIncidents === 1 ? "" : "s"} awaiting parts against the parts queue.`,
      );
    }

    if (derivedSummary.overdueTasks > 0) {
      suggestions.push(
        `Reassign or close ${derivedSummary.overdueTasks} overdue task${derivedSummary.overdueTasks === 1 ? "" : "s"}.`,
      );
    }

    if (derivedSummary.staleTicketHours >= 24) {
      suggestions.push(
        `Review the oldest untouched active ticket. The current longest age is ${Math.floor(derivedSummary.staleTicketHours)} hours.`,
      );
    }

    if (derivedSummary.criticalIncidents > 0) {
      suggestions.push(
        `Prioritise ${derivedSummary.criticalIncidents} high-severity workshop incident${derivedSummary.criticalIncidents === 1 ? "" : "s"}.`,
      );
    }

    if (suggestions.length === 0) {
      suggestions.push("No immediate bottleneck is obvious. Maintain normal flow and monitor READY, QUERY, and workshop queues.");
    }

    return suggestions;
  }, [derivedSummary, snapshot]);

  return (
    <section className={`rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.18)] ${standalone ? "" : ""}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
            Operational Overview
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            Live Operations Summary
          </h2>
          <p className="mt-3 max-w-3xl text-base leading-8 text-slate-700">
            Slow-refresh operational snapshot with queue pressure, workshop load, daily KPI movement, and suggested next actions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdatedAt ? (
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Updated {formatDateTime(lastUpdatedAt)}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void loadOverview()}
            disabled={isLoading}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        <OverviewMetricCard label="Active Parts Jobs" value={String(snapshot?.activeTickets.length ?? 0)} helper={`${derivedSummary.queueCount} in queue review, ${derivedSummary.readyCount} ready to collect.`} />
        <OverviewMetricCard label="Workshop Incidents" value={String(snapshot?.activeIncidents.length ?? 0)} helper={`${derivedSummary.awaitingPartsIncidents} awaiting parts, ${derivedSummary.criticalIncidents} high severity.`} />
        <OverviewMetricCard label="Open Tasks" value={String(snapshot?.openTasks.length ?? 0)} helper={`${derivedSummary.overdueTasks} overdue, ${snapshot?.activeUsersCount ?? 0} recently active users.`} />
        <OverviewMetricCard label="Recent Returns" value={String(snapshot?.returns.length ?? 0)} helper={`${derivedSummary.unassignedTickets} unassigned parts jobs, ${derivedSummary.unassignedIncidents} unassigned incidents.`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Suggested Actions
            </p>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
              Rule-based
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {suggestedActions.map((action) => (
              <article
                key={action}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm leading-6 text-slate-700"
              >
                {action}
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Daily KPI Summary
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <OverviewStat label="Tickets Raised Today" value={String(snapshot?.dailySummary.ticketsCreatedToday ?? 0)} />
              <OverviewStat label="Tickets Completed Today" value={String(snapshot?.dailySummary.ticketsCompletedToday ?? 0)} />
              <OverviewStat label="Incidents Reported Today" value={String(snapshot?.dailySummary.incidentsReportedToday ?? 0)} />
              <OverviewStat label="Tasks Closed Today" value={String(snapshot?.dailySummary.tasksCompletedToday ?? 0)} />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Recent Returned Parts
            </p>
            <div className="mt-4 space-y-3">
              {snapshot?.returns.length ? (
                snapshot.returns.map((entry) => (
                  <article
                    key={`${entry.ticketId}-${entry.createdAt ?? "unknown"}`}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        href={`/tickets/${entry.ticketId}`}
                        className="text-sm font-semibold text-slate-900 transition hover:text-slate-600"
                      >
                        {entry.jobNumber?.trim()
                          ? `Job ${entry.jobNumber.trim()}`
                          : `Ticket ${entry.ticketId.slice(0, 8)}`}
                      </Link>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        {entry.createdAt ? formatDateTime(entry.createdAt) : "Recent"}
                      </p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{entry.reason}</p>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-500">
                  No recent part returns recorded.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function OverviewMetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">{helper}</p>
    </article>
  );
}

function OverviewStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </article>
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
