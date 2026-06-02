import { normalizeMachineNumber, type MachineRegistryRecord } from "@/lib/machine-registry";

export type FleetTicketRecord = {
  id: string;
  machine_number?: string | null;
  machine_number_normalized?: string | null;
  machine_reference?: string | null;
  order_amount?: number | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  ordered_at?: string | null;
  ready_at?: string | null;
};

export type FleetIncidentRecord = {
  id: string;
  machine_reference: string | null;
  status: string | null;
  incident_type?: string | null;
  severity?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type FleetMachineSummary = {
  machine_number: string;
  machine_number_normalized: string;
  fleet_type: MachineRegistryRecord["fleet_type"] | null;
  item_description: string | null;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  source_sheet: string | null;
  source_row: number | null;
  quantity: number | null;
  request_count: number;
  service_count: number;
  open_issue_count: number;
  total_spend: number;
  last_request_at: string | null;
  last_service_at: string | null;
  last_activity_at: string | null;
  health_label: "Healthy" | "Watch" | "At Risk" | "Critical";
};

export type FleetSummaryMetrics = {
  highestDemand: FleetMachineSummary | null;
  highestCost: FleetMachineSummary | null;
  mostServices: FleetMachineSummary | null;
  openIssues: number;
  totalMachines: number;
};

export function buildFleetDashboardData({
  machines,
  tickets,
  incidents,
}: {
  machines: MachineRegistryRecord[];
  tickets: FleetTicketRecord[];
  incidents: FleetIncidentRecord[];
}) {
  const rowsByKey = new Map<string, FleetMachineSummary>();

  for (const machine of machines) {
    rowsByKey.set(machine.machine_number_normalized, {
      machine_number: machine.machine_number,
      machine_number_normalized: machine.machine_number_normalized,
      fleet_type: machine.fleet_type,
      item_description: machine.item_description,
      make: machine.make,
      model: machine.model,
      serial_number: machine.serial_number,
      source_sheet: machine.source_sheet,
      source_row: machine.source_row,
      quantity: machine.quantity,
      request_count: 0,
      service_count: 0,
      open_issue_count: 0,
      total_spend: 0,
      last_request_at: null,
      last_service_at: null,
      last_activity_at: null,
      health_label: "Healthy",
    });
  }

  const upsertVirtualRow = (normalized: string, fallbackLabel: string) => {
    const existing = rowsByKey.get(normalized);
    if (existing) {
      return existing;
    }

    const created: FleetMachineSummary = {
      machine_number: fallbackLabel,
      machine_number_normalized: normalized,
      fleet_type: null,
      item_description: null,
      make: null,
      model: null,
      serial_number: null,
      source_sheet: null,
      source_row: null,
      quantity: null,
      request_count: 0,
      service_count: 0,
      open_issue_count: 0,
      total_spend: 0,
      last_request_at: null,
      last_service_at: null,
      last_activity_at: null,
      health_label: "Watch",
    };

    rowsByKey.set(normalized, created);
    return created;
  };

  for (const ticket of tickets) {
    const normalized = normalizeMachineNumber(
      ticket.machine_number_normalized ||
        ticket.machine_number ||
        ticket.machine_reference ||
        "",
    );

    if (!normalized) {
      continue;
    }

    const row = upsertVirtualRow(
      normalized,
      ticket.machine_number?.trim() || ticket.machine_reference?.trim() || normalized,
    );

    row.request_count += 1;
    row.total_spend += toNumber(ticket.order_amount);
    row.last_request_at = getLatestIso(row.last_request_at, ticket.updated_at, ticket.created_at, ticket.ordered_at);
    row.last_activity_at = getLatestIso(row.last_activity_at, ticket.updated_at, ticket.created_at, ticket.ordered_at);
  }

  for (const incident of incidents) {
    const normalized = normalizeMachineNumber(incident.machine_reference ?? "");

    if (!normalized) {
      continue;
    }

    const row = upsertVirtualRow(normalized, incident.machine_reference?.trim() || normalized);

    row.service_count += 1;
    if ((incident.status ?? "").toUpperCase() !== "CLOSED") {
      row.open_issue_count += 1;
    }
    row.last_service_at = getLatestIso(row.last_service_at, incident.updated_at, incident.created_at);
    row.last_activity_at = getLatestIso(row.last_activity_at, incident.updated_at, incident.created_at);
  }

  const fleetRows = Array.from(rowsByKey.values())
    .map((row) => ({
      ...row,
      health_label: scoreFleetHealth(row),
    }))
    .sort((left, right) => {
      const demandDelta = right.request_count - left.request_count;
      if (demandDelta !== 0) {
        return demandDelta;
      }

      return right.total_spend - left.total_spend;
    });

  const highestDemand = fleetRows[0] ?? null;
  const highestCost = [...fleetRows].sort((left, right) => right.total_spend - left.total_spend)[0] ?? null;
  const mostServices = [...fleetRows].sort((left, right) => right.service_count - left.service_count)[0] ?? null;
  const openIssues = fleetRows.reduce((sum, row) => sum + row.open_issue_count, 0);

  const summary: FleetSummaryMetrics = {
    highestDemand,
    highestCost,
    mostServices,
    openIssues,
    totalMachines: fleetRows.length,
  };

  return {
    fleetRows,
    summary,
  };
}

function scoreFleetHealth(row: Pick<FleetMachineSummary, "request_count" | "service_count" | "open_issue_count" | "total_spend">): FleetMachineSummary["health_label"] {
  if (row.open_issue_count >= 3 || (row.service_count >= 4 && row.service_count >= row.request_count)) {
    return "Critical";
  }

  if (row.open_issue_count >= 1 || row.service_count >= 2 || row.total_spend >= 150000) {
    return "At Risk";
  }

  if (row.request_count >= 6 || row.total_spend >= 75000 || row.service_count >= 1) {
    return "Watch";
  }

  return "Healthy";
}

function getLatestIso(...values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
