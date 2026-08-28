import { adminOperatorReportingKey } from "@/lib/admin-operators";
import type { ConsoleTicket } from "@/lib/console-tickets";
import type { TicketStatus } from "@/lib/statuses";

export type MyJobTicket = ConsoleTicket & {
  is_retail_sale: boolean | null;
  retail_sales_reference: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  retail_delivery_method: "collect" | "delivery" | null;
  retail_delivery_address: string | null;
  retail_apc_tracking_number: string | null;
  lead_time_note: string | null;
  supplier_email: string | null;
  ordered_at: string | null;
  ordered_by: string | null;
  ready_at: string | null;
  ready_by: string | null;
};

export type MyJobsColumn = {
  id: string;
  label: string;
  statuses: readonly TicketStatus[];
  tone: "pending" | "estimate" | "query" | "progress" | "ordered" | "ready";
};

export const MY_JOBS_COLUMNS: readonly MyJobsColumn[] = [
  {
    id: "estimate-quote",
    label: "Estimate / Quote",
    statuses: ["ESTIMATE", "QUOTE"],
    tone: "estimate",
  },
  { id: "query", label: "Query", statuses: ["QUERY"], tone: "query" },
  {
    id: "in-progress",
    label: "In progress",
    statuses: ["IN_PROGRESS"],
    tone: "progress",
  },
  { id: "ordered", label: "Ordered", statuses: ["ORDERED"], tone: "ordered" },
  { id: "ready", label: "Ready", statuses: ["READY"], tone: "ready" },
] as const;

export function getMyJobsEdgeScrollDelta(
  pointerX: number,
  leftEdge: number,
  rightEdge: number,
  edgeSize = 96,
) {
  if (pointerX <= leftEdge + edgeSize) return -28;
  if (pointerX >= rightEdge - edgeSize) return 28;
  return 0;
}

export function isMyJob(ticket: Pick<MyJobTicket, "assigned_to">, operatorLabel: string) {
  return Boolean(operatorLabel) &&
    adminOperatorReportingKey(ticket.assigned_to) === adminOperatorReportingKey(operatorLabel);
}

export function getMyJobsColumnForStatus(status: string | null | undefined) {
  return MY_JOBS_COLUMNS.find((column) =>
    column.statuses.includes(status as TicketStatus),
  ) ?? null;
}

export function getMyJobsColumnTickets(
  tickets: MyJobTicket[],
  column: MyJobsColumn,
) {
  return tickets.filter((ticket) => column.statuses.includes(ticket.status as TicketStatus));
}

export function getDefaultTargetStatus(column: MyJobsColumn): TicketStatus {
  return column.statuses[0];
}

export function formatTimeInStatus(ticket: MyJobTicket, now = Date.now()) {
  const rawStart =
    ticket.status === "ORDERED"
      ? ticket.ordered_at ?? ticket.updated_at
      : ticket.status === "READY"
        ? ticket.ready_at ?? ticket.updated_at
        : ticket.updated_at ?? ticket.created_at;
  const start = rawStart ? new Date(rawStart).getTime() : Number.NaN;

  if (!Number.isFinite(start)) {
    return "Time unavailable";
  }

  const minutes = Math.max(0, Math.floor((now - start) / 60_000));
  if (minutes < 60) {
    return `${minutes} min in status`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) {
    return `${hours}h${remainder ? ` ${remainder}m` : ""} in status`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h in status`;
}
