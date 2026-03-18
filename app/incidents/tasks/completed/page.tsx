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
  deleteUserTask,
  fetchCompletedTasksForAdmin,
  fetchUsersWithPresence,
  type UserTaskRecord,
} from "@/lib/user-tasks";

export default function CompletedTasksPage() {
  const { requesterUnreadCount, adminBadgeCount, isAdmin } = useNotifications();
  const [tasks, setTasks] = useState<UserTaskRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [workingTaskId, setWorkingTaskId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState("");

  const loadTasks = useCallback(async () => {
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
        setErrorMessage("Admin access is required to view completed tasks.");
        setIsLoading(false);
        return;
      }

      const [nextTasks, users] = await Promise.all([
        fetchCompletedTasksForAdmin(supabase),
        fetchUsersWithPresence(supabase),
      ]);

      setTasks(
        nextTasks.map((task) => {
          const assignee = users.find((person) => person.user_id === task.assigned_to);
          return {
            ...task,
            assignee_name: assignee?.full_name ?? task.assigned_to,
          };
        }),
      );
      setIsLoading(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load completed tasks.");
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTasks();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadTasks]);

  async function handleDeleteTask(task: UserTaskRecord) {
    const confirmed = window.confirm(`Delete completed task "${task.title}" permanently?`);

    if (!confirmed) {
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setNotice({ type: "error", message: "Supabase environment variables are not configured." });
      return;
    }

    setWorkingTaskId(task.id);
    setNotice(null);

    try {
      await deleteUserTask(supabase, task.id);
      setTasks((current) => current.filter((currentTask) => currentTask.id !== task.id));
      setNotice({ type: "success", message: `Deleted completed task "${task.title}".` });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to delete task.",
      });
    } finally {
      setWorkingTaskId(null);
    }
  }

  function handleExportTasks() {
    if (tasks.length === 0) {
      setNotice({ type: "error", message: "There are no completed tasks to export." });
      return;
    }

    const csvRows = [
      ["completed_at", "title", "description", "assigned_to", "created_at", "due_at"],
      ...tasks.map((task) => [
        task.updated_at,
        task.title,
        task.description,
        task.assignee_name ?? task.assigned_to,
        task.created_at,
        task.due_at,
      ]),
    ];

    const csvContent = csvRows
      .map((row) => row.map((value) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `relay-completed-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(downloadUrl);

    setNotice({
      type: "success",
      message: `Exported ${tasks.length} completed task${tasks.length === 1 ? "" : "s"}.`,
    });
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
                Task Archive
              </div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                Completed Tasks
              </h1>
              <p className="max-w-3xl text-base leading-8 text-slate-600">
                Completed user tasks are archived here for admin review, export, and cleanup.
              </p>
            </div>

            <div className="mt-8">
              <WorkshopIncidentsTabs activeTab="completedTasks" />
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={handleExportTasks}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => void loadTasks()}
                disabled={isLoading}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {errorMessage ? <Alert tone="error" message={errorMessage} /> : null}
            {notice ? <Alert tone={notice.type} message={notice.message} /> : null}

            <div className="mt-8 space-y-4">
              {isLoading ? (
                <PanelNote text="Loading completed tasks..." />
              ) : tasks.length === 0 ? (
                <PanelNote text="No completed tasks archived yet." />
              ) : (
                tasks.map((task) => (
                  <article
                    key={task.id}
                    className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <p className="text-lg font-semibold text-slate-950">{task.title}</p>
                        <p className="text-sm leading-7 text-slate-600">
                          {task.description || "No task detail provided."}
                        </p>
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                          Completed {formatDate(task.updated_at)} · {task.assignee_name ?? task.assigned_to}
                        </p>
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                          {task.read_at ? `Read ${formatDate(task.read_at)}` : "Not opened before completion"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteTask(task)}
                        disabled={workingTaskId === task.id}
                        className="inline-flex h-11 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {workingTaskId === task.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </article>
                ))
              )}
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
