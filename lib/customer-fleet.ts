import { normalizeMachineNumber } from "@/lib/machine-registry";
import { activeTicketStatuses } from "@/lib/statuses";

export type CustomerFleetMachine = {
  id: string;
  machine_number: string;
  machine_number_normalized: string;
  fleet_type: string | null;
  item_description: string | null;
  make: string | null;
  model: string | null;
  serial_number: string | null;
};

export type CustomerFleetTicket = {
  id: string;
  job_number: string | null;
  machine_reference: string | null;
  machine_number: string | null;
  machine_number_normalized: string | null;
  request_summary: string | null;
  request_details: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CustomerFleetPeriod = 30 | 90 | 365 | null;

export type CustomerFleetMachineSummary = CustomerFleetMachine & {
  request_count: number;
  open_request_count: number;
  ready_request_count: number;
  last_request_at: string | null;
  recent_requests: CustomerFleetTicket[];
};

const activeStatuses = new Set<string>(activeTicketStatuses);

export function buildCustomerFleetDashboard({
  machines,
  tickets,
  periodDays,
  now = new Date(),
}: {
  machines: CustomerFleetMachine[];
  tickets: CustomerFleetTicket[];
  periodDays: CustomerFleetPeriod;
  now?: Date;
}) {
  const periodStart = periodDays
    ? new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000)
    : null;
  const summaries = new Map<string, CustomerFleetMachineSummary>();

  for (const machine of machines) {
    summaries.set(machine.machine_number_normalized, {
      ...machine,
      request_count: 0,
      open_request_count: 0,
      ready_request_count: 0,
      last_request_at: null,
      recent_requests: [],
    });
  }

  for (const ticket of tickets) {
    const machineKey = normalizeMachineNumber(
      ticket.machine_number_normalized ||
        ticket.machine_number ||
        ticket.machine_reference ||
        "",
    );
    const summary = summaries.get(machineKey);

    if (!summary) {
      continue;
    }

    summary.recent_requests.push(ticket);
    summary.last_request_at = latestDate(summary.last_request_at, ticket.created_at, ticket.updated_at);

    if (!periodStart || isOnOrAfter(ticket.created_at, periodStart)) {
      summary.request_count += 1;
      const status = ticket.status?.toUpperCase() || "PENDING";

      if (activeStatuses.has(status)) {
        summary.open_request_count += 1;
      }

      if (status === "READY") {
        summary.ready_request_count += 1;
      }
    }
  }

  const machineSummaries = Array.from(summaries.values())
    .map((summary) => ({
      ...summary,
      recent_requests: summary.recent_requests
        .sort((left, right) => dateValue(right.created_at) - dateValue(left.created_at))
        .slice(0, 8),
    }))
    .sort((left, right) => {
      if (right.request_count !== left.request_count) {
        return right.request_count - left.request_count;
      }

      return left.machine_number.localeCompare(right.machine_number, undefined, { numeric: true });
    });

  return {
    machines: machineSummaries,
    totalRequests: machineSummaries.reduce((sum, machine) => sum + machine.request_count, 0),
    openRequests: machineSummaries.reduce((sum, machine) => sum + machine.open_request_count, 0),
    readyRequests: machineSummaries.reduce((sum, machine) => sum + machine.ready_request_count, 0),
  };
}

function latestDate(...values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => dateValue(right) - dateValue(left))[0] ?? null;
}

function isOnOrAfter(value: string | null, threshold: Date) {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp >= threshold.getTime();
}

function dateValue(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}
