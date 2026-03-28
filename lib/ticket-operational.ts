import type { TicketStatus } from "@/lib/statuses";

export type TicketOperationalFields = {
  expected_delivery_date?: string | null;
  lead_time_note?: string | null;
  ordered_at?: string | null;
  ordered_by?: string | null;
  bin_location?: string | null;
  ready_at?: string | null;
  ready_by?: string | null;
  overdue_reminder_dismissed_at?: string | null;
  overdue_reminder_dismissed_by?: string | null;
};

export type TicketOperationalRecord = TicketOperationalFields & {
  id: string;
  job_number?: string | null;
  status: string | null;
};

export type StatusWorkflowRequirement = "ordered" | "ready";

export function getStatusWorkflowRequirement(
  previousStatus: string | null | undefined,
  nextStatus: string | null | undefined,
): StatusWorkflowRequirement | null {
  if (nextStatus === "ORDERED") {
    return "ordered";
  }

  if (previousStatus === "ORDERED" && nextStatus === "READY") {
    return "ready";
  }

  return null;
}

export function toDateInputValue(value?: string | null) {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

export function isTicketOrderOverdue(ticket: TicketOperationalRecord) {
  if (ticket.status !== "ORDERED" || !ticket.expected_delivery_date?.trim()) {
    return false;
  }

  if (ticket.overdue_reminder_dismissed_at) {
    return false;
  }

  const dueAt = parseDueDateToEndOfDay(ticket.expected_delivery_date);

  if (!dueAt) {
    return false;
  }

  return dueAt.getTime() < Date.now();
}

export function parseDueDateToEndOfDay(value: string) {
  const trimmed = value.trim();
  const matchedDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (matchedDate) {
    const year = Number(matchedDate[1]);
    const month = Number(matchedDate[2]) - 1;
    const day = Number(matchedDate[3]);
    return new Date(year, month, day, 23, 59, 59, 999);
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function formatOperationalDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function buildOrderedWorkflowComment(payload: {
  expectedDeliveryDate: string;
  leadTimeNote?: string | null;
  actorName?: string | null;
}) {
  const base = `Expected delivery set for ${formatOperationalDate(payload.expectedDeliveryDate)}.`;
  const leadTime = payload.leadTimeNote?.trim()
    ? ` Lead time note: ${payload.leadTimeNote.trim()}`
    : "";
  const actor = payload.actorName?.trim()
    ? ` Ordered by ${payload.actorName.trim()}.`
    : "";

  return `${base}${leadTime}${actor}`.trim();
}

export function buildReadyWorkflowComment(payload: {
  binLocation: string;
  actorName?: string | null;
}) {
  const base = `Ready for collection from bin ${payload.binLocation.trim()}.`;
  const actor = payload.actorName?.trim()
    ? ` Marked ready by ${payload.actorName.trim()}.`
    : "";

  return `${base}${actor}`.trim();
}

export function buildRequesterReadyNotificationLine(binLocation?: string | null) {
  const trimmed = binLocation?.trim();

  if (!trimmed) {
    return null;
  }

  return `Collect from bin ${trimmed}.`;
}

export function isDownstreamStatus(status: TicketStatus | string | null | undefined) {
  return status === "READY" || status === "COMPLETED";
}
