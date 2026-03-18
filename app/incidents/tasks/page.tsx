"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { WorkshopIncidentsTabs } from "@/components/workshop-incidents-tabs";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";
import {
  fetchOpenTasksForAdmin,
  fetchUsersWithPresence,
  updateUserTask,
  type UserDirectoryRecord,
  type UserTaskRecord,
} from "@/lib/user-tasks";

type TaskDraft = {
  title: string;
  description: string;
  assigned_to: string;
  due_at: string;
  status: "OPEN" | "DONE";
};

export default function WorkshopTasksPage() {
  const { requesterUnreadCount, adminBadgeCount, isAdmin } = useNotifications();
  const [tasks, setTasks] = useState<UserTaskRecord[]>([]);
  const [users, setUsers] = useState<UserDirectoryRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft>({
    title: "",
    description: "",
    assigned_to: "",
    due_at: "",
    status: "OPEN",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const supabase = getSupabaseClient();

      if (!supabase) {
        setErrorMessage("Supabase environment variables are not configured.");
        setIsLoading(false);
        return;
      }

      const { user, isAdmin } = await getCurrentUserWithRole(supabase);

      if (!user || !isAdmin) {
        setErrorMessage("Admin access is required to manage tasks.");
        setIsLoading(false);
        return;
      }

      const [nextTasks, nextUsers] = await Promise.all([
        fetchOpenTasksForAdmin(supabase),
        fetchUsersWithPresence(supabase),
      ]);

      setUsers(nextUsers);
      setTasks(
        nextTasks.map((task) => {
          const assignee = nextUsers.find((person) => person.user_id === task.assigned_to);
          return {
            ...task,
            assignee_name: assignee?.full_name ?? task.assigned_to,
          };
        }),
      );
      setSelectedTaskId((current) => current ?? nextTasks[0]?.id ?? null);
      setIsLoading(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load tasks.");
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadData]);

  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId) ?? tasks[0] ?? null;

  useEffect(() => {
    if (!selectedTask) {
      setDraft({
        title: "",
        description: "",
        assigned_to: "",
        due_at: "",
        status: "OPEN",
      });
      return;
    }

    setDraft({
      title: selectedTask.title,
      description: selectedTask.description ?? "",
      assigned_to: selectedTask.assigned_to,
      due_at: selectedTask.due_at ? toDatetimeLocalValue(selectedTask.due_at) : "",
      status: selectedTask.status,
    });
  }, [selectedTask]);

  async function handleSaveTask() {
    if (!selectedTask) {
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

    setIsSaving(true);
    setNotice(null);

    try {
      const updatedTask = await updateUserTask(supabase, selectedTask.id, {
        title: draft.title,
        description: draft.description,
        assigned_to: draft.assigned_to,
        due_at: draft.due_at ? new Date(draft.due_at).toISOString() : null,
        status: draft.status,
      });

      if (updatedTask.status === "DONE") {
        setTasks((current) => current.filter((task) => task.id !== selectedTask.id));
        setSelectedTaskId((current) => (current === selectedTask.id ? null : current));
        setNotice({
          type: "success",
          message: "Task marked complete and moved to Completed Tasks.",
        });
      } else {
        const assignee = users.find((person) => person.user_id === updatedTask.assigned_to);
        setTasks((current) =>
          current.map((task) =>
            task.id === updatedTask.id
              ? {
                  ...updatedTask,
                  assignee_name: assignee?.full_name ?? updatedTask.assigned_to,
                }
              : task,
          ),
        );
        setNotice({
          type: "success",
          message: "Task updated.",
        });
      }
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to update task.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">Home</Link>
            <Link href="/legal" className="rounded-full px-4 py-2 hover:bg-white">Legal</Link>
            <Link href="/submit" className="rounded-full px-4 py-2 hover:bg-white">Submit Ticket</Link>
            <Link href="/requests" className="rounded-full px-4 py-2 hover:bg-white">
              My Requests
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
            <Link href="/tasks" className="rounded-full px-4 py-2 hover:bg-white">Tasks</Link>
            {isAdmin ? (
              <>
                <Link href="/incidents" className="rounded-full bg-slate-950 px-4 py-2 text-white hover:bg-slate-800">Workshop Control</Link>
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
            <div className="space-y-5">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                Workshop Tasks
              </div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                Task Manager
              </h1>
              <p className="max-w-3xl text-base leading-8 text-slate-600">
                Open tasks can be reviewed, edited, reassigned, or marked complete here.
              </p>
            </div>

            <div className="mt-8">
              <WorkshopIncidentsTabs activeTab="tasks" />
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => void loadData()}
                disabled={isLoading}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {errorMessage ? <Alert tone="error" message={errorMessage} /> : null}
            {notice ? <Alert tone={notice.type} message={notice.message} /> : null}

            <div className="mt-8 grid gap-6 xl:grid-cols-[24rem_1fr]">
              <section className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Open Tasks
                  </h2>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {tasks.length}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {isLoading ? (
                    <PanelNote text="Loading tasks..." />
                  ) : tasks.length === 0 ? (
                    <PanelNote text="No open tasks available." />
                  ) : (
                    tasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => setSelectedTaskId(task.id)}
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          selectedTaskId === task.id
                            ? "border-slate-950 bg-slate-950 text-white"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <p className="text-sm font-semibold">{task.title}</p>
                        <p className={`mt-1 text-xs uppercase tracking-[0.16em] ${selectedTaskId === task.id ? "text-slate-300" : "text-slate-500"}`}>
                          {task.assignee_name ?? task.assigned_to}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6">
                {!selectedTask ? (
                  <PanelNote text="Select a task to edit it." />
                ) : (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Edit Task
                        </p>
                        <h2 className="mt-1 text-2xl font-semibold text-slate-950">{selectedTask.title}</h2>
                      </div>
                      <Link
                        href="/incidents/tasks/completed"
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                      >
                        Completed Tasks
                      </Link>
                    </div>

                    <label className="block space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Task Title</span>
                      <input
                        value={draft.title}
                        onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                        className="h-11 w-full rounded-xl border border-slate-300 px-4 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Task Detail</span>
                      <textarea
                        rows={5}
                        value={draft.description}
                        onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition focus:border-slate-500"
                      />
                    </label>

                    <div className="grid gap-4 md:grid-cols-3">
                      <label className="block space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Assigned User</span>
                        <select
                          value={draft.assigned_to}
                          onChange={(event) => setDraft((current) => ({ ...current, assigned_to: event.target.value }))}
                          className="h-11 w-full rounded-xl border border-slate-300 px-4 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                        >
                          {users.map((user) => (
                            <option key={user.user_id} value={user.user_id}>
                              {user.full_name ?? user.user_id}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Due Date</span>
                        <input
                          type="datetime-local"
                          value={draft.due_at}
                          onChange={(event) => setDraft((current) => ({ ...current, due_at: event.target.value }))}
                          className="h-11 w-full rounded-xl border border-slate-300 px-4 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</span>
                        <select
                          value={draft.status}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              status: event.target.value as "OPEN" | "DONE",
                            }))
                          }
                          className="h-11 w-full rounded-xl border border-slate-300 px-4 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                        >
                          <option value="OPEN">Open</option>
                          <option value="DONE">Completed</option>
                        </select>
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void handleSaveTask()}
                        disabled={isSaving}
                        className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSaving ? "Saving..." : "Save Task"}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </section>
        </AuthGuard>
      </div>
    </main>
  );
}

function PanelNote({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">{text}</div>;
}

function Alert({
  tone,
  message,
}: {
  tone: "success" | "error";
  message: string;
}) {
  return (
    <div
      className={`mt-6 rounded-2xl px-4 py-3 text-sm ${
        tone === "success"
          ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border border-rose-200 bg-rose-50 text-rose-700"
      }`}
    >
      {message}
    </div>
  );
}

function toDatetimeLocalValue(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}
