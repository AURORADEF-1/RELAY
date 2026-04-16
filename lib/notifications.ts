import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRequesterReadyNotificationLine } from "@/lib/ticket-operational";

export type RelayNotificationType =
  | "new_ticket"
  | "status_update"
  | "requester_message"
  | "operator_message"
  | "task_assigned"
  | "ready_reminder"
  | "ready_for_collection"
  | "part_collected"
  | "part_returned";

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

const ADMIN_USER_CACHE_TTL_MS = 30_000;

let cachedAdminUserIds: string[] | null = null;
let cachedAdminUserIdsAt = 0;
let adminUserIdsRequest: Promise<string[]> | null = null;

function clampNotificationText(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

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
    assignedTo?: string | null;
    binLocation?: string | null;
  },
) {
  if (!payload.userId) {
    return;
  }

  const title =
    payload.nextStatus === "READY"
      ? payload.jobNumber
        ? `Ready to collect: ${payload.jobNumber}`
        : "Parts ready to collect"
      : payload.jobNumber
        ? `Status updated: ${payload.jobNumber}`
        : "Request status updated";
  const readyBinLine = buildRequesterReadyNotificationLine(payload.binLocation);
  const body =
    payload.nextStatus === "IN_PROGRESS"
      ? payload.assignedTo?.trim()
        ? `${payload.requestSummary?.trim() || "Your parts request"} is now IN_PROGRESS: ${payload.assignedTo.trim()}.`
        : `${payload.requestSummary?.trim() || "Your parts request"} is now IN_PROGRESS.`
      : payload.nextStatus === "READY"
        ? `${payload.requestSummary?.trim() || "Your request"} is READY. Please collect from Stores.${readyBinLine ? ` ${readyBinLine}` : ""}`
        : payload.requestSummary?.trim()
          ? `${payload.requestSummary.trim()} is now ${payload.nextStatus}.`
          : `Your request is now ${payload.nextStatus}.`;
  const type = payload.nextStatus === "READY" ? "ready_for_collection" : "status_update";

  await insertNotifications(supabase, [
    {
      user_id: payload.userId,
      ticket_id: payload.ticketId,
      type,
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
    messageText?: string | null;
  },
) {
  if (!payload.userId) {
    return;
  }

  const title = payload.jobNumber
    ? `Admin reply: ${payload.jobNumber}`
    : "New admin reply";
  const senderLabel = payload.assignedTo?.trim() || "Stores";
  const body = payload.messageText?.trim()
    ? `${senderLabel}: ${clampNotificationText(payload.messageText, 240)}`
    : `${senderLabel} sent a new reply.`;

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

export async function ensureReadyReminderNotifications(
  supabase: SupabaseClient,
  userId: string,
) {
  const reminderCutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: readyTickets, error: ticketError } = await supabase
    .from("tickets")
    .select("id, job_number, request_summary, request_details")
    .eq("user_id", userId)
    .eq("status", "READY")
    .lte("updated_at", reminderCutoffIso);

  if (ticketError) {
    throw new Error(ticketError.message);
  }

  const tickets = readyTickets ?? [];

  if (tickets.length === 0) {
    return;
  }

  const ticketIds = tickets
    .map((ticket) => (typeof ticket.id === "string" ? ticket.id : null))
    .filter((ticketId): ticketId is string => Boolean(ticketId));

  const { data: existingReminders, error: reminderError } = await supabase
    .from("notifications")
    .select("ticket_id")
    .eq("user_id", userId)
    .eq("type", "ready_reminder")
    .in("ticket_id", ticketIds);

  if (reminderError) {
    throw new Error(reminderError.message);
  }

  const existingTicketIds = new Set(
    (existingReminders ?? [])
      .map((notification) => notification.ticket_id)
      .filter((ticketId): ticketId is string => typeof ticketId === "string"),
  );

  await insertNotifications(
    supabase,
    tickets
      .filter((ticket) => typeof ticket.id === "string" && !existingTicketIds.has(ticket.id))
      .map((ticket) => ({
        user_id: userId,
        ticket_id: ticket.id as string,
        type: "ready_reminder" as const,
        title: ticket.job_number
          ? `Ready reminder: ${ticket.job_number}`
          : "Your parts are ready",
        body: `${ticket.request_summary ?? ticket.request_details ?? "Your request"} has been READY for over a day.`,
      })),
  );
}

export async function notifyAdminsOfPartCollected(
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
    ? `Part collected: ${payload.jobNumber}`
    : "Part collected";
  const body = payload.requesterName?.trim()
    ? `${payload.requesterName.trim()} collected the part. Do you want to complete the job?`
    : `A part was collected for ${payload.requestSummary?.trim() || "a request"}. Do you want to complete the job?`;

  const { data: existingNotifications, error: existingNotificationError } = await supabase
    .from("notifications")
    .select("id")
    .eq("ticket_id", payload.ticketId)
    .eq("type", "part_collected")
    .is("read_at", null)
    .limit(1);

  if (existingNotificationError) {
    throw new Error(existingNotificationError.message);
  }

  if ((existingNotifications ?? []).length > 0) {
    return;
  }

  await insertNotifications(
    supabase,
    adminUserIds.map((userId) => ({
      user_id: userId,
      ticket_id: payload.ticketId,
      type: "part_collected",
      title: clampNotificationText(title, 120),
      body: clampNotificationText(body, 240),
    })),
  );
}

export async function notifyAdminsOfPartReturned(
  supabase: SupabaseClient,
  payload: {
    ticketId: string;
    requesterName: string | null;
    jobNumber: string | null;
    requestSummary: string | null;
    reason: string;
  },
) {
  const adminUserIds = await fetchAdminUserIds(supabase);

  if (adminUserIds.length === 0) {
    return;
  }

  const title = payload.jobNumber
    ? `Part returned: ${payload.jobNumber}`
    : "Part return requested";
  const body = payload.requesterName?.trim()
    ? `${payload.requesterName.trim()} requested a part return. Reason: ${payload.reason.trim()}`
    : `${payload.requestSummary?.trim() || "A request"} was returned. Reason: ${payload.reason.trim()}`;

  await insertNotifications(
    supabase,
    adminUserIds.map((userId) => ({
      user_id: userId,
      ticket_id: payload.ticketId,
      type: "part_returned",
      title: clampNotificationText(title, 120),
      body: clampNotificationText(body, 240),
    })),
  );
}

async function fetchAdminUserIds(supabase: SupabaseClient) {
  const now = Date.now();

  if (
    cachedAdminUserIds &&
    now - cachedAdminUserIdsAt < ADMIN_USER_CACHE_TTL_MS
  ) {
    return cachedAdminUserIds;
  }

  if (adminUserIdsRequest) {
    return adminUserIdsRequest;
  }

  adminUserIdsRequest = (async () => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin");

  if (error) {
      adminUserIdsRequest = null;
    throw new Error(error.message);
  }

    const nextAdminUserIds = (data ?? [])
      .map((profile) => profile.id)
      .filter((id): id is string => typeof id === "string");

    cachedAdminUserIds = nextAdminUserIds;
    cachedAdminUserIdsAt = Date.now();
    adminUserIdsRequest = null;
    return nextAdminUserIds;
  })().catch((error: unknown) => {
    adminUserIdsRequest = null;
    throw error;
  });

  return adminUserIdsRequest;
}

async function insertNotifications(
  supabase: SupabaseClient,
  notifications: NotificationInsert[],
) {
  if (notifications.length === 0) {
    return;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;

  if (!accessToken) {
    throw new Error("Authentication is required to dispatch notifications.");
  }

  const response = await fetch("/api/notifications/dispatch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      notifications,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string };

  if (response.ok) {
    return;
  }

  const dispatchErrorMessage = payload.error || "Notification dispatch failed.";
  const currentUserId = session?.user?.id ?? null;
  const isSelfNotificationTarget =
    currentUserId !== null &&
    notifications.every((notification) => notification.user_id === currentUserId);

  let canUseDirectInsertFallback = isSelfNotificationTarget;

  if (!canUseDirectInsertFallback && currentUserId) {
    const { data: currentProfile, error: currentProfileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", currentUserId)
      .maybeSingle<{ role?: string | null }>();

    if (currentProfileError) {
      throw new Error(dispatchErrorMessage);
    }

    canUseDirectInsertFallback =
      (currentProfile?.role ?? "").trim().toLowerCase() === "admin";
  }

  if (!canUseDirectInsertFallback) {
    throw new Error(dispatchErrorMessage);
  }

  const { error: directInsertError } = await supabase
    .from("notifications")
    .insert(notifications);

  if (directInsertError) {
    throw new Error(`${dispatchErrorMessage} Direct insert fallback failed: ${directInsertError.message}`);
  }
}
