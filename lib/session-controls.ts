"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";

export type SessionControlRecord = {
  user_id: string;
  forced_logout_after: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

export async function fetchSessionControlState(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("session_controls")
    .select("user_id, forced_logout_after, updated_at, updated_by")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as SessionControlRecord | null;
}

export async function fetchSessionControlsForUsers(
  supabase: SupabaseClient,
  userIds: string[],
) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

  if (uniqueUserIds.length === 0) {
    return {} as Record<string, SessionControlRecord>;
  }

  const { data, error } = await supabase
    .from("session_controls")
    .select("user_id, forced_logout_after, updated_at, updated_by")
    .in("user_id", uniqueUserIds);

  if (error) {
    throw new Error(error.message);
  }

  return Object.fromEntries(
    ((data ?? []) as SessionControlRecord[]).map((row) => [row.user_id, row]),
  );
}

export async function forceLogoutUserSessions(
  supabase: SupabaseClient,
  payload: {
    userId: string;
    updatedBy: string | null;
  },
) {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("session_controls")
    .upsert(
      {
        user_id: payload.userId,
        forced_logout_after: nowIso,
        updated_at: nowIso,
        updated_by: payload.updatedBy,
      },
      { onConflict: "user_id" },
    )
    .select("user_id, forced_logout_after, updated_at, updated_by")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as SessionControlRecord;
}

export function shouldForceLogoutUser(
  user: Pick<User, "id" | "last_sign_in_at"> | null,
  sessionControl: SessionControlRecord | null,
) {
  if (!user || !sessionControl?.forced_logout_after) {
    return false;
  }

  const forcedAt = Date.parse(sessionControl.forced_logout_after);
  const lastSignInAt = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : 0;

  if (Number.isNaN(forcedAt)) {
    return false;
  }

  return forcedAt > lastSignInAt;
}
