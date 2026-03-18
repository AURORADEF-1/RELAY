"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";
import { fetchAssignedTasks, markTaskDone, type UserTaskRecord } from "@/lib/user-tasks";

export default function TasksPage() {
  const { requesterUnreadCount, adminBadgeCount, isAdmin } = useNotifications();
  const [tasks, setTasks] = useState<UserTaskRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [workingTaskId, setWorkingTaskId] = useState<string | null>(null);

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

      const { user } = await getCurrentUserWithRole(supabase);

      if (!user) {
        setErrorMessage("Sign in to view your tasks.");
        setIsLoading(false);
        return;
      }

      const nextTasks = await fetchAssignedTasks(supabase, user.id);
      setTasks(nextTasks.filter((task) => task.status === "OPEN"));
      setIsLoading(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load tasks.");
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTasks();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadTasks]);

  async function handleMarkDone(taskId: string) {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      return;
    }

    setWorkingTaskId(taskId);
    try {
      await markTaskDone(supabase, taskId);
      await loadTasks();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update task.");
    } finally {
      setWorkingTaskId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-8">
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
            <Link href="/tasks" className="rounded-full bg-slate-950 px-4 py-2 text-white hover:bg-slate-800">
              Tasks
            </Link>
            {isAdmin ? (
              <>
                <Link href="/incidents" className="rounded-full px-4 py-2 hover:bg-white">Workshop Control</Link>
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
                Assigned Work
              </div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                My Tasks
              </h1>
              <p className="max-w-3xl text-base leading-8 text-slate-600">
                Tasks assigned by the parts and workshop control team.
              </p>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => void loadTasks()}
                disabled={isLoading}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {errorMessage ? (
              <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-8 grid gap-4">
              {isLoading ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                  Loading tasks...
                </div>
              ) : tasks.length === 0 ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                  No assigned tasks yet.
                </div>
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
                          {task.status} {task.due_at ? `· Due ${formatDate(task.due_at)}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleMarkDone(task.id)}
                        disabled={task.status === "DONE" || workingTaskId === task.id}
                        className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {task.status === "DONE"
                          ? "Completed"
                          : workingTaskId === task.id
                            ? "Saving..."
                            : "Mark Done"}
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
