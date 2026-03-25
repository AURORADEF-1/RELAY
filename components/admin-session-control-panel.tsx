"use client";

import { useCallback, useEffect, useState } from "react";
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
    <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-8 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.2)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-amber-300 bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-800">
            Admin Control
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
            Session Tools
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-8 text-slate-700">
            End active sessions for other users when RELAY becomes unhealthy or stale clients need to be cleared out.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadManagedUsers()}
          disabled={isLoading}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Refreshing..." : "Refresh Users"}
        </button>
      </div>

      {notice ? (
        <div
          className={`mt-6 rounded-2xl px-4 py-3 text-sm ${
            notice.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3">
        {isLoading ? (
          <div className="rounded-2xl border border-amber-200 bg-white px-4 py-4 text-sm text-slate-600">
            Loading users...
          </div>
        ) : managedUsers.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-white px-4 py-4 text-sm text-slate-600">
            No users available for session control.
          </div>
        ) : (
          managedUsers.map((user) => {
            const sessionControl = sessionControlsByUserId[user.user_id];
            const isCurrentUser = user.user_id === currentUserId;

            return (
              <article
                key={user.user_id}
                className="rounded-2xl border border-amber-200 bg-white px-4 py-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-950">
                      {user.full_name || user.user_id}
                    </p>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      {user.role || "user"} · {user.is_active ? "active" : "inactive"}
                    </p>
                    <p className="text-sm text-slate-600">
                      Last seen {user.last_seen_at ? formatControlDateTime(user.last_seen_at) : "not recently"}
                    </p>
                    {sessionControl?.forced_logout_after ? (
                      <p className="text-xs text-amber-700">
                        Last session end request: {formatControlDateTime(sessionControl.forced_logout_after)}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleForceSessionEnd(user.user_id)}
                    disabled={isCurrentUser || sessionActionUserId === user.user_id}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-rose-300 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
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
