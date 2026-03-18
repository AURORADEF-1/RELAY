import type { SupabaseClient } from "@supabase/supabase-js";

export type RelayNotificationType =
  | "new_ticket"
  | "status_update"
  | "requester_message"
  | "operator_message"
  | "task_assigned";

export type RelayNotificationRecord = {
  id: string;
  user_id: string;
  ticket_id: string | null;
  type: RelayNotificationType;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

type NotificationInsert = {
  user_id: string;
  ticket_id: string | null;
  type: RelayNotificationType;
  title: string;
  body: string;
};

export async function fetchUnreadNotifications(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, user_id, ticket_id, type, title, body, read_at, created_at")
    .eq("user_id", userId)
    .is("read_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as RelayNotificationRecord[];
}

export async function markNotificationsRead(
  supabase: SupabaseClient,
  notificationIds: string[],
) {
  if (notificationIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", notificationIds);

  if (error) {
    throw new Error(error.message);
  }
}

export async function notifyAdminsOfNewTicket(
  supabase: SupabaseClient,
  payload: {
    ticketId: string;
    jobNumber: string | null;
    requesterName: string | null;
    requestSummary: string | null;
  },
) {
  const adminUserIds = await fetchAdminUserIds(supabase);

  if (adminUserIds.length === 0) {
    return;
  }

  const summary =
    payload.requestSummary?.trim() || "A new request is waiting for review.";
  const title = payload.jobNumber
    ? `New request: ${payload.jobNumber}`
    : "New parts request submitted";
  const body = payload.requesterName
    ? `${payload.requesterName} submitted: ${summary}`
    : summary;

  await insertNotifications(
    supabase,
    adminUserIds.map((userId) => ({
      user_id: userId,
      ticket_id: payload.ticketId,
      type: "new_ticket",
      title,
      body,
    })),
  );
}

export async function notifyRequesterStatusChanged(
  supabase: SupabaseClient,
  payload: {
    userId: string | null;
    ticketId: string;
    jobNumber: string | null;
    nextStatus: string;
    requestSummary: string | null;
  },
) {
  if (!payload.userId) {
    return;
  }

  const title = payload.jobNumber
    ? `Status updated: ${payload.jobNumber}`
    : "Request status updated";
  const body = payload.requestSummary?.trim()
    ? `${payload.requestSummary.trim()} is now ${payload.nextStatus}.`
    : `Your request is now ${payload.nextStatus}.`;

  await insertNotifications(supabase, [
    {
      user_id: payload.userId,
      ticket_id: payload.ticketId,
      type: "status_update",
      title,
      body,
    },
  ]);
}

export async function notifyAdminsOfRequesterMessage(
  supabase: SupabaseClient,
  payload: {
    ticketId: string;
    requesterName: string | null;
    jobNumber: string | null;
    requestSummary: string | null;
  },
) {
  const adminUserIds = await fetchAdminUserIds(supabase);

  if (adminUserIds.length === 0) {
    return;
  }

  const title = payload.jobNumber
    ? `Requester chat: ${payload.jobNumber}`
    : "New requester message";
  const body = payload.requesterName
    ? `${payload.requesterName}: ${payload.requestSummary?.trim() || "opened a new chat update."}`
    : payload.requestSummary?.trim() || "A requester sent a new message.";

  await insertNotifications(
    supabase,
    adminUserIds.map((userId) => ({
      user_id: userId,
      ticket_id: payload.ticketId,
      type: "requester_message",
      title,
      body,
    })),
  );
}

export async function notifyRequesterOfOperatorMessage(
  supabase: SupabaseClient,
  payload: {
    userId: string | null;
    ticketId: string;
    jobNumber: string | null;
    assignedTo: string | null;
    requestSummary: string | null;
  },
) {
  if (!payload.userId) {
    return;
  }

  const title = payload.jobNumber
    ? `Operator update: ${payload.jobNumber}`
    : "New operator message";
  const body = payload.assignedTo?.trim()
    ? `${payload.assignedTo.trim()} replied about ${payload.requestSummary?.trim() || "your request"}.`
    : `Stores replied about ${payload.requestSummary?.trim() || "your request"}.`;

  await insertNotifications(supabase, [
    {
      user_id: payload.userId,
      ticket_id: payload.ticketId,
      type: "operator_message",
      title,
      body,
    },
  ]);
}

export async function notifyUserTaskAssigned(
  supabase: SupabaseClient,
  payload: {
    userId: string;
    taskTitle: string;
    taskDescription?: string | null;
  },
) {
  await insertNotifications(supabase, [
    {
      user_id: payload.userId,
      ticket_id: null,
      type: "task_assigned",
      title: `New task assigned: ${payload.taskTitle}`,
      body: payload.taskDescription?.trim() || "A new RELAY task is waiting for you.",
    },
  ]);
}

async function fetchAdminUserIds(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((profile) => profile.id)
    .filter((id): id is string => typeof id === "string");
}

async function insertNotifications(
  supabase: SupabaseClient,
  notifications: NotificationInsert[],
) {
  if (notifications.length === 0) {
    return;
  }

  const { error } = await supabase.from("notifications").insert(notifications);

  if (error) {
    throw new Error(error.message);
  }
}
