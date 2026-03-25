"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ActiveUserPresence = {
  user_id: string;
  full_name: string | null;
  role: string | null;
  last_seen_at: string;
};

export type UserDirectoryRecord = {
  user_id: string;
  full_name: string | null;
  role: string | null;
  last_seen_at: string | null;
  is_active: boolean;
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
  read_at?: string | null;
  completed_at?: string | null;
  assignee_name?: string | null;
};

const PRESENCE_HEARTBEAT_MS = 5 * 60_000;

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
      "user_id, last_seen_at, profiles:profiles!user_presence_user_id_fkey(full_name, role)",
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
          role: string | null;
        }
      | {
          full_name: string | null;
          role: string | null;
        }[]
      | null;
  }>).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

    return {
      user_id: row.user_id,
      full_name: profile?.full_name ?? null,
      role: profile?.role ?? null,
      last_seen_at: row.last_seen_at,
    } satisfies ActiveUserPresence;
  });
}

export async function fetchUsersWithPresence(supabase: SupabaseClient) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [{ data: profilesData, error: profilesError }, { data: presenceData, error: presenceError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, role")
        .order("full_name", { ascending: true }),
      supabase
        .from("user_presence")
        .select("user_id, last_seen_at")
        .gte("last_seen_at", since)
        .order("last_seen_at", { ascending: false }),
    ]);

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  if (presenceError) {
    throw new Error(presenceError.message);
  }

  const presenceMap = new Map(
    ((presenceData ?? []) as Array<{ user_id: string; last_seen_at: string }>).map((row) => [
      row.user_id,
      row.last_seen_at,
    ]),
  );

  return ((profilesData ?? []) as Array<{
    id: string;
    full_name: string | null;
    role: string | null;
  }>)
    .map((profile) => ({
      user_id: profile.id,
      full_name: profile.full_name ?? null,
      role: profile.role ?? null,
      last_seen_at: presenceMap.get(profile.id) ?? null,
      is_active: presenceMap.has(profile.id),
    }))
    .sort((left, right) => {
      if (left.is_active !== right.is_active) {
        return left.is_active ? -1 : 1;
      }

      const leftName = left.full_name ?? left.user_id;
      const rightName = right.full_name ?? right.user_id;
      return leftName.localeCompare(rightName);
    }) satisfies UserDirectoryRecord[];
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
      read_at: null,
      completed_at: null,
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
    .eq("status", "OPEN")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as UserTaskRecord[];
}

export async function fetchOpenTasksForAdmin(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("user_tasks")
    .select("id, title, description, status, assigned_to, assigned_by, created_at, updated_at, due_at, read_at, completed_at")
    .eq("status", "OPEN")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as UserTaskRecord[];
}

export async function fetchCompletedTasksForAdmin(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("user_tasks")
    .select("id, title, description, status, assigned_to, assigned_by, created_at, updated_at, due_at, read_at, completed_at")
    .eq("status", "DONE")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as UserTaskRecord[];
}

export async function updateUserTask(
  supabase: SupabaseClient,
  taskId: string,
  payload: {
    title?: string;
    description?: string | null;
    assigned_to?: string;
    due_at?: string | null;
    status?: "OPEN" | "DONE";
  },
) {
  const updatePayload: Record<string, string | null> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof payload.title === "string") {
    updatePayload.title = payload.title.trim();
  }

  if (payload.description !== undefined) {
    updatePayload.description = payload.description?.trim() || null;
  }

  if (typeof payload.assigned_to === "string") {
    updatePayload.assigned_to = payload.assigned_to;
  }

  if (payload.due_at !== undefined) {
    updatePayload.due_at = payload.due_at || null;
  }

  if (payload.status) {
    updatePayload.status = payload.status;
  }

  const { data, error } = await supabase
    .from("user_tasks")
    .update(updatePayload)
    .eq("id", taskId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as UserTaskRecord;
}

export async function deleteUserTask(supabase: SupabaseClient, taskId: string) {
  const { data, error } = await supabase
    .from("user_tasks")
    .delete()
    .eq("id", taskId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Task could not be deleted. Check user_tasks delete permissions.");
  }
}

export async function markTaskDone(supabase: SupabaseClient, taskId: string) {
  const { data, error } = await supabase
    .from("user_tasks")
    .update({
      status: "DONE",
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Task could not be updated. Check user_tasks update permissions.");
  }
}

export async function fetchUnreadTaskCount(
  supabase: SupabaseClient,
  userId: string,
) {
  const { count, error } = await supabase
    .from("user_tasks")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", userId)
    .eq("status", "OPEN")
    .is("read_at", null);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function markTasksReadForUser(
  supabase: SupabaseClient,
  userId: string,
) {
  const { error } = await supabase
    .from("user_tasks")
    .update({
      read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("assigned_to", userId)
    .eq("status", "OPEN")
    .is("read_at", null);

  if (error) {
    throw new Error(error.message);
  }
}
