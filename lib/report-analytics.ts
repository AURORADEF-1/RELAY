import type { SupabaseClient } from "@supabase/supabase-js";
import { isReportableAdminOperatorName } from "@/lib/admin-operators";
import { normalizeMachineNumber } from "@/lib/machine-registry";
import type {
  RelayAnalyticsSnapshot,
  RelayAnalyticsTicket,
} from "@/lib/relay-console-ai";

export type ReportRange = {
  start: Date;
  end: Date;
  label: string;
};

export type ClosedJobReportRow = {
  id: string;
  jobNumber: string;
  operator: string;
  completedAt: string;
  machineReference: string;
  requester: string;
  department: string;
  request: string;
  supplier: string;
  purchaseOrderNumber: string;
};

export type OperatorReportRow = {
  name: string;
  newAssigned: number;
  completed: number;
  active: number;
  urgent: number;
  overdue: number;
  averageCloseDays: number | null;
  completionShare: number;
};

export type RankedReportRow = {
  key: string;
  label: string;
  count: number;
  value: number;
};

export type FleetHealthLabel = "Healthy" | "Watch" | "At Risk" | "Critical";

export type FleetHealthRow = {
  key: string;
  label: string;
  fleetName: string;
  requests: number;
  active: number;
  urgent: number;
  ordered: number;
  health: FleetHealthLabel;
};

export type ReportAnalytics = {
  closedJobs: ClosedJobReportRow[];
  operators: OperatorReportRow[];
  purchaseOrderCount: number;
  purchaseOrderValue: number;
  averagePurchaseOrderValue: number;
  fleetHealth: Array<{ label: FleetHealthLabel; count: number }>;
  fleetRows: FleetHealthRow[];
  commonParts: RankedReportRow[];
  suppliers: RankedReportRow[];
  requesters: RankedReportRow[];
  totalPeriodTickets: number;
};

export type ReportTicketPart = {
  id: string;
  part_description: string | null;
  part_number: string | null;
  quantity: number | null;
  part_status: string | null;
  created_at: string | null;
};

export type ReportTicketPartCoverage = {
  rowsRead: number;
  queryCount: number;
  truncated: boolean;
};

const REPORT_PART_PAGE_SIZE = 1_000;
const REPORT_PART_MAX_ROWS = 4_000;
const ACTIVE_STATUSES = new Set([
  "PENDING",
  "QUERY",
  "ESTIMATE",
  "QUOTE",
  "IN_PROGRESS",
  "ORDERED",
  "READY",
]);

export function buildReportAnalytics(
  snapshot: RelayAnalyticsSnapshot,
  range: ReportRange,
  operatorNames: string[],
  ticketParts: ReportTicketPart[] = [],
): ReportAnalytics {
  const completionDates = completionDateByTicket(snapshot);
  const periodTickets = snapshot.tickets.filter((ticket) => isInRange(ticket.created_at, range));
  const closedJobs = snapshot.tickets
    .map((ticket) => {
      const completionDate = completionDates.get(ticket.id)
        ?? (ticket.status === "COMPLETED" ? ticket.updated_at : null);
      return completionDate ? toClosedJob(ticket, completionDate) : null;
    })
    .filter((row): row is ClosedJobReportRow => Boolean(row && isInRange(row.completedAt, range)))
    .sort((left, right) => new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime());

  const operators = buildOperatorRows(
    snapshot.tickets,
    closedJobs,
    periodTickets,
    operatorNames,
    range,
  );
  const periodPurchaseOrders = snapshot.purchaseOrders.filter((order) =>
    order.po_status !== "CANCELLED" && isInRange(order.created_at, range),
  );
  const purchaseOrderValue = periodPurchaseOrders.reduce(
    (total, order) => total + (order.order_amount ?? 0),
    0,
  );

  const fleet = buildFleetHealth(snapshot, periodTickets);

  return {
    closedJobs,
    operators,
    purchaseOrderCount: periodPurchaseOrders.length,
    purchaseOrderValue,
    averagePurchaseOrderValue:
      periodPurchaseOrders.length > 0 ? purchaseOrderValue / periodPurchaseOrders.length : 0,
    fleetHealth: fleet.summary,
    fleetRows: fleet.rows,
    commonParts: rankParts(
      ticketParts.filter((part) =>
        part.part_status !== "CANCELLED" && isInRange(part.created_at, range),
      ),
    ).slice(0, 8),
    suppliers: rankSuppliers(periodPurchaseOrders).slice(0, 8),
    requesters: rankRows(periodTickets.map((ticket) => ticket.requester_name)).slice(0, 8),
    totalPeriodTickets: periodTickets.length,
  };
}

export async function loadReportTicketParts(
  supabase: SupabaseClient,
): Promise<{ rows: ReportTicketPart[]; coverage: ReportTicketPartCoverage }> {
  const rows: ReportTicketPart[] = [];
  let queryCount = 0;

  while (rows.length < REPORT_PART_MAX_ROWS) {
    const start = rows.length;
    const end = Math.min(
      start + REPORT_PART_PAGE_SIZE,
      REPORT_PART_MAX_ROWS,
    ) - 1;
    const { data, error } = await supabase
      .from("ticket_parts")
      .select("id,part_description,part_number,quantity,part_status,created_at")
      .order("created_at", { ascending: false })
      .range(start, end);
    queryCount += 1;

    if (error) throw new Error(error.message);
    const page = (data ?? []) as ReportTicketPart[];
    rows.push(...page);
    if (page.length < end - start + 1) {
      return {
        rows,
        coverage: { rowsRead: rows.length, queryCount, truncated: false },
      };
    }
  }

  return {
    rows,
    coverage: {
      rowsRead: rows.length,
      queryCount,
      truncated: rows.length >= REPORT_PART_MAX_ROWS,
    },
  };
}

function buildOperatorRows(
  tickets: RelayAnalyticsTicket[],
  closedJobs: ClosedJobReportRow[],
  periodTickets: RelayAnalyticsTicket[],
  configuredNames: string[],
  range: ReportRange,
) {
  const names = new Map<string, string>();
  const ticketsById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  for (const name of configuredNames) {
    if (isReportableAdminOperatorName(name)) {
      names.set(normalize(name), name.trim());
    }
  }
  for (const ticket of tickets) {
    const name = ticket.assigned_to?.trim();
    if (isReportableAdminOperatorName(name)) {
      names.set(normalize(name), name as string);
    }
  }

  const totalCompleted = closedJobs.filter((job) =>
    isReportableAdminOperatorName(job.operator),
  ).length;
  return Array.from(names.entries())
    .map(([key, name]) => {
      const newAssigned = periodTickets.filter(
        (ticket) => normalize(ticket.assigned_to) === key,
      ).length;
      const operatorClosedJobs = closedJobs.filter(
        (job) => normalize(job.operator) === key,
      );
      const activeTickets = tickets.filter(
        (ticket) =>
          normalize(ticket.assigned_to) === key
          && ACTIVE_STATUSES.has(ticket.status?.toUpperCase() ?? ""),
      );
      const overdue = activeTickets.filter((ticket) => {
        const eta = new Date(ticket.expected_delivery_date ?? "").getTime();
        return ticket.status === "ORDERED" && Number.isFinite(eta) && eta < range.end.getTime();
      }).length;
      const closeDurations = operatorClosedJobs
        .map((job) => {
          const ticket = ticketsById.get(job.id);
          const created = new Date(ticket?.created_at ?? "").getTime();
          const completed = new Date(job.completedAt).getTime();
          return Number.isFinite(created) && completed >= created
            ? (completed - created) / 86_400_000
            : null;
        })
        .filter((value): value is number => value !== null);

      return {
        name,
        newAssigned,
        completed: operatorClosedJobs.length,
        active: activeTickets.length,
        urgent: activeTickets.filter((ticket) => ticket.is_urgent).length,
        overdue,
        averageCloseDays: closeDurations.length > 0
          ? closeDurations.reduce((total, value) => total + value, 0) / closeDurations.length
          : null,
        completionShare:
          totalCompleted > 0 ? (operatorClosedJobs.length / totalCompleted) * 100 : 0,
      } satisfies OperatorReportRow;
    })
    .sort(
      (left, right) =>
        right.completed - left.completed
        || right.newAssigned - left.newAssigned
        || left.name.localeCompare(right.name),
    );
}

function buildFleetHealth(
  snapshot: RelayAnalyticsSnapshot,
  periodTickets: RelayAnalyticsTicket[],
) {
  const machines = new Map<string, { label: string; fleetName: string }>();
  const allTicketsByMachine = new Map<string, RelayAnalyticsTicket[]>();
  const periodRequestsByMachine = new Map<string, number>();
  for (const fleet of snapshot.customerFleets) {
    for (const machine of fleet.machines) {
      const key = normalizeMachineNumber(machine.machine_number_normalized || machine.machine_number);
      if (key) {
        machines.set(key, {
          label: machine.machine_number,
          fleetName: fleet.name,
        });
      }
    }
  }
  for (const ticket of snapshot.tickets) {
    const reference = getTicketMachineReference(ticket);
    if (reference) {
      const rows = allTicketsByMachine.get(reference) ?? [];
      rows.push(ticket);
      allTicketsByMachine.set(reference, rows);
    }
    if (reference && !machines.has(reference)) {
      machines.set(reference, { label: displayTicketMachineReference(ticket), fleetName: "RELAY fleet" });
    }
  }
  for (const ticket of periodTickets) {
    const reference = getTicketMachineReference(ticket);
    if (reference) {
      periodRequestsByMachine.set(reference, (periodRequestsByMachine.get(reference) ?? 0) + 1);
    }
  }

  const rows = Array.from(machines.entries()).map(([key, machine]) => {
    const allMachineTickets = allTicketsByMachine.get(key) ?? [];
    const periodRequestCount = periodRequestsByMachine.get(key) ?? 0;
    const active = allMachineTickets.filter((ticket) =>
      ACTIVE_STATUSES.has(ticket.status?.toUpperCase() ?? ""),
    );
    const urgent = active.filter((ticket) => ticket.is_urgent).length;
    const ordered = active.filter((ticket) => ticket.status === "ORDERED").length;
    const health: FleetHealthLabel = urgent > 0
      ? "Critical"
      : active.length >= 3 || ordered >= 2
        ? "At Risk"
        : active.length > 0 || periodRequestCount >= 3
          ? "Watch"
          : "Healthy";
    return {
      key,
      label: machine.label,
      fleetName: machine.fleetName,
      requests: periodRequestCount,
      active: active.length,
      urgent,
      ordered,
      health,
    } satisfies FleetHealthRow;
  }).sort(
    (left, right) =>
      healthWeight(right.health) - healthWeight(left.health)
      || right.active - left.active
      || right.requests - left.requests,
  );

  const labels: FleetHealthLabel[] = ["Healthy", "Watch", "At Risk", "Critical"];
  return {
    rows,
    summary: labels.map((label) => ({
      label,
      count: rows.filter((row) => row.health === label).length,
    })),
  };
}

function completionDateByTicket(snapshot: RelayAnalyticsSnapshot) {
  const dates = new Map<string, string>();
  for (const event of snapshot.completionEvents) {
    if (event.created_at && !dates.has(event.ticket_id)) {
      dates.set(event.ticket_id, event.created_at);
    }
  }
  return dates;
}

function toClosedJob(
  ticket: RelayAnalyticsTicket,
  completedAt: string,
): ClosedJobReportRow {
  return {
    id: ticket.id,
    jobNumber: ticket.job_number?.trim() || ticket.id.slice(0, 8),
    operator: ticket.assigned_to?.trim() || "Unassigned",
    completedAt,
    machineReference: displayTicketMachineReference(ticket),
    requester: ticket.requester_name?.trim() || "Not recorded",
    department: ticket.department?.trim() || "Not recorded",
    request: cleanLabel(ticket.request_summary ?? ticket.request_details) || "Not recorded",
    supplier: ticket.supplier_name?.trim() || "Not recorded",
    purchaseOrderNumber: ticket.purchase_order_number?.trim() || "Not recorded",
  };
}

function rankRows(values: Array<string | null>) {
  const rows = new Map<string, RankedReportRow>();
  for (const value of values) {
    const label = cleanLabel(value);
    if (!label || isPlaceholder(label)) continue;
    const key = normalize(label);
    const row = rows.get(key) ?? { key, label, count: 0, value: 0 };
    row.count += 1;
    rows.set(key, row);
  }
  return Array.from(rows.values()).sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  );
}

function rankSuppliers(
  orders: RelayAnalyticsSnapshot["purchaseOrders"],
) {
  const rows = new Map<string, RankedReportRow>();
  for (const order of orders) {
    const label = cleanLabel(order.supplier_name);
    if (!label || isPlaceholder(label)) continue;
    const key = normalize(label);
    const row = rows.get(key) ?? { key, label, count: 0, value: 0 };
    row.count += 1;
    row.value += order.order_amount ?? 0;
    rows.set(key, row);
  }
  return Array.from(rows.values()).sort(
    (left, right) => right.value - left.value || right.count - left.count,
  );
}

function rankParts(parts: ReportTicketPart[]) {
  const rows = new Map<string, RankedReportRow>();
  for (const part of parts) {
    const number = cleanLabel(part.part_number);
    const description = cleanLabel(part.part_description);
    const label = [number, description].filter(Boolean).join(" · ");
    if (!label || isPlaceholder(label)) continue;
    const key = `${normalize(number)}|${normalize(description)}`;
    const row = rows.get(key) ?? { key, label, count: 0, value: 0 };
    const quantity = typeof part.quantity === "number" && part.quantity > 0
      ? part.quantity
      : 1;
    row.count += 1;
    row.value += quantity;
    rows.set(key, row);
  }
  return Array.from(rows.values()).sort(
    (left, right) => right.value - left.value || right.count - left.count,
  );
}

function getTicketMachineReference(ticket: RelayAnalyticsTicket) {
  return normalizeMachineNumber(
    ticket.machine_number_normalized
      || ticket.machine_number
      || ticket.machine_reference
      || "",
  );
}

function displayTicketMachineReference(ticket: RelayAnalyticsTicket) {
  return ticket.machine_number?.trim()
    || ticket.machine_reference?.trim()
    || "Not recorded";
}

function isInRange(value: string | null, range: ReportRange) {
  const time = new Date(value ?? "").getTime();
  return Number.isFinite(time)
    && time >= range.start.getTime()
    && time < range.end.getTime();
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") || "";
}

function cleanLabel(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") || "";
}

function isPlaceholder(value: string) {
  return /^(?:-|n\/a|none|not recorded|unknown)$/i.test(value);
}

function healthWeight(value: FleetHealthLabel) {
  return { Healthy: 0, Watch: 1, "At Risk": 2, Critical: 3 }[value];
}
