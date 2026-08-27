import { getAdminAssignmentLabel } from "@/lib/admin-assignees";

export type TicketChatSenderRole = "admin" | "requester";

export type TicketChatScope = "mine" | "queue" | "all";

export type TicketChatTicket = {
  id: string;
  user_id: string | null;
  visible_to_user_id?: string | null;
  assigned_to: string | null;
  status: string | null;
  updated_at: string | null;
};

export type TicketChatThreadSortRecord = {
  ticket: Pick<TicketChatTicket, "updated_at">;
  unreadCount: number;
  lastMessageAt: string | null;
};

export function getTicketChatSenderRole(
  isAdmin: boolean,
): TicketChatSenderRole {
  return isAdmin ? "admin" : "requester";
}

export function buildTicketChatSubject(
  jobNumber: string | null | undefined,
  ticketId: string,
) {
  return `Job ${jobNumber?.trim() || ticketId}`;
}

export function shouldShowGlobalTicketChat(pathname: string) {
  return !(
    pathname === "/login" ||
    pathname === "/legal" ||
    pathname === "/wallboard" ||
    pathname.startsWith("/tickets/")
  );
}

export function isTicketChatRelevantToUser(
  ticket: TicketChatTicket,
  context: {
    userId: string;
    operatorName: string | null;
    isAdmin: boolean;
    canViewAll: boolean;
    scope: TicketChatScope;
  },
) {
  if (!context.isAdmin) {
    return (
      ticket.user_id === context.userId ||
      ticket.visible_to_user_id === context.userId
    );
  }

  if (context.scope === "all") {
    return context.canViewAll;
  }

  const assignmentKey = getAdminAssignmentLabel(ticket.assigned_to ?? "").toLowerCase();

  if (context.scope === "queue") {
    return !assignmentKey;
  }

  const operatorKey = getAdminAssignmentLabel(context.operatorName ?? "").toLowerCase();
  return Boolean(operatorKey) && assignmentKey === operatorKey;
}

export function compareTicketChatThreads(
  left: TicketChatThreadSortRecord,
  right: TicketChatThreadSortRecord,
) {
  if (left.unreadCount !== right.unreadCount) {
    return right.unreadCount - left.unreadCount;
  }

  const leftActivity = left.lastMessageAt ?? left.ticket.updated_at ?? "";
  const rightActivity = right.lastMessageAt ?? right.ticket.updated_at ?? "";
  return new Date(rightActivity).getTime() - new Date(leftActivity).getTime();
}

export function getTicketChatUnreadCount({
  messages,
  currentUserId,
  lastReadAt,
  notificationCount,
}: {
  messages: Array<{
    sender_user_id: string | null;
    created_at: string | null;
  }>;
  currentUserId: string;
  lastReadAt: string | null;
  notificationCount: number;
}) {
  if (!lastReadAt) {
    return notificationCount;
  }

  const lastReadTime = new Date(lastReadAt).getTime();
  return messages.filter((message) => {
    if (message.sender_user_id === currentUserId || !message.created_at) {
      return false;
    }

    return new Date(message.created_at).getTime() > lastReadTime;
  }).length;
}
