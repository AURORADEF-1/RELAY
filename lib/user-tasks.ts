"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ActiveUserPresence = {
  user_id: string;
  full_name: string | null;
  username: string | null;
  role: string | null;
  last_seen_at: string;
};

export type UserTaskRecord = {
  id: string;
  title: string;
  description: string | null;
  status: "OPEN" | "DONE";
  assigned_to: string;
  assigned_by: string | null;
  created_at: string;
  updated_at: string;
  due_at: string | null;
  assignee_name?: string | null;
};

const PRESENCE_HEARTBEAT_MS = 60_000;

export async function upsertUserPresence(
  supabase: SupabaseClient,
  userId: string,
) {
  const { error } = await supabase.from("user_presence").upsert(
    {
      user_id: userId,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export function getPresenceHeartbeatMs() {
  return PRESENCE_HEARTBEAT_MS;
}

export async function fetchRecentlyActiveUsers(supabase: SupabaseClient) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("user_presence")
    .select(
      "user_id, last_seen_at, profiles:profiles!user_presence_user_id_fkey(full_name, username, role)",
    )
    .gte("last_seen_at", since)
    .order("last_seen_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<{
    user_id: string;
    last_seen_at: string;
    profiles:
      | {
          full_name: string | null;
          username: string | null;
          role: string | null;
        }
      | {
          full_name: string | null;
          username: string | null;
          role: string | null;
        }[]
      | null;
  }>).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

    return {
      user_id: row.user_id,
      full_name: profile?.full_name ?? null,
      username: profile?.username ?? null,
      role: profile?.role ?? null,
      last_seen_at: row.last_seen_at,
    } satisfies ActiveUserPresence;
  });
}

export async function createUserTask(
  supabase: SupabaseClient,
  payload: {
    title: string;
    description?: string;
    assignedTo: string;
    assignedBy: string | null;
    dueAt?: string | null;
  },
) {
  const { data, error } = await supabase
    .from("user_tasks")
    .insert({
      title: payload.title,
      description: payload.description?.trim() || null,
      status: "OPEN",
      assigned_to: payload.assignedTo,
      assigned_by: payload.assignedBy,
      due_at: payload.dueAt ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as UserTaskRecord;
}

export async function fetchAssignedTasks(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("user_tasks")
    .select("*")
    .eq("assigned_to", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as UserTaskRecord[];
}

export async function fetchOpenTasksForAdmin(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("user_tasks")
    .select(
      "id, title, description, status, assigned_to, assigned_by, created_at, updated_at, due_at, profiles:profiles!user_tasks_assigned_to_fkey(full_name, username)",
    )
    .eq("status", "OPEN")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<
    UserTaskRecord & {
      profiles:
        | { full_name: string | null; username: string | null }
        | { full_name: string | null; username: string | null }[]
        | null;
    }
  >).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      assigned_to: row.assigned_to,
      assigned_by: row.assigned_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      due_at: row.due_at,
      assignee_name: profile?.full_name ?? profile?.username ?? null,
    } satisfies UserTaskRecord;
  });
}

export async function markTaskDone(supabase: SupabaseClient, taskId: string) {
  const { error } = await supabase
    .from("user_tasks")
    .update({
      status: "DONE",
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  if (error) {
    throw new Error(error.message);
  }
}
