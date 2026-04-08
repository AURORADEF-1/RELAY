import type { TicketStatus } from "@/lib/statuses";

export type TicketOperationalFields = {
  expected_delivery_date?: string | null;
  lead_time_note?: string | null;
  ordered_at?: string | null;
  ordered_by?: string | null;
  purchase_order_number?: string | null;
  supplier_name?: string | null;
  supplier_email?: string | null;
  order_amount?: number | null;
  bin_location?: string | null;
  ready_at?: string | null;
  ready_by?: string | null;
  overdue_reminder_dismissed_at?: string | null;
  overdue_reminder_dismissed_by?: string | null;
};

export type TicketOperationalRecord = TicketOperationalFields & {
  id: string;
  job_number?: string | null;
  machine_reference?: string | null;
  request_summary?: string | null;
  request_details?: string | null;
  requester_name?: string | null;
  assigned_to?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
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
  if (ticket.status !== "ORDERED") {
    return false;
  }

  return isTicketPastExpectedDelivery(ticket);
}

export function isTicketPastExpectedDelivery(ticket: TicketOperationalRecord) {
  if (!ticket.expected_delivery_date?.trim()) {
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
    const parsed = new Date(year, month, day, 23, 59, 59, 999);

    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month ||
      parsed.getDate() !== day
    ) {
      return null;
    }

    return parsed;
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

export function parseOrderAmountInput(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/,/g, "");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return Number.NaN;
  }

  return Number(parsed.toFixed(2));
}

export function formatOrderAmount(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function isTrackedOrderRecord(ticket: TicketOperationalRecord) {
  return Boolean(
    ticket.ordered_at ||
      ticket.expected_delivery_date?.trim() ||
      ticket.purchase_order_number?.trim() ||
      ticket.supplier_name?.trim() ||
      ticket.supplier_email?.trim() ||
      typeof ticket.order_amount === "number" ||
      ticket.status === "ORDERED",
  );
}

export function buildOrderedWorkflowComment(payload: {
  expectedDeliveryDate: string;
  leadTimeNote?: string | null;
  purchaseOrderNumber?: string | null;
  supplierName?: string | null;
  supplierEmail?: string | null;
  orderAmount?: number | null;
  actorName?: string | null;
}) {
  const base = `Expected delivery set for ${formatOperationalDate(payload.expectedDeliveryDate)}.`;
  const poNumber = payload.purchaseOrderNumber?.trim()
    ? ` PO ${payload.purchaseOrderNumber.trim()}.`
    : "";
  const supplier = payload.supplierName?.trim()
    ? ` Supplier ${payload.supplierName.trim()}.`
    : "";
  const supplierEmail = payload.supplierEmail?.trim()
    ? ` Supplier email ${payload.supplierEmail.trim()}.`
    : "";
  const amount =
    typeof payload.orderAmount === "number" && !Number.isNaN(payload.orderAmount)
      ? ` Amount ${formatOrderAmount(payload.orderAmount)}.`
      : "";
  const leadTime = payload.leadTimeNote?.trim()
    ? ` Lead time note: ${payload.leadTimeNote.trim()}`
    : "";
  const actor = payload.actorName?.trim()
    ? ` Ordered by ${payload.actorName.trim()}.`
    : "";

  return `${base}${poNumber}${supplier}${supplierEmail}${amount}${leadTime}${actor}`.trim();
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
