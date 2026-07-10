export type TicketUrgencyRecord = {
  status?: string | null;
  assigned_to?: string | null;
  is_urgent?: boolean | null;
  urgent_flagged_at?: string | null;
  urgent_reminder_dismissed_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export function normalizeOperatorName(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

export function isLikelySameOperatorName(assignedTo: string | null | undefined, currentUser: string | null | undefined) {
  const normalizedAssignedTo = normalizeOperatorName(assignedTo);
  const normalizedCurrentUser = normalizeOperatorName(currentUser);

  if (!normalizedAssignedTo || !normalizedCurrentUser) {
    return false;
  }

  return normalizedAssignedTo === normalizedCurrentUser;
}

export function isUrgentTicket(ticket: TicketUrgencyRecord) {
  return Boolean(ticket.is_urgent);
}

export function shouldShowUrgentReminder(
  ticket: TicketUrgencyRecord,
  currentUserDisplayName: string | null | undefined,
) {
  return (
    isUrgentTicket(ticket) &&
    !ticket.urgent_reminder_dismissed_at &&
    isLikelySameOperatorName(ticket.assigned_to, currentUserDisplayName)
  );
}

export function getTicketPriorityLevel(ticket: TicketUrgencyRecord) {
  if (ticket.status === "PENDING") {
    return 0;
  }

  if (isUrgentTicket(ticket)) {
    return 1;
  }

  return 2;
}

export function getTicketPriorityTimestamp(ticket: TicketUrgencyRecord) {
  if (ticket.status === "PENDING") {
    return ticket.created_at ?? ticket.updated_at ?? "";
  }

  if (isUrgentTicket(ticket)) {
    return ticket.urgent_flagged_at ?? ticket.updated_at ?? ticket.created_at ?? "";
  }

  return ticket.updated_at ?? ticket.created_at ?? "";
}

export function compareTicketsByPriority(left: TicketUrgencyRecord, right: TicketUrgencyRecord) {
  const leftPriority = getTicketPriorityLevel(left);
  const rightPriority = getTicketPriorityLevel(right);

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return new Date(getTicketPriorityTimestamp(right)).getTime() - new Date(getTicketPriorityTimestamp(left)).getTime();
}

export function shouldRetryWithoutUrgentFields(error: { message?: string } | null | undefined) {
  const message = (error?.message ?? "").toLowerCase();

  return (
    message.includes("is_urgent") ||
    message.includes("urgent_flagged_at") ||
    message.includes("urgent_flagged_by") ||
    message.includes("urgent_reminder_dismissed_at") ||
    message.includes("urgent_reminder_dismissed_by") ||
    message.includes("schema cache") ||
    message.includes("column")
  );
}
