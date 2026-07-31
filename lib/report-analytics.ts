import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminOperatorReportingKey,
  canonicalizeAdminOperatorName,
  isReportableAdminOperatorName,
} from "@/lib/admin-operators";
import { normalizeMachineNumber } from "@/lib/machine-registry";
import type {
  RelayAnalyticsSnapshot,
  RelayAnalyticsTicket,
} from "@/lib/relay-console-ai";
import {
  normalizeRequesterProfileName,
  requesterProfileKey,
} from "@/lib/requester-profile-route";
import type { RequesterAccountRecord } from "@/lib/requester-accounts";
import {
  formatSupplierDisplayName,
  normalizeSupplierName,
} from "@/lib/suppliers";

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
  previousNewAssigned: number;
  completed: number;
  previousCompleted: number;
  active: number;
  urgent: number;
  overdue: number;
  averageCloseDays: number | null;
  previousAverageCloseDays: number | null;
  completionShare: number;
  monthly: OperatorMonthlyReportRow[];
};

export type OperatorMonthlyReportRow = {
  key: string;
  label: string;
  completed: number;
  newAssigned: number;
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

export type RequesterProfileTicketRow = {
  id: string;
  jobNumber: string;
  status: string;
  request: string;
  machineReference: string;
  department: string;
  assignedTo: string;
  createdAt: string | null;
  orderValue: number;
};

export type RequesterProfileReportRow = {
  key: string;
  userId: string | null;
  name: string;
  primaryDepartment: string;
  totalRequests: number;
  periodRequests: number;
  previousPeriodRequests: number;
  openRequests: number;
  completedRequests: number;
  urgentRequests: number;
  periodOrderValue: number;
  lastRequestAt: string | null;
  statuses: RankedReportRow[];
  departments: RankedReportRow[];
  machines: RankedReportRow[];
  recentTickets: RequesterProfileTicketRow[];
};

export type ReportPurchaseOrderRow = {
  id: string;
  ticket_id: string;
  supplier_name: string;
  purchase_order_number: string;
  order_amount: number;
  po_status: string;
  created_at: string | null;
  source: "linked" | "legacy-ticket";
};

export type ReportAnalytics = {
  closedJobs: ClosedJobReportRow[];
  operators: OperatorReportRow[];
  purchaseOrderCount: number;
  purchaseOrderValue: number;
  averagePurchaseOrderValue: number;
  previousPurchaseOrderCount: number;
  previousPurchaseOrderValue: number;
  purchaseOrderSourceCounts: { linked: number; legacy: number };
  fleetHealth: Array<{ label: FleetHealthLabel; count: number }>;
  fleetRows: FleetHealthRow[];
  commonParts: RankedReportRow[];
  commonFaults: RankedReportRow[];
  suppliers: RankedReportRow[];
  machineSpend: RankedReportRow[];
  fleetDemand: RankedReportRow[];
  requesters: RankedReportRow[];
  requesterProfiles: RequesterProfileReportRow[];
  totalPeriodTickets: number;
  previousPeriodTickets: number;
  previousClosedJobs: number;
  activeTickets: number;
  urgentTickets: number;
  previousRangeLabel: string;
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
  requesterAccounts: RequesterAccountRecord[] = [],
): ReportAnalytics {
  const previousRange = buildPreviousReportRange(range);
  const completionDates = completionDateByTicket(snapshot);
  const periodTickets = snapshot.tickets.filter((ticket) => isInRange(ticket.created_at, range));
  const previousPeriodTickets = snapshot.tickets.filter((ticket) =>
    isInRange(ticket.created_at, previousRange),
  );
  const allClosedJobs = snapshot.tickets
    .map((ticket) => {
      const completionDate = completionDates.get(ticket.id)
        ?? (ticket.status === "COMPLETED" ? ticket.updated_at : null);
      return completionDate ? toClosedJob(ticket, completionDate) : null;
    })
    .filter((row): row is ClosedJobReportRow => Boolean(row))
    .sort((left, right) => new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime());
  const closedJobs = allClosedJobs.filter((row) => isInRange(row.completedAt, range));
  const previousClosedJobs = allClosedJobs.filter((row) =>
    isInRange(row.completedAt, previousRange),
  );

  const operators = buildOperatorRows(
    snapshot.tickets,
    closedJobs,
    periodTickets,
    previousClosedJobs,
    previousPeriodTickets,
    operatorNames,
    range,
    allClosedJobs,
  );
  const purchaseOrderLedger = buildReportingPurchaseOrders(snapshot);
  const periodPurchaseOrders = purchaseOrderLedger.filter((order) =>
    order.po_status !== "CANCELLED" && isInRange(order.created_at, range),
  );
  const previousPurchaseOrders = purchaseOrderLedger.filter((order) =>
    order.po_status !== "CANCELLED" && isInRange(order.created_at, previousRange),
  );
  const purchaseOrderValue = periodPurchaseOrders.reduce(
    (total, order) => total + (order.order_amount ?? 0),
    0,
  );
  const previousPurchaseOrderValue = previousPurchaseOrders.reduce(
    (total, order) => total + (order.order_amount ?? 0),
    0,
  );

  const fleet = buildFleetHealth(snapshot, periodTickets);
  const requesterProfiles = buildRequesterProfiles(
    snapshot.tickets,
    range,
    requesterAccounts,
    purchaseOrderLedger,
  );
  const activeTickets = snapshot.tickets.filter((ticket) =>
    ACTIVE_STATUSES.has(ticket.status?.toUpperCase() ?? ""),
  );

  return {
    closedJobs,
    operators,
    purchaseOrderCount: periodPurchaseOrders.length,
    purchaseOrderValue,
    averagePurchaseOrderValue:
      periodPurchaseOrders.length > 0 ? purchaseOrderValue / periodPurchaseOrders.length : 0,
    previousPurchaseOrderCount: previousPurchaseOrders.length,
    previousPurchaseOrderValue,
    purchaseOrderSourceCounts: {
      linked: periodPurchaseOrders.filter((order) => order.source === "linked").length,
      legacy: periodPurchaseOrders.filter((order) => order.source === "legacy-ticket").length,
    },
    fleetHealth: fleet.summary,
    fleetRows: fleet.rows,
    commonParts: rankParts(
      ticketParts.filter((part) =>
        part.part_status !== "CANCELLED" && isInRange(part.created_at, range),
      ),
    ).slice(0, 8),
    commonFaults: rankRequestThemes(periodTickets).slice(0, 8),
    suppliers: rankSuppliers(periodPurchaseOrders).slice(0, 8),
    machineSpend: rankMachineSpend(periodPurchaseOrders, snapshot.tickets).slice(0, 8),
    fleetDemand: rankFleetDemand(fleet.rows).slice(0, 8),
    requesters: requesterProfiles
      .filter((profile) => profile.periodRequests > 0)
      .map((profile) => ({
        key: profile.key,
        label: profile.name,
        count: profile.periodRequests,
        value: profile.periodOrderValue,
      }))
      .slice(0, 8),
    requesterProfiles,
    totalPeriodTickets: periodTickets.length,
    previousPeriodTickets: previousPeriodTickets.length,
    previousClosedJobs: previousClosedJobs.length,
    activeTickets: activeTickets.length,
    urgentTickets: activeTickets.filter((ticket) => ticket.is_urgent).length,
    previousRangeLabel: previousRange.label,
  };
}

export function buildRequesterProfiles(
  tickets: RelayAnalyticsTicket[],
  range: ReportRange,
  requesterAccounts: RequesterAccountRecord[] = [],
  purchaseOrders: ReportPurchaseOrderRow[] = [],
) {
  const previousRange = buildPreviousReportRange(range);
  const accountById = new Map(
    requesterAccounts.map((account) => [account.user_id, account]),
  );
  const ticketsByProfile = new Map<string, RelayAnalyticsTicket[]>();
  const profileIdentity = new Map<
    string,
    { userId: string | null; name: string }
  >();

  for (const account of requesterAccounts) {
    const key = requesterProfileKey(account.user_id, account.full_name);
    if (!key) continue;
    profileIdentity.set(key, {
      userId: account.user_id,
      name: cleanLabel(account.full_name) || "Unnamed requester",
    });
    ticketsByProfile.set(key, []);
  }

  for (const ticket of tickets) {
    const key = requesterProfileKey(ticket.user_id, ticket.requester_name);
    if (!key) continue;

    const accountName = ticket.user_id
      ? accountById.get(ticket.user_id)?.full_name
      : null;
    const displayName = cleanLabel(accountName)
      || cleanLabel(ticket.requester_name)
      || "Unnamed requester";
    const rows = ticketsByProfile.get(key) ?? [];
    rows.push(ticket);
    ticketsByProfile.set(key, rows);
    if (!profileIdentity.has(key) || accountName) {
      profileIdentity.set(key, {
        userId: ticket.user_id?.trim() || null,
        name: displayName,
      });
    }
  }

  return Array.from(ticketsByProfile.entries())
    .map(([key, profileTickets]) => {
      const identity = profileIdentity.get(key) ?? {
        userId: null,
        name: key.replace(/^name:/, ""),
      };
      const sortedTickets = [...profileTickets].sort(
        (left, right) =>
          dateValue(right.created_at) - dateValue(left.created_at),
      );
      const periodTickets = sortedTickets.filter((ticket) =>
        isInRange(ticket.created_at, range),
      );
      const previousPeriodTickets = sortedTickets.filter((ticket) =>
        isInRange(ticket.created_at, previousRange),
      );
      const ticketIds = new Set(sortedTickets.map((ticket) => ticket.id));
      const activeTickets = sortedTickets.filter((ticket) =>
        ACTIVE_STATUSES.has(ticket.status?.toUpperCase() ?? ""),
      );
      const departments = rankRows(
        sortedTickets.map((ticket) => ticket.department),
      );

      return {
        key,
        userId: identity.userId,
        name: identity.name,
        primaryDepartment: departments[0]?.label || "Not recorded",
        totalRequests: sortedTickets.length,
        periodRequests: periodTickets.length,
        previousPeriodRequests: previousPeriodTickets.length,
        openRequests: activeTickets.length,
        completedRequests: sortedTickets.filter(
          (ticket) => ticket.status?.toUpperCase() === "COMPLETED",
        ).length,
        urgentRequests: activeTickets.filter((ticket) => ticket.is_urgent).length,
        periodOrderValue: purchaseOrders.reduce(
          (total, order) =>
            total
            + (ticketIds.has(order.ticket_id)
              && order.po_status !== "CANCELLED"
              && isInRange(order.created_at, range)
              ? order.order_amount
              : 0),
          0,
        ),
        lastRequestAt: sortedTickets[0]?.created_at ?? null,
        statuses: rankRows(
          periodTickets.map((ticket) => formatStatus(ticket.status)),
        ),
        departments,
        machines: rankRows(
          sortedTickets.map((ticket) => displayTicketMachineReference(ticket)),
        ),
        recentTickets: sortedTickets.slice(0, 12).map((ticket) => ({
          id: ticket.id,
          jobNumber: ticket.job_number?.trim() || ticket.id.slice(0, 8),
          status: formatStatus(ticket.status),
          request:
            cleanLabel(ticket.request_summary ?? ticket.request_details)
            || "No request summary",
          machineReference: displayTicketMachineReference(ticket),
          department: cleanLabel(ticket.department) || "Not recorded",
          assignedTo: cleanLabel(ticket.assigned_to) || "Unassigned",
          createdAt: ticket.created_at,
          orderValue: ticket.order_amount ?? 0,
        })),
      } satisfies RequesterProfileReportRow;
    })
    .filter((profile) =>
      profile.totalRequests > 0
      || normalizeRequesterProfileName(profile.name) !== "unnamed requester",
    )
    .sort(
      (left, right) =>
        right.periodRequests - left.periodRequests
        || right.totalRequests - left.totalRequests
        || left.name.localeCompare(right.name),
    );
}

export function buildReportingPurchaseOrders(
  snapshot: RelayAnalyticsSnapshot,
): ReportPurchaseOrderRow[] {
  const linkedTicketIds = new Set(
    snapshot.purchaseOrders.map((order) => order.ticket_id),
  );
  const linkedOrders = snapshot.purchaseOrders.map((order) => ({
    ...order,
    order_amount: order.order_amount ?? 0,
    source: "linked" as const,
  }));
  const legacyOrders = snapshot.tickets
    .filter((ticket) =>
      !linkedTicketIds.has(ticket.id)
      && Boolean(
        cleanLabel(ticket.supplier_name)
        || cleanLabel(ticket.purchase_order_number)
        || typeof ticket.order_amount === "number",
      ),
    )
    .map((ticket) => ({
      id: `legacy:${ticket.id}`,
      ticket_id: ticket.id,
      supplier_name: cleanLabel(ticket.supplier_name),
      purchase_order_number: cleanLabel(ticket.purchase_order_number),
      order_amount: ticket.order_amount ?? 0,
      po_status: "LEGACY",
      created_at: ticket.ordered_at ?? ticket.created_at,
      source: "legacy-ticket" as const,
    }));

  return [...linkedOrders, ...legacyOrders].sort(
    (left, right) => dateValue(right.created_at) - dateValue(left.created_at),
  );
}

export function buildPreviousReportRange(range: ReportRange): ReportRange {
  const start = new Date(range.start);
  const end = new Date(range.end);
  const isCalendarMonth =
    start.getDate() === 1
    && start.getHours() === 0
    && end.getDate() === 1
    && end.getHours() === 0
    && (end.getFullYear() * 12 + end.getMonth())
      - (start.getFullYear() * 12 + start.getMonth()) === 1;
  const previousEnd = new Date(start);
  const previousStart = isCalendarMonth
    ? new Date(start.getFullYear(), start.getMonth() - 1, 1)
    : new Date(start.getTime() - (end.getTime() - start.getTime()));

  return {
    start: previousStart,
    end: previousEnd,
    label: isCalendarMonth
      ? previousStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
      : `${previousStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} to ${new Date(previousEnd.getTime() - 1).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`,
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
  previousClosedJobs: ClosedJobReportRow[],
  previousPeriodTickets: RelayAnalyticsTicket[],
  configuredNames: string[],
  range: ReportRange,
  allClosedJobs: ClosedJobReportRow[],
) {
  const names = new Map<string, string>();
  const ticketsById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  for (const name of configuredNames) {
    if (isReportableAdminOperatorName(name)) {
      names.set(adminOperatorReportingKey(name), canonicalizeAdminOperatorName(name));
    }
  }
  for (const ticket of tickets) {
    const name = ticket.assigned_to?.trim();
    if (isReportableAdminOperatorName(name)) {
      names.set(adminOperatorReportingKey(name), canonicalizeAdminOperatorName(name));
    }
  }

  const totalCompleted = closedJobs.filter((job) =>
    isReportableAdminOperatorName(job.operator),
  ).length;
  return Array.from(names.entries())
    .map(([key, name]) => {
      const newAssigned = periodTickets.filter(
        (ticket) => adminOperatorReportingKey(ticket.assigned_to) === key,
      ).length;
      const previousNewAssigned = previousPeriodTickets.filter(
        (ticket) => adminOperatorReportingKey(ticket.assigned_to) === key,
      ).length;
      const operatorClosedJobs = closedJobs.filter(
        (job) => adminOperatorReportingKey(job.operator) === key,
      );
      const previousOperatorClosedJobs = previousClosedJobs.filter(
        (job) => adminOperatorReportingKey(job.operator) === key,
      );
      const activeTickets = tickets.filter(
        (ticket) =>
          adminOperatorReportingKey(ticket.assigned_to) === key
          && ACTIVE_STATUSES.has(ticket.status?.toUpperCase() ?? ""),
      );
      const overdue = activeTickets.filter((ticket) => {
        const eta = new Date(ticket.expected_delivery_date ?? "").getTime();
        return ticket.status === "ORDERED" && Number.isFinite(eta) && eta < range.end.getTime();
      }).length;
      const closeDurations = closeDurationsForJobs(operatorClosedJobs, ticketsById);
      const previousCloseDurations = closeDurationsForJobs(
        previousOperatorClosedJobs,
        ticketsById,
      );

      return {
        name,
        newAssigned,
        previousNewAssigned,
        completed: operatorClosedJobs.length,
        previousCompleted: previousOperatorClosedJobs.length,
        active: activeTickets.length,
        urgent: activeTickets.filter((ticket) => ticket.is_urgent).length,
        overdue,
        averageCloseDays: closeDurations.length > 0
          ? closeDurations.reduce((total, value) => total + value, 0) / closeDurations.length
          : null,
        previousAverageCloseDays: previousCloseDurations.length > 0
          ? previousCloseDurations.reduce((total, value) => total + value, 0)
            / previousCloseDurations.length
          : null,
        completionShare:
          totalCompleted > 0 ? (operatorClosedJobs.length / totalCompleted) * 100 : 0,
        monthly: buildOperatorMonthlyRows(
          key,
          tickets,
          allClosedJobs,
          range.end,
        ),
      } satisfies OperatorReportRow;
    })
    .sort(
      (left, right) =>
        right.completed - left.completed
        || right.newAssigned - left.newAssigned
        || left.name.localeCompare(right.name),
    );
}

function closeDurationsForJobs(
  jobs: ClosedJobReportRow[],
  ticketsById: Map<string, RelayAnalyticsTicket>,
) {
  return jobs
    .map((job) => {
      const ticket = ticketsById.get(job.id);
      const created = new Date(ticket?.created_at ?? "").getTime();
      const completed = new Date(job.completedAt).getTime();
      return Number.isFinite(created) && completed >= created
        ? (completed - created) / 86_400_000
        : null;
    })
    .filter((value): value is number => value !== null);
}

function buildOperatorMonthlyRows(
  operatorKey: string,
  tickets: RelayAnalyticsTicket[],
  closedJobs: ClosedJobReportRow[],
  rangeEnd: Date,
) {
  const anchor = new Date(rangeEnd.getTime() - 1);
  return Array.from({ length: 6 }, (_, index) => {
    const monthOffset = index - 5;
    const start = new Date(anchor.getFullYear(), anchor.getMonth() + monthOffset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return {
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      label: start.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      completed: closedJobs.filter(
        (job) => adminOperatorReportingKey(job.operator) === operatorKey
          && isInRange(job.completedAt, { start, end, label: "" }),
      ).length,
      newAssigned: tickets.filter(
        (ticket) => adminOperatorReportingKey(ticket.assigned_to) === operatorKey
          && isInRange(ticket.created_at, { start, end, label: "" }),
      ).length,
    } satisfies OperatorMonthlyReportRow;
  });
}

function buildFleetHealth(
  snapshot: RelayAnalyticsSnapshot,
  periodTickets: RelayAnalyticsTicket[],
) {
  const machines = new Map<string, { label: string; fleetName: string }>();
  const allTicketsByMachine = new Map<string, RelayAnalyticsTicket[]>();
  const periodRequestsByMachine = new Map<string, number>();
  for (const machine of snapshot.fleetMachines) {
    const key = normalizeMachineNumber(
      machine.machine_number_normalized || machine.machine_number,
    );
    if (key) {
      machines.set(key, {
        label: machine.machine_number,
        fleetName: "RELAY fleet",
      });
    }
  }
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
    operator: canonicalizeAdminOperatorName(ticket.assigned_to) || "Unassigned",
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

function rankSuppliers(orders: ReportPurchaseOrderRow[]) {
  const rows = new Map<string, RankedReportRow>();
  for (const order of orders) {
    const rawLabel = cleanLabel(order.supplier_name);
    const label = rawLabel
      ? /[A-Z]/.test(rawLabel) && rawLabel === rawLabel.toUpperCase()
        ? rawLabel
        : formatSupplierDisplayName(rawLabel)
      : "";
    if (!label || isPlaceholder(label)) continue;
    const key = normalizeSupplierName(label);
    const row = rows.get(key) ?? { key, label, count: 0, value: 0 };
    row.count += 1;
    row.value += order.order_amount ?? 0;
    rows.set(key, row);
  }
  return Array.from(rows.values()).sort(
    (left, right) => right.value - left.value || right.count - left.count,
  );
}

function rankMachineSpend(
  orders: ReportPurchaseOrderRow[],
  tickets: RelayAnalyticsTicket[],
) {
  const ticketsById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const rows = new Map<string, RankedReportRow>();
  for (const order of orders) {
    const ticket = ticketsById.get(order.ticket_id);
    const label = ticket ? displayTicketMachineReference(ticket) : "";
    if (!label || isPlaceholder(label)) continue;
    const key = normalizeMachineNumber(label) || normalize(label);
    const row = rows.get(key) ?? { key, label, count: 0, value: 0 };
    row.count += 1;
    row.value += order.order_amount;
    rows.set(key, row);
  }
  return Array.from(rows.values()).sort(
    (left, right) => right.value - left.value || right.count - left.count,
  );
}

function rankFleetDemand(rows: FleetHealthRow[]) {
  const fleets = new Map<string, RankedReportRow>();
  for (const machine of rows) {
    const label = cleanLabel(machine.fleetName);
    if (!label || isPlaceholder(label)) continue;
    const key = normalize(label);
    const row = fleets.get(key) ?? { key, label, count: 0, value: 0 };
    row.count += machine.active;
    row.value += machine.requests;
    fleets.set(key, row);
  }
  return Array.from(fleets.values()).sort(
    (left, right) => right.value - left.value || right.count - left.count,
  );
}

const REQUEST_THEME_RULES: Array<{ label: string; pattern: RegExp }> = [
  { label: "Service and maintenance", pattern: /\b(?:service|maintenance|hour\s*kit|service\s*kit)\b/i },
  { label: "Filters and oils", pattern: /\b(?:filter|oil|lubricant|grease)\b/i },
  { label: "Hydraulics and leaks", pattern: /\b(?:hydraulic|hose|leak|ram|seal|valve|pump)\b/i },
  { label: "Tracks and undercarriage", pattern: /\b(?:track|idler|sprocket|roller|undercarriage)\b/i },
  { label: "Electrical and starting", pattern: /\b(?:electric|battery|alternator|starter|wiring|sensor|switch)\b/i },
  { label: "Engine and cooling", pattern: /\b(?:engine|radiator|coolant|water\s*pump|turbo|exhaust)\b/i },
  { label: "Tyres, wheels and brakes", pattern: /\b(?:tyre|tire|wheel|brake)\b/i },
  { label: "Cab, glass and controls", pattern: /\b(?:cab|glass|window|mirror|seat|joystick|lever|cable)\b/i },
  { label: "Attachments and buckets", pattern: /\b(?:attachment|bucket|breaker|hitch|coupler|fork)\b/i },
  { label: "Transmission and drive", pattern: /\b(?:transmission|gearbox|axle|final\s*drive|propshaft|clutch)\b/i },
];

function rankRequestThemes(tickets: RelayAnalyticsTicket[]) {
  const rows = new Map<string, RankedReportRow>();
  for (const ticket of tickets) {
    const request = cleanLabel(ticket.request_summary ?? ticket.request_details);
    if (!request) continue;
    const label = REQUEST_THEME_RULES.find((rule) => rule.pattern.test(request))?.label
      ?? "Other parts and operational requests";
    const key = normalize(label);
    const row = rows.get(key) ?? { key, label, count: 0, value: 0 };
    row.count += 1;
    rows.set(key, row);
  }
  return Array.from(rows.values()).sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
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

function formatStatus(value: string | null | undefined) {
  return cleanLabel(value)?.replaceAll("_", " ") || "Pending";
}

function dateValue(value: string | null | undefined) {
  const time = new Date(value ?? "").getTime();
  return Number.isFinite(time) ? time : 0;
}

function isPlaceholder(value: string) {
  return /^(?:-|n\/a|none|not recorded|unknown)$/i.test(value);
}

function healthWeight(value: FleetHealthLabel) {
  return { Healthy: 0, Watch: 1, "At Risk": 2, Critical: 3 }[value];
}
