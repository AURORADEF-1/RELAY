"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";
import {
  fetchAssignedTasks,
  markTaskDone,
  markTasksReadForUser,
  type UserTaskRecord,
} from "@/lib/user-tasks";

export default function TasksPage() {
  const { requesterUnreadCount, adminBadgeCount, isAdmin, taskUnreadCount } = useNotifications();
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

      await markTasksReadForUser(supabase, user.id);
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
    <main className="aurora-shell">
      <div className="aurora-shell-inner max-w-6xl space-y-8">
        <nav className="aurora-nav">
          <RelayLogo />
          <div className="aurora-nav-links text-sm font-medium">
            <Link href="/" className="aurora-link">Home</Link>
            <Link href="/legal" className="aurora-link">Legal</Link>
            <Link href="/settings" className="aurora-link">Settings</Link>
            <Link href="/submit" className="aurora-link">Submit Ticket</Link>
            <Link href="/requests" className="aurora-link">
              My Requests
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
            <Link href="/tasks" className="aurora-link aurora-link-active">
              Tasks
              <NotificationBadge count={taskUnreadCount} />
            </Link>
            {isAdmin ? (
              <>
                <Link href="/incidents" className="aurora-link">Workshop Control</Link>
                <Link href="/admin" className="aurora-link">
                  Parts Control
                  <NotificationBadge count={adminBadgeCount} />
                </Link>
              </>
            ) : null}
            <ThemeToggleButton />
            <LogoutButton />
          </div>
        </nav>

        <AuthGuard>
          <section className="aurora-section sm:p-10">
            <div className="space-y-5">
              <div className="aurora-kicker">
                Assigned Work
              </div>
              <h1 className="aurora-title text-4xl sm:text-5xl">
                My Tasks
              </h1>
              <p className="max-w-3xl aurora-copy">
                Tasks assigned by the parts and workshop control team.
              </p>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => void loadTasks()}
                disabled={isLoading}
                className="aurora-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {errorMessage ? (
              <div className="aurora-alert aurora-alert-error mt-6">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-8 grid gap-4">
              {isLoading ? (
                <div className="aurora-empty">
                  Loading tasks...
                </div>
              ) : tasks.length === 0 ? (
                <div className="aurora-empty">
                  No assigned tasks yet.
                </div>
              ) : (
                tasks.map((task) => (
                  <article
                    key={task.id}
                    className="aurora-panel p-6"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <p className="text-lg font-semibold text-[color:var(--foreground-strong)]">{task.title}</p>
                        <p className="text-sm leading-7 text-[color:var(--foreground-muted)]">
                          {task.description || "No task detail provided."}
                        </p>
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                          {task.status} {task.due_at ? `· Due ${formatDate(task.due_at)}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleMarkDone(task.id)}
                        disabled={task.status === "DONE" || workingTaskId === task.id}
                        className="aurora-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
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
