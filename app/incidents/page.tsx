"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { ConsoleIcon } from "@/components/console/console-icon";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { notifyUserTaskAssigned } from "@/lib/notifications";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";
import {
  createUserTask,
  fetchOpenTasksForAdmin,
  fetchUsersWithPresence,
  type UserTaskRecord,
  type UserDirectoryRecord,
} from "@/lib/user-tasks";
import {
  listWorkshopIncidents,
  reconcileWorkshopIncidentsWithPartsTickets,
  workshopIncidentStatuses,
  type WorkshopIncidentRecord,
} from "@/lib/workshop-incidents";
import { getAdaptivePollDelay, usePageActivity } from "@/lib/page-activity";

const INCIDENT_DASHBOARD_REFRESH_MS = 20000;
const USER_PRESENCE_REFRESH_MS = 60000;
const INCIDENT_DASHBOARD_VIEW_STORAGE_KEY = "relay-incidents-dashboard-view-mode";
const activeIncidentStatuses = workshopIncidentStatuses.filter(
  (status) => status !== "CLOSED",
);

export default function IncidentsPage() {
  const { isVisible, isIdle, isInteractive } = usePageActivity();
  const incidentsLoadInFlightRef = useRef(false);
  const incidentsFailureCountRef = useRef(0);
  const presenceFailureCountRef = useRef(0);
  const [viewMode, setViewMode] = useState<"standard" | "dynamic">(() => {
    if (typeof window === "undefined") {
      return "standard";
    }

    return window.localStorage.getItem(INCIDENT_DASHBOARD_VIEW_STORAGE_KEY) === "dynamic"
      ? "dynamic"
      : "standard";
  });
  const [incidents, setIncidents] = useState<WorkshopIncidentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserDirectoryRecord[]>([]);
  const [teamSearch, setTeamSearch] = useState("");
  const [openTasks, setOpenTasks] = useState<UserTaskRecord[]>([]);
  const [taskDraft, setTaskDraft] = useState({
    assignedTo: "",
    title: "",
    description: "",
  });
  const [isAssigningTask, setIsAssigningTask] = useState(false);
  const [isUsersPanelMinimized, setIsUsersPanelMinimized] = useState(false);
  const [isTaskPanelMinimized, setIsTaskPanelMinimized] = useState(false);

  const loadIncidents = useCallback(async () => {
    if (incidentsLoadInFlightRef.current) {
      return;
    }

    incidentsLoadInFlightRef.current = true;

    try {
      const supabase = getSupabaseClient();

      if (!supabase) {
        setErrorMessage("Supabase environment variables are not configured.");
        setIsLoading(false);
        return;
      }

      const { user, isAdmin } = await getCurrentUserWithRole(supabase);

      if (!user) {
        setErrorMessage("Sign in to view workshop incidents.");
        setIsLoading(false);
        return;
      }

      setCurrentUserId(user.id);

      const nextIncidents = await listWorkshopIncidents(supabase, {
        userId: user.id,
        isAdmin,
        scope: "active",
      });
      const incidentJobNumbers = Array.from(
        new Set(
          nextIncidents
            .map((incident) => incident.job_number.trim())
            .filter(Boolean),
        ),
      );

      let reconciledIncidents = nextIncidents;

      if (incidentJobNumbers.length > 0) {
        const { data: linkedTickets } = await supabase
          .from("tickets")
          .select("id, job_number, status")
          .in("job_number", incidentJobNumbers);

        reconciledIncidents = reconcileWorkshopIncidentsWithPartsTickets(
          nextIncidents,
          linkedTickets ?? [],
        );
      }

      setIncidents(reconciledIncidents);
      setLastUpdatedAt(new Date().toISOString());
      setErrorMessage("");
      setIsLoading(false);
      incidentsFailureCountRef.current = 0;
    } catch (error) {
      incidentsFailureCountRef.current += 1;
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load workshop incidents.",
      );
      setIsLoading(false);
    } finally {
      incidentsLoadInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadIncidents();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadIncidents]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    const scheduleRefresh = () => {
      if (cancelled) {
        return;
      }

      const nextDelay = getAdaptivePollDelay(INCIDENT_DASHBOARD_REFRESH_MS, {
        isVisible,
        isIdle,
        failureCount: incidentsFailureCountRef.current,
        maxMs: 5 * 60_000,
      });

      timeoutId = window.setTimeout(() => {
        void (async () => {
          try {
            if (isInteractive) {
              await loadIncidents();
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
  }, [isIdle, isInteractive, isVisible, loadIncidents]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const loadPresenceAndTasks = useCallback(async () => {
    if (!isInteractive) {
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    const [usersResult, tasksResult] = await Promise.allSettled([
      fetchUsersWithPresence(supabase),
      fetchOpenTasksForAdmin(supabase),
    ]);

    let nextUsers: UserDirectoryRecord[] = [];

    if (usersResult.status === "fulfilled") {
      nextUsers = usersResult.value;
      setUsers(nextUsers);
    } else {
      presenceFailureCountRef.current += 1;
      console.error("Failed to load RELAY users", usersResult.reason);
    }

    if (tasksResult.status === "fulfilled") {
      setOpenTasks(
        tasksResult.value.map((task) => {
          const assignee = nextUsers.find((user) => user.user_id === task.assigned_to);

          return {
            ...task,
            assignee_name: assignee?.full_name ?? task.assigned_to,
          };
        }),
      );
    } else {
      presenceFailureCountRef.current += 1;
      console.error("Failed to load RELAY tasks", tasksResult.reason);
      setOpenTasks([]);
    }
    if (usersResult.status === "fulfilled" && tasksResult.status === "fulfilled") {
      presenceFailureCountRef.current = 0;
    }
  }, [isInteractive]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPresenceAndTasks();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadPresenceAndTasks]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    const scheduleRefresh = () => {
      if (cancelled) {
        return;
      }

      const nextDelay = getAdaptivePollDelay(USER_PRESENCE_REFRESH_MS, {
        isVisible,
        isIdle,
        failureCount: presenceFailureCountRef.current,
        maxMs: 10 * 60_000,
      });

      timeoutId = window.setTimeout(() => {
        void (async () => {
          try {
            await loadPresenceAndTasks();
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
  }, [isIdle, isVisible, loadPresenceAndTasks]);

  const groupedIncidents = useMemo(
    () =>
      Object.fromEntries(
        activeIncidentStatuses.map((status) => [
          status,
          incidents.filter((incident) => incident.status === status),
        ]),
      ) as Record<(typeof activeIncidentStatuses)[number], WorkshopIncidentRecord[]>,
    [incidents],
  );

  const metrics = useMemo(() => {
    const activeCount = incidents.length;
    const damageCount = incidents.filter(
      (incident) => incident.incident_type === "DAMAGE",
    ).length;
    const tyreCount = incidents.filter(
      (incident) => incident.incident_type === "TYRE_BREAKDOWN",
    ).length;
    const awaitingPartsCount = incidents.filter(
      (incident) => incident.status === "AWAITING_PARTS",
    ).length;
    const unassignedCount = incidents.filter(
      (incident) => !incident.assigned_to.trim(),
    ).length;

    return {
      activeCount,
      damageCount,
      tyreCount,
      awaitingPartsCount,
      unassignedCount,
    };
  }, [incidents]);

  const visibleUsers = useMemo(() => {
    const query = teamSearch.trim().toLowerCase();
    return [...users]
      .filter((user) => !query || [user.full_name, user.role, user.user_id].filter(Boolean).join(" ").toLowerCase().includes(query))
      .sort((left, right) => Number(right.is_active) - Number(left.is_active));
  }, [teamSearch, users]);

  const openTaskCountByUserId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of openTasks) {
      counts.set(task.assigned_to, (counts.get(task.assigned_to) ?? 0) + 1);
    }
    return counts;
  }, [openTasks]);

  async function handleAssignTask() {
    const supabase = getSupabaseClient();

    if (!supabase || !currentUserId) {
      setErrorMessage("Supabase environment variables are not configured.");
      return;
    }

    if (!taskDraft.assignedTo || !taskDraft.title.trim()) {
      setErrorMessage("Select a user and enter a task title.");
      return;
    }

    setIsAssigningTask(true);
    setErrorMessage("");

    try {
      const nextTask = await createUserTask(supabase, {
        assignedTo: taskDraft.assignedTo,
        assignedBy: currentUserId,
        title: taskDraft.title.trim(),
        description: taskDraft.description.trim(),
      });

      const assignee = users.find((user) => user.user_id === nextTask.assigned_to);
      await notifyUserTaskAssigned(supabase, {
        userId: nextTask.assigned_to,
        taskTitle: nextTask.title,
        taskDescription: nextTask.description,
      });
      setOpenTasks((current) => [
        {
          ...nextTask,
          assignee_name: assignee?.full_name ?? nextTask.assigned_to,
        },
        ...current,
      ]);
      setTaskDraft({
        assignedTo: "",
        title: "",
        description: "",
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to assign task.");
    } finally {
      setIsAssigningTask(false);
    }
  }

  return (
    <div className="aurora-shell workshop-legacy-page">
      <div className="aurora-shell-inner max-w-[120rem]">
        <AuthGuard requiredRole="admin">
          <section className="workshop-dashboard">
            <PageHeader
              title="Workshop Control"
              description="Monitor live incidents, team availability, assigned work, and workshop response from one operational view."
              meta={
                <>
                  <span className="relay-live-label"><i /> Live data</span>
                  <span>Last refresh {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : "waiting"}</span>
                  <span className="hidden sm:inline">Current time {formatClock(now)}</span>
                </>
              }
              actions={
                <>
                  <select
                    value={viewMode}
                    onChange={(event) => {
                      const nextMode = event.target.value as "standard" | "dynamic";
                      setViewMode(nextMode);
                      window.localStorage.setItem(INCIDENT_DASHBOARD_VIEW_STORAGE_KEY, nextMode);
                    }}
                    className="relay-control"
                    aria-label="Workshop board view"
                  >
                    <option value="standard">Standard view</option>
                    <option value="dynamic">Dynamic view</option>
                  </select>
                  <button type="button" onClick={() => void loadIncidents()} className="relay-button relay-button-secondary">
                    <ConsoleIcon name="refresh" className="h-4 w-4" /> Refresh
                  </button>
                  <Link href="/incidents/damage/new" className="relay-button relay-button-secondary">Report damage</Link>
                  <Link href="/incidents/tyres/new" className="relay-button relay-button-primary">Tyre breakdown</Link>
                </>
              }
            />

            {errorMessage ? (
              <div className="aurora-alert aurora-alert-error mt-6">
                {errorMessage}
              </div>
            ) : null}

            <div className="relay-stat-grid relay-stat-grid-five">
              <StatCard label="Active incidents" value={String(metrics.activeCount)} context="Open workshop records" tone="slate" />
              <StatCard label="Damage reports" value={String(metrics.damageCount)} context="Active damage cases" tone="red" />
              <StatCard label="Tyre breakdowns" value={String(metrics.tyreCount)} context="Active tyre cases" tone="amber" />
              <StatCard label="Awaiting parts" value={String(metrics.awaitingPartsCount)} context="Blocked by parts" tone="blue" />
              <StatCard label="Unassigned" value={String(metrics.unassignedCount)} context="Needs an owner" tone="green" />
            </div>

            <div className="workshop-primary-grid">
              <SectionCard
                title="Team availability"
                description="Active users appear first. Select a person to prefill the task form."
                action={
                  <button
                    type="button"
                    onClick={() => setIsUsersPanelMinimized((current) => !current)}
                    className="relay-button relay-button-ghost"
                  >
                    {isUsersPanelMinimized ? "Expand" : "Minimise"}
                  </button>
                }
              >

                {!isUsersPanelMinimized ? (
                  <div className="relay-section-body">
                    <label className="relay-search-field">
                      <ConsoleIcon name="search" className="h-4 w-4" />
                      <span className="sr-only">Search team</span>
                      <input value={teamSearch} onChange={(event) => setTeamSearch(event.target.value)} placeholder="Search team" />
                    </label>
                    {visibleUsers.length === 0 ? (
                      <EmptyState title="No users found" description={teamSearch ? "Try a different name or role." : "No RELAY users are available yet."} />
                  ) : (
                    <div className="relay-user-list">
                    {visibleUsers.map((user) => (
                      <button
                        key={user.user_id}
                        type="button"
                        onClick={() =>
                          setTaskDraft((current) => ({
                            ...current,
                            assignedTo: user.user_id,
                          }))
                        }
                        className={`relay-user-row ${taskDraft.assignedTo === user.user_id ? "relay-user-row-selected" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold">
                              {user.full_name ?? user.user_id}
                            </p>
                            <p className="relay-user-meta">
                              {user.role ?? "user"} · {user.is_active && user.last_seen_at
                                ? `Seen ${formatHoursAgo(user.last_seen_at)}`
                                : "Offline"} · {openTaskCountByUserId.get(user.user_id) ?? 0} open task{(openTaskCountByUserId.get(user.user_id) ?? 0) === 1 ? "" : "s"}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`relay-presence-dot ${user.is_active ? "relay-presence-active" : ""}`} />
                            <span className={`relay-status-badge ${user.is_active ? "relay-status-success" : ""}`}>
                              {user.is_active ? "Active" : "Offline"}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                    </div>
                    )}
                  </div>
                ) : null}
              </SectionCard>

              <SectionCard
                title="Create and manage tasks"
                description="Assign work and review the current open task queue."
                action={
                  <button
                    type="button"
                    onClick={() => setIsTaskPanelMinimized((current) => !current)}
                    className="relay-button relay-button-ghost"
                  >
                    {isTaskPanelMinimized ? "Expand" : "Minimise"}
                  </button>
                }
              >

                {!isTaskPanelMinimized ? (
                  <>
                    <div className="relay-task-form">
                  <label className="relay-field">
                    <span>
                      Assigned User
                    </span>
                    <select
                      value={taskDraft.assignedTo}
                      onChange={(event) =>
                        setTaskDraft((current) => ({
                          ...current,
                          assignedTo: event.target.value,
                        }))
                      }
                      className="relay-control"
                    >
                      <option value="">Select user</option>
                      {users.map((user) => (
                        <option key={user.user_id} value={user.user_id}>
                          {user.full_name ?? user.user_id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="relay-field">
                    <span>
                      Task Title
                    </span>
                    <input
                      value={taskDraft.title}
                      onChange={(event) =>
                        setTaskDraft((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder="Example: Check damage photos for job 483321"
                      className="relay-control"
                    />
                  </label>

                  <label className="relay-field relay-field-wide">
                    <span>
                      Task Detail
                    </span>
                    <textarea
                      value={taskDraft.description}
                      onChange={(event) =>
                        setTaskDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      rows={4}
                      placeholder="Add any extra instruction for the assigned user."
                      className="relay-control relay-textarea"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => void handleAssignTask()}
                    disabled={isAssigningTask}
                    className="relay-button relay-button-primary"
                  >
                    {isAssigningTask ? "Assigning..." : "Send Task"}
                  </button>
                    </div>

                    <div className="relay-open-tasks">
                      <div className="flex items-center justify-between gap-3">
                        <h3>
                          Open Tasks
                        </h3>
                        <Link
                          href="/incidents/tasks"
                          className="relay-inline-link"
                        >
                          Manage Tasks
                        </Link>
                      </div>
                      {openTasks.length === 0 ? (
                        <EmptyState title="No open tasks" description="Newly assigned tasks will appear here." />
                      ) : (
                        openTasks.slice(0, 6).map((task) => (
                          <article
                            key={task.id}
                            className="relay-task-row"
                          >
                            <p className="font-semibold text-[color:var(--foreground-strong)]">{task.title}</p>
                            <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">
                              {task.assignee_name ?? task.assigned_to}
                            </p>
                            {task.description ? (
                              <p className="mt-2 text-sm leading-6 text-[color:var(--foreground-muted)]">
                                {task.description}
                              </p>
                            ) : null}
                          </article>
                        ))
                      )}
                    </div>
                  </>
                ) : null}
              </SectionCard>
            </div>

            {viewMode === "dynamic" ? (
              <div className="mt-8 grid gap-4 xl:grid-cols-3">
                {activeIncidentStatuses.map((status) => (
                  <section
                    key={status}
                    className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.82)_0%,rgba(15,23,42,0.56)_100%)] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getIncidentTone(status)}`}>
                          {formatIncidentStatus(status)}
                        </span>
                        <p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-400">
                          {groupedIncidents[status].length} live incident
                          {groupedIncidents[status].length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm font-semibold text-white">
                        {groupedIncidents[status].length}
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {isLoading ? (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-4 text-sm text-slate-400">
                          Loading lane...
                        </div>
                      ) : groupedIncidents[status].length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-4 text-sm text-slate-400">
                          No live incidents in this lane.
                        </div>
                      ) : (
                        groupedIncidents[status].map((incident) => (
                          <Link
                            key={incident.id}
                            href={`/incidents/${incident.id}`}
                            className={`block rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:border-white/20 hover:shadow-[0_20px_50px_-34px_rgba(15,23,42,0.7)] ${getDynamicIncidentCardTone(
                              incident.status,
                            )}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-lg font-semibold text-white">
                                  {incident.job_number
                                    ? `Job ${incident.job_number}`
                                    : incident.machine_reference}
                                </p>
                                <p className="mt-1 truncate text-sm text-slate-300">
                                  {formatIncidentType(incident.incident_type)} · {incident.reported_by || "Unknown reporter"}
                                </p>
                              </div>
                              <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                                {incident.location_type}
                              </span>
                            </div>

                            <p className="mt-4 line-clamp-4 text-sm leading-6 text-slate-200">
                              {incident.description}
                            </p>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                                {incident.severity}
                              </span>
                              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold text-slate-200">
                                {incident.assigned_to || "Unassigned"}
                              </span>
                              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold text-slate-200">
                                {formatRelativeTime(incident.updated_at)}
                              </span>
                            </div>

                            <dl className="mt-4 grid gap-2 text-xs text-slate-400">
                              <div className="flex items-center justify-between gap-3">
                                <dt>Machine</dt>
                                <dd className="truncate text-right text-slate-200">
                                  {incident.machine_reference || "-"}
                                </dd>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <dt>Location</dt>
                                <dd className="truncate text-right text-slate-200">
                                  {incident.location_summary || incident.location_type}
                                </dd>
                              </div>
                            </dl>

                            {incident.linked_parts_ticket_id ? (
                              <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200">
                                Linked Parts Request
                              </div>
                            ) : null}
                          </Link>
                        ))
                      )}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="mt-8 grid gap-4 xl:grid-cols-6">
                {activeIncidentStatuses.map((status) => (
                  <section
                    key={status}
                    className="min-h-[24rem] rounded-[1.75rem] border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getIncidentTone(status)}`}>
                        {formatIncidentStatus(status)}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm font-semibold text-white">
                        {groupedIncidents[status].length}
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {isLoading ? (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-4 text-sm text-slate-400">
                          Loading lane...
                        </div>
                      ) : groupedIncidents[status].length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-4 text-sm text-slate-400">
                          No live incidents in this lane.
                        </div>
                      ) : (
                        groupedIncidents[status].map((incident) => (
                          <Link
                            key={incident.id}
                            href={`/incidents/${incident.id}`}
                            className="block rounded-2xl border border-white/10 bg-black/15 p-4 transition hover:border-white/20 hover:bg-black/25"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-lg font-semibold text-white">
                                  {incident.job_number
                                    ? `Job ${incident.job_number}`
                                    : incident.machine_reference}
                                </p>
                                <p className="mt-1 truncate text-sm text-slate-300">
                                  {formatIncidentType(incident.incident_type)} · {incident.reported_by || "Unknown reporter"}
                                </p>
                              </div>
                              <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                                {incident.location_type}
                              </span>
                            </div>

                            <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-200">
                              {incident.description}
                            </p>

                            <dl className="mt-4 grid gap-2 text-xs text-slate-400">
                              <div className="flex items-center justify-between gap-3">
                                <dt>Machine</dt>
                                <dd className="truncate text-right text-slate-200">
                                  {incident.machine_reference || "-"}
                                </dd>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <dt>Assigned</dt>
                                <dd className="truncate text-right text-slate-200">
                                  {incident.assigned_to || "Unassigned"}
                                </dd>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <dt>Severity</dt>
                                <dd className="truncate text-right text-slate-200">
                                  {incident.severity}
                                </dd>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <dt>Updated</dt>
                                <dd className="truncate text-right text-slate-200">
                                  {formatRelativeTime(incident.updated_at)}
                                </dd>
                              </div>
                            </dl>

                            {incident.linked_parts_ticket_id ? (
                              <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200">
                                Linked Parts Request
                              </div>
                            ) : null}
                          </Link>
                        ))
                      )}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>
        </AuthGuard>
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

function formatClock(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function formatRelativeTime(value: string) {
  const deltaMs = Date.now() - new Date(value).getTime();
  const deltaMinutes = Math.max(1, Math.round(deltaMs / (1000 * 60)));

  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);

  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays}d ago`;
}

function formatHoursAgo(value: string) {
  return formatRelativeTime(value);
}

function formatIncidentType(value: string) {
  return value === "TYRE_BREAKDOWN" ? "Tyre Breakdown" : "Damage Report";
}

function formatIncidentStatus(value: string) {
  return value.replaceAll("_", " ");
}

function getIncidentTone(status: string) {
  switch (status) {
    case "REPORTED":
      return "border-rose-400/20 bg-rose-500/10 text-rose-200";
    case "ASSESSED":
      return "border-amber-400/20 bg-amber-500/10 text-amber-200";
    case "AWAITING_PARTS":
      return "border-sky-400/20 bg-sky-500/10 text-sky-200";
    case "PARTS_ASSIGNED":
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
    case "IN_REPAIR":
      return "border-indigo-400/20 bg-indigo-500/10 text-indigo-200";
    case "READY":
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
    default:
      return "border-white/10 bg-white/10 text-slate-200";
  }
}

function getDynamicIncidentCardTone(status: string) {
  switch (status) {
    case "REPORTED":
      return "border-rose-400/20 bg-rose-500/10";
    case "ASSESSED":
      return "border-amber-400/20 bg-amber-500/10";
    case "AWAITING_PARTS":
      return "border-sky-400/20 bg-sky-500/10";
    case "PARTS_ASSIGNED":
      return "border-emerald-400/20 bg-emerald-500/10";
    case "IN_REPAIR":
      return "border-indigo-400/20 bg-indigo-500/10";
    case "READY":
      return "border-teal-400/20 bg-teal-500/10";
    default:
      return "border-white/10 bg-white/5";
  }
}
