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

export function AdminOperationsOverview() {
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

  const operatorLoad = useMemo(() => {
    const totals = (snapshot?.activeTickets ?? []).reduce<Record<string, number>>(
      (accumulator, ticket) => {
        const operator = ticket.assigned_to?.trim() || "Stores Queue";
        accumulator[operator] = (accumulator[operator] ?? 0) + 1;
        return accumulator;
      },
      {},
    );

    const highest = Math.max(1, ...Object.values(totals));

    return Object.entries(totals)
      .map(([operator, total]) => ({
        operator,
        total,
        ratio: total / highest,
      }))
      .sort((left, right) => right.total - left.total);
  }, [snapshot]);

  const flowMetrics = useMemo(() => {
    const activeTickets = snapshot?.activeTickets ?? [];

    const counts = {
      queue: 0,
      working: 0,
      ordered: 0,
      ready: 0,
    };

    for (const ticket of activeTickets) {
      if (
        ticket.status === "PENDING" ||
        ticket.status === "QUERY" ||
        ticket.status === "ESTIMATE" ||
        ticket.status === "QUOTE"
      ) {
        counts.queue += 1;
      } else if (ticket.status === "IN_PROGRESS") {
        counts.working += 1;
      } else if (ticket.status === "ORDERED") {
        counts.ordered += 1;
      } else if (ticket.status === "READY") {
        counts.ready += 1;
      }
    }

    const total = Math.max(
      1,
      counts.queue + counts.working + counts.ordered + counts.ready,
    );

    return {
      total,
      counts,
    };
  }, [snapshot]);

  return (
    <section className="aurora-section overflow-hidden">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="aurora-kicker">
            Relay Command Surface
          </div>
          <h2 className="mt-4 aurora-heading">
            Live Operations Summary
          </h2>
          <p className="mt-3 max-w-3xl aurora-copy">
            Low-frequency operational snapshot with lightweight SVG telemetry, operator workload distribution, and rule-based action prompts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {lastUpdatedAt ? (
            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--foreground-subtle)]">
              Updated {formatDateTime(lastUpdatedAt)}
            </p>
          ) : null}
          <div className="aurora-kicker">
            Low cost: summary queries only
          </div>
          <button
            type="button"
            onClick={() => void loadOverview()}
            disabled={isLoading}
            className="aurora-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="aurora-alert aurora-alert-error mt-6">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <OverviewMetricCard
            label="Active Parts Jobs"
            value={String(snapshot?.activeTickets.length ?? 0)}
            helper={`${derivedSummary.queueCount} in queue review, ${derivedSummary.readyCount} ready to collect.`}
            accent="cyan"
          />
          <OverviewMetricCard
            label="Workshop Incidents"
            value={String(snapshot?.activeIncidents.length ?? 0)}
            helper={`${derivedSummary.awaitingPartsIncidents} awaiting parts, ${derivedSummary.criticalIncidents} high severity.`}
            accent="amber"
          />
          <OverviewMetricCard
            label="Open Tasks"
            value={String(snapshot?.openTasks.length ?? 0)}
            helper={`${derivedSummary.overdueTasks} overdue, ${snapshot?.activeUsersCount ?? 0} recently active users.`}
            accent="emerald"
          />
          <OverviewMetricCard
            label="Recent Returns"
            value={String(snapshot?.returns.length ?? 0)}
            helper={`${derivedSummary.unassignedTickets} unassigned parts jobs, ${derivedSummary.unassignedIncidents} unassigned incidents.`}
            accent="rose"
          />
        </div>

        <div className="aurora-subpanel p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="aurora-stat-label text-sm">
              Queue Flow
            </p>
            <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
              lightweight svg
            </p>
          </div>
          <div className="mt-4">
            <FlowPieChart
              queue={flowMetrics.counts.queue}
              working={flowMetrics.counts.working}
              ordered={flowMetrics.counts.ordered}
              ready={flowMetrics.counts.ready}
              total={flowMetrics.total}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="aurora-subpanel p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="aurora-stat-label text-sm">
                Operator Load
              </p>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                assigned jobs
              </p>
            </div>
            <div className="mt-4 space-y-3">
              {operatorLoad.length > 0 ? (
                operatorLoad.map((entry) => (
                  <OperatorLoadRow
                    key={entry.operator}
                    operator={entry.operator}
                    total={entry.total}
                    ratio={entry.ratio}
                  />
                ))
              ) : (
                <div className="aurora-empty">
                  No assigned live jobs to profile yet.
                </div>
              )}
            </div>
          </div>

          <div className="aurora-subpanel p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="aurora-stat-label text-sm">
                Suggested Actions
              </p>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                rule-based
              </p>
            </div>
            <div className="mt-4 space-y-3">
              {suggestedActions.map((action, index) => (
                <article
                  key={action}
                  className="rounded-[1.25rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] px-4 py-4 text-sm leading-6 text-[color:var(--foreground-muted)]"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--accent-soft)] text-[11px] font-semibold text-[color:var(--foreground-strong)]">
                      {index + 1}
                    </span>
                    <span>{action}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="aurora-subpanel p-5">
            <p className="aurora-stat-label text-sm">
              Daily KPI Summary
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <OverviewStat label="Tickets Raised Today" value={String(snapshot?.dailySummary.ticketsCreatedToday ?? 0)} />
              <OverviewStat label="Tickets Completed Today" value={String(snapshot?.dailySummary.ticketsCompletedToday ?? 0)} />
              <OverviewStat label="Incidents Reported Today" value={String(snapshot?.dailySummary.incidentsReportedToday ?? 0)} />
              <OverviewStat label="Tasks Closed Today" value={String(snapshot?.dailySummary.tasksCompletedToday ?? 0)} />
            </div>
          </div>

          <div className="aurora-subpanel p-5">
            <p className="aurora-stat-label text-sm">
              Suggested Actions
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
              Recent Returned Parts
            </p>
            <div className="mt-4 space-y-3">
              {snapshot?.returns.length ? (
                snapshot.returns.map((entry) => (
                  <article
                    key={`${entry.ticketId}-${entry.createdAt ?? "unknown"}`}
                    className="rounded-[1.25rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        href={`/tickets/${entry.ticketId}`}
                        className="text-sm font-semibold text-[color:var(--foreground-strong)] transition hover:opacity-75"
                      >
                        {entry.jobNumber?.trim()
                          ? `Job ${entry.jobNumber.trim()}`
                          : `Ticket ${entry.ticketId.slice(0, 8)}`}
                      </Link>
                      <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                        {entry.createdAt ? formatDateTime(entry.createdAt) : "Recent"}
                      </p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--foreground-muted)]">{entry.reason}</p>
                  </article>
                ))
              ) : (
                <div className="aurora-empty">
                  No recent part returns recorded.
                </div>
              )}
            </div>
          </div>

          <div className="aurora-subpanel p-5">
            <p className="aurora-stat-label text-sm">
              Recent Returned Parts
            </p>
            <p className="mt-1 text-sm leading-6 text-[color:var(--foreground-muted)]">
              Render budget is intentionally low: no charting library, no canvas, no animation loops, and no extra live queries beyond the existing summary snapshot.
            </p>
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
  accent,
}: {
  label: string;
  value: string;
  helper: string;
  accent: "cyan" | "amber" | "emerald" | "rose";
}) {
  const accentClasses = {
    cyan: "border-[color:rgba(2,132,199,0.24)] bg-[color:rgba(2,132,199,0.08)]",
    amber: "border-[color:rgba(180,83,9,0.24)] bg-[color:rgba(180,83,9,0.08)]",
    emerald: "border-[color:rgba(4,120,87,0.24)] bg-[color:rgba(4,120,87,0.08)]",
    rose: "border-[color:rgba(185,28,28,0.24)] bg-[color:rgba(185,28,28,0.08)]",
  }[accent];

  return (
    <article className={`rounded-[1.5rem] border p-5 shadow-[var(--shadow-soft)] ${accentClasses}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--foreground-subtle)]">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-[color:var(--foreground-strong)]">{value}</p>
      <p className="mt-3 text-sm leading-6 text-[color:var(--foreground-muted)]">{helper}</p>
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
    <article className="rounded-[1.125rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-[color:var(--foreground-strong)]">{value}</p>
    </article>
  );
}

function OperatorLoadRow({
  operator,
  total,
  ratio,
}: {
  operator: string;
  total: number;
  ratio: number;
}) {
  return (
    <article className="rounded-[1.125rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">{operator}</p>
        <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">{total}</p>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[color:var(--accent-soft)]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,rgba(58,79,108,0.9),rgba(15,23,42,0.95))]"
          style={{ width: `${Math.max(10, Math.round(ratio * 100))}%` }}
        />
      </div>
    </article>
  );
}

const FLOW_SERIES = [
  { key: "queue", label: "Queue Review", color: "#B45309" },
  { key: "working", label: "Working", color: "#475569" },
  { key: "ordered", label: "Ordered", color: "#64748B" },
  { key: "ready", label: "Ready", color: "#047857" },
] as const;

function FlowPieChart({
  queue,
  working,
  ordered,
  ready,
  total,
}: {
  queue: number;
  working: number;
  ordered: number;
  ready: number;
  total: number;
}) {
  const segments = [
    { label: "Queue Review", value: queue, color: FLOW_SERIES[0].color },
    { label: "Working", value: working, color: FLOW_SERIES[1].color },
    { label: "Ordered", value: ordered, color: FLOW_SERIES[2].color },
    { label: "Ready", value: ready, color: FLOW_SERIES[3].color },
  ];
  const circumference = 2 * Math.PI * 42;
  let offset = 0;

  return (
    <div>
      <div className="overflow-hidden rounded-[1.25rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] p-4">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex h-40 w-40 shrink-0 items-center justify-center">
            <svg viewBox="0 0 120 120" className="h-40 w-40 -rotate-90" aria-hidden="true">
              <circle
                cx="60"
                cy="60"
                r="42"
                fill="none"
                stroke="rgba(148,163,184,0.18)"
                strokeWidth="12"
              />
              {segments.map((segment) => {
                const dashLength = (segment.value / total) * circumference;
                const circle = (
                  <circle
                    key={segment.label}
                    cx="60"
                    cy="60"
                    r="42"
                    fill="none"
                    stroke={segment.color}
                    strokeWidth="12"
                    strokeLinecap={segment.value > 0 ? "round" : "butt"}
                    strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += dashLength;
                return circle;
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--foreground-subtle)]">
                Live Jobs
              </span>
              <span className="mt-1 text-3xl font-semibold text-[color:var(--foreground-strong)]">
                {total}
              </span>
            </div>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-2">
            {segments.map((segment) => (
              <FlowLegend
                key={segment.label}
                label={segment.label}
                value={segment.value}
                color={segment.color}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        {segments.map((segment) => (
          <div
            key={`${segment.label}-share`}
            className="rounded-[1.125rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-[0.14em] text-[color:var(--foreground-subtle)]">
                {segment.label}
              </span>
              <span
                className="inline-flex h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
            </div>
            <p className="mt-2 text-xl font-semibold text-[color:var(--foreground-strong)]">
              {total > 0 ? `${Math.round((segment.value / total) * 100)}%` : "0%"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlowLegend({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-[1.125rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm text-[color:var(--foreground-muted)]">{label}</span>
        </div>
        <span className="text-sm font-semibold text-[color:var(--foreground-strong)]">{value}</span>
      </div>
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
