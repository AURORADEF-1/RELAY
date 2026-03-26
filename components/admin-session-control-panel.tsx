"use client";

import { useCallback, useEffect, useState } from "react";
import { recordAdminHealthEvent } from "@/lib/admin-health";
import {
  fetchSessionControlsForUsers,
  forceLogoutUserSessions,
  type SessionControlRecord,
} from "@/lib/session-controls";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";
import { fetchUsersWithPresence, type UserDirectoryRecord } from "@/lib/user-tasks";

export function AdminSessionControlPanel() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [managedUsers, setManagedUsers] = useState<UserDirectoryRecord[]>([]);
  const [sessionControlsByUserId, setSessionControlsByUserId] = useState<
    Record<string, SessionControlRecord>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [sessionActionUserId, setSessionActionUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const loadManagedUsers = useCallback(async () => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setNotice({
        type: "error",
        message: "Supabase environment variables are not configured.",
      });
      recordAdminHealthEvent("session_control", "Supabase environment variables are not configured for session control.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const { user, isAdmin } = await getCurrentUserWithRole(supabase);

      if (!user || !isAdmin) {
        setNotice({
          type: "error",
          message: "Admin access is required for session controls.",
        });
        recordAdminHealthEvent("session_control", "Admin access failed for session control.");
        setIsLoading(false);
        return;
      }

      setCurrentUserId(user.id);

      const users = await fetchUsersWithPresence(supabase);
      const sessionControls = await fetchSessionControlsForUsers(
        supabase,
        users.map((managedUser) => managedUser.user_id),
      );

      setManagedUsers(users);
      setSessionControlsByUserId(sessionControls);
      setNotice(null);
    } catch (error) {
      recordAdminHealthEvent("session_control", "Failed to load session-managed users.");
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to load session-managed users.",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadManagedUsers();
  }, [loadManagedUsers]);

  async function handleForceSessionEnd(targetUserId: string) {
    const supabase = getSupabaseClient();

    if (!supabase || !currentUserId) {
      recordAdminHealthEvent("session_control", "Session control action blocked because the current admin session is unavailable.");
      setNotice({
        type: "error",
        message: "Unable to control sessions right now.",
      });
      return;
    }

    setSessionActionUserId(targetUserId);
    setNotice(null);

    try {
      const control = await forceLogoutUserSessions(supabase, {
        userId: targetUserId,
        updatedBy: currentUserId,
      });

      setSessionControlsByUserId((current) => ({
        ...current,
        [targetUserId]: control,
      }));
      setNotice({
        type: "success",
        message: "Session end request sent.",
      });
    } catch (error) {
      recordAdminHealthEvent("session_control", "Failed to end a user session.");
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to end the user session.",
      });
    } finally {
      setSessionActionUserId(null);
    }
  }

  return (
    <section className="aurora-section">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="aurora-kicker">
            Admin Control
          </div>
          <h1 className="mt-4 aurora-heading text-4xl sm:text-5xl">
            Session Tools
          </h1>
          <p className="mt-3 max-w-3xl aurora-copy">
            End active sessions for other users when RELAY becomes unhealthy or stale clients need to be cleared out.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadManagedUsers()}
          disabled={isLoading}
          className="aurora-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Refreshing..." : "Refresh Users"}
        </button>
      </div>

      {notice ? (
        <div
          className={`mt-6 ${
            notice.type === "success"
              ? "aurora-alert aurora-alert-success"
              : "aurora-alert aurora-alert-error"
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3">
        {isLoading ? (
          <div className="aurora-empty">
            Loading users...
          </div>
        ) : managedUsers.length === 0 ? (
          <div className="aurora-empty">
            No users available for session control.
          </div>
        ) : (
          managedUsers.map((user) => {
            const sessionControl = sessionControlsByUserId[user.user_id];
            const isCurrentUser = user.user_id === currentUserId;

            return (
              <article
                key={user.user_id}
                className="rounded-[1.25rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] px-4 py-4 shadow-[var(--shadow-soft)]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">
                      {user.full_name || user.user_id}
                    </p>
                    <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--foreground-subtle)]">
                      {user.role || "user"} · {user.is_active ? "active" : "inactive"}
                    </p>
                    <p className="text-sm text-[color:var(--foreground-muted)]">
                      Last seen {user.last_seen_at ? formatControlDateTime(user.last_seen_at) : "not recently"}
                    </p>
                    {sessionControl?.forced_logout_after ? (
                      <p className="text-xs text-[color:var(--warning)]">
                        Last session end request: {formatControlDateTime(sessionControl.forced_logout_after)}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleForceSessionEnd(user.user_id)}
                    disabled={isCurrentUser || sessionActionUserId === user.user_id}
                    className="aurora-button-danger disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCurrentUser
                      ? "Current Session"
                      : sessionActionUserId === user.user_id
                        ? "Ending..."
                        : "End Session"}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function formatControlDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
