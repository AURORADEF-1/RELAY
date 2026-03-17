"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { WorkshopIncidentsTabs } from "@/components/workshop-incidents-tabs";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";
import {
  createUserTask,
  fetchOpenTasksForAdmin,
  fetchRecentlyActiveUsers,
  type ActiveUserPresence,
  type UserTaskRecord,
} from "@/lib/user-tasks";
import {
  listWorkshopIncidents,
  reconcileWorkshopIncidentsWithPartsTickets,
  updateWorkshopIncident,
  workshopIncidentStatuses,
  type WorkshopIncidentRecord,
} from "@/lib/workshop-incidents";

const INCIDENT_DASHBOARD_REFRESH_MS = 15000;
const activeIncidentStatuses = workshopIncidentStatuses.filter(
  (status) => status !== "CLOSED",
);

export default function IncidentsPage() {
  const { requesterUnreadCount, adminBadgeCount, isAdmin } = useNotifications();
  const [incidents, setIncidents] = useState<WorkshopIncidentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeUsers, setActiveUsers] = useState<ActiveUserPresence[]>([]);
  const [openTasks, setOpenTasks] = useState<UserTaskRecord[]>([]);
  const [taskDraft, setTaskDraft] = useState({
    assignedTo: "",
    title: "",
    description: "",
  });
  const [isAssigningTask, setIsAssigningTask] = useState(false);

  const loadIncidents = useCallback(async () => {
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

        await Promise.all(
          reconciledIncidents.map(async (incident, index) => {
            const previousIncident = nextIncidents[index];

            if (
              incident.linked_parts_ticket_id !== previousIncident?.linked_parts_ticket_id ||
              incident.status !== previousIncident?.status
            ) {
              await updateWorkshopIncident(supabase, incident.id, {
                linked_parts_ticket_id: incident.linked_parts_ticket_id,
                status: incident.status,
              });
            }
          }),
        );
      }

      setIncidents(reconciledIncidents);
      setLastUpdatedAt(new Date().toISOString());
      setErrorMessage("");
      setIsLoading(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load workshop incidents.",
      );
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadIncidents();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadIncidents]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadIncidents();
    }, INCIDENT_DASHBOARD_REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, [loadIncidents]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const loadPresenceAndTasks = useCallback(async () => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    try {
      const [users, tasks] = await Promise.all([
        fetchRecentlyActiveUsers(supabase),
        fetchOpenTasksForAdmin(supabase),
      ]);
      setActiveUsers(users);
      setOpenTasks(tasks);
    } catch (error) {
      console.error("Failed to load RELAY presence or tasks", error);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPresenceAndTasks();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadPresenceAndTasks]);

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

      const assignee = activeUsers.find((user) => user.user_id === nextTask.assigned_to);
      setOpenTasks((current) => [
        {
          ...nextTask,
          assignee_name:
            assignee?.full_name ?? assignee?.username ?? nextTask.assigned_to,
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
            <Link href="/submit" className="rounded-full px-4 py-2 hover:bg-white/10">
              Submit Ticket
            </Link>
            <Link href="/requests" className="rounded-full px-4 py-2 hover:bg-white/10">
              My Requests
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
            <Link
              href="/incidents"
              className="rounded-full bg-white px-4 py-2 font-semibold text-slate-950"
            >
              Workshop Control
            </Link>
            {isAdmin ? (
              <>
                <Link href="/wallboard" className="rounded-full px-4 py-2 hover:bg-white/10">
                  Live Wallboard
                </Link>
                <Link href="/admin" className="rounded-full px-4 py-2 hover:bg-white/10">
                  Parts Control
                  <NotificationBadge count={adminBadgeCount} />
                </Link>
              </>
            ) : null}
            <LogoutButton />
          </div>
        </nav>

        <AuthGuard requiredRole="admin">
          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-[0_32px_90px_-48px_rgba(15,23,42,0.85)] backdrop-blur">
            <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-5">
                <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">
                  Live Incident Board
                </div>
                <div className="space-y-3">
                  <h1 className="text-5xl font-semibold tracking-[-0.05em] text-white sm:text-6xl">
                    Workshop Control
                  </h1>
                  <p className="max-w-3xl text-lg leading-8 text-slate-300">
                    Live operational view for damage reports, tyre breakdowns, queue pressure, and workshop response movement.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <InfoCard label="Current Time" value={formatClock(now)} />
                <InfoCard
                  label="Last Sync"
                  value={lastUpdatedAt ? formatDateTime(lastUpdatedAt) : "Waiting..."}
                />
                <button
                  type="button"
                  onClick={() => void loadIncidents()}
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

            <div className="mt-8">
              <WorkshopIncidentsTabs activeTab="dashboard" />
            </div>

            {errorMessage ? (
              <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard label="Active Incidents" value={String(metrics.activeCount)} tone="slate" />
              <MetricCard label="Damage Reports" value={String(metrics.damageCount)} tone="rose" />
              <MetricCard label="Tyre Breakdowns" value={String(metrics.tyreCount)} tone="amber" />
              <MetricCard label="Awaiting Parts" value={String(metrics.awaitingPartsCount)} tone="blue" />
              <MetricCard label="Unassigned" value={String(metrics.unassignedCount)} tone="emerald" />
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_1fr]">
              <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                    Active Users
                  </p>
                  <p className="text-sm leading-6 text-slate-400">
                    Users currently logged in or seen within the last hour.
                  </p>
                </div>

                <div className="mt-6 space-y-3">
                  {activeUsers.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-4 text-sm text-slate-400">
                      No recent user activity detected yet.
                    </div>
                  ) : (
                    activeUsers.map((user) => (
                      <button
                        key={user.user_id}
                        type="button"
                        onClick={() =>
                          setTaskDraft((current) => ({
                            ...current,
                            assignedTo: user.user_id,
                          }))
                        }
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          taskDraft.assignedTo === user.user_id
                            ? "border-white/20 bg-white/10 text-white"
                            : "border-white/10 bg-black/15 hover:border-white/20 hover:bg-black/25"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold">
                              {user.full_name ?? user.username ?? user.user_id}
                            </p>
                            <p
                              className={`mt-1 text-xs font-medium uppercase tracking-[0.16em] ${
                                taskDraft.assignedTo === user.user_id
                                  ? "text-slate-300"
                                  : "text-slate-400"
                              }`}
                            >
                              {user.role ?? "user"} · Seen {formatHoursAgo(user.last_seen_at)}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                              taskDraft.assignedTo === user.user_id
                                ? "border border-white/20 bg-white/10 text-white"
                                : "border border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                            }`}
                          >
                            Active
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                    Send Task
                  </p>
                  <p className="text-sm leading-6 text-slate-400">
                    Click a user, assign a task, and it will appear in their task view.
                  </p>
                </div>

                <div className="mt-6 space-y-4">
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
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
                      className="h-11 w-full rounded-xl border border-white/10 bg-black/15 px-4 text-sm text-white outline-none transition focus:border-white/20"
                    >
                      <option value="">Select active user</option>
                      {activeUsers.map((user) => (
                        <option key={user.user_id} value={user.user_id}>
                          {user.full_name ?? user.username ?? user.user_id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
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
                      className="h-11 w-full rounded-xl border border-white/10 bg-black/15 px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-white/20"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
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
                      className="w-full rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm leading-7 text-white outline-none transition placeholder:text-slate-500 focus:border-white/20"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => void handleAssignTask()}
                    disabled={isAssigningTask}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isAssigningTask ? "Assigning..." : "Send Task"}
                  </button>
                </div>

                <div className="mt-6 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Open Tasks
                  </p>
                  {openTasks.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-4 text-sm text-slate-400">
                      No open tasks assigned yet.
                    </div>
                  ) : (
                    openTasks.slice(0, 6).map((task) => (
                      <article
                        key={task.id}
                        className="rounded-2xl border border-white/10 bg-black/15 p-4"
                      >
                        <p className="text-sm font-semibold text-white">{task.title}</p>
                        <p className="mt-1 text-sm text-slate-400">
                          {task.assignee_name ?? task.assigned_to}
                        </p>
                        {task.description ? (
                          <p className="mt-3 text-sm leading-6 text-slate-300">
                            {task.description}
                          </p>
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>

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
