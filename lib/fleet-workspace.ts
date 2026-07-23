import { activeTicketStatuses } from "@/lib/statuses";

export type FleetMachineRecord = {
  id: string;
  machine_number: string;
  machine_number_normalized: string;
  fleet_type: string | null;
  item_description: string | null;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  status: string | null;
  quantity: number | null;
  source_sheet: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type FleetTicketRecord = {
  id: string;
  user_id: string | null;
  requester_name: string | null;
  department: string | null;
  machine_reference: string | null;
  machine_number: string | null;
  machine_number_normalized: string | null;
  machine_make: string | null;
  machine_model: string | null;
  machine_serial_number: string | null;
  machine_verified: boolean | null;
  job_number: string | null;
  request_summary: string | null;
  request_details: string | null;
  status: string | null;
  assigned_to: string | null;
  expected_delivery_date: string | null;
  supplier_name: string | null;
  purchase_order_number: string | null;
  order_amount: number | null;
  notes: string | null;
  is_urgent: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export type FleetMachineSummary = FleetMachineRecord & {
  tickets: FleetTicketRecord[];
  total_requests: number;
  open_requests: number;
  completed_requests: number;
  urgent_requests: number;
  awaiting_parts_requests: number;
  linked_order_value: number;
  last_activity_at: string | null;
  latest_ticket: FleetTicketRecord | null;
};

export const fleetMachineGroups = [
  "Excavators",
  "Dumpers",
  "Telehandlers",
  "Loaders",
  "Rollers",
  "Access Equipment",
  "Attachments",
  "Small Tools",
  "HGV Trucks",
  "Other Equipment",
] as const;

export type FleetMachineGroup = (typeof fleetMachineGroups)[number];

const activeStatuses = new Set<string>(activeTicketStatuses);

export function normalizeFleetReference(value: string | null | undefined) {
  return (value ?? "").trim().replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export function normalizeFleetSearchText(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

export function machineMatchesFleetSearch(machine: FleetMachineRecord, query: string) {
  const normalizedQuery = normalizeFleetSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const compactQuery = normalizeFleetReference(query);
  const compactMachineNumber = normalizeFleetReference(machine.machine_number);
  const compactNormalizedNumber = normalizeFleetReference(machine.machine_number_normalized);
  const haystack = normalizeFleetSearchText(
    [
      machine.machine_number,
      machine.machine_number_normalized,
      machine.make,
      machine.model,
      machine.serial_number,
      machine.item_description,
      machine.fleet_type,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const tokens = normalizedQuery.split(" ").filter(Boolean);

  return (
    Boolean(
      compactQuery &&
        (compactMachineNumber.includes(compactQuery) ||
          compactNormalizedNumber.includes(compactQuery)),
    ) || tokens.every((token) => haystack.includes(token))
  );
}

export function getFleetMachineGroup(
  machine: Pick<FleetMachineRecord, "fleet_type" | "item_description" | "make" | "model">,
): FleetMachineGroup {
  const description = normalizeFleetSearchText(
    [machine.item_description, machine.make, machine.model, machine.fleet_type]
      .filter(Boolean)
      .join(" "),
  );

  if (/\b(dumpers?|dump trucks?|site dump|articulated dump)\b/.test(description)) {
    return "Dumpers";
  }
  if (/\b(breakers?|hydraulic hammers?|breaker attachments?)\b/.test(description)) {
    return "Attachments";
  }
  if (/\b(compactors?|plate compactors?|wacker plates?|trench compactors?)\b/.test(description)) {
    return "Small Tools";
  }
  if (/\b(rollers?|vibratory rollers?)\b/.test(description)) {
    return "Rollers";
  }
  if (/\b(wheel loaders?|skid steers?|loaders?)\b/.test(description)) {
    return "Loaders";
  }
  if (/\b(telehandlers?|loadalls?|forklifts?|telescopic handlers?)\b/.test(description)) {
    return "Telehandlers";
  }
  if (/\b(cherry pickers?|boom lifts?|scissor lifts?|access platforms?)\b/.test(description)) {
    return "Access Equipment";
  }
  if (
    /\b(tractors?|tractor units?|hgv|hgvs|articulated (?:lorr(?:y|ies)|trucks?)|artics?|road tractors?|lorr(?:y|ies)|trucks?)\b/.test(
      description,
    )
  ) {
    return "HGV Trucks";
  }
  if (/\b(excavators?|diggers?|mini diggers?)\b/.test(description)) {
    return "Excavators";
  }

  const fleetType = normalizeFleetSearchText(machine.fleet_type);
  if (fleetType.includes("excavator")) {
    return "Excavators";
  }
  if (fleetType.includes("telehandler")) {
    return "Telehandlers";
  }

  return "Other Equipment";
}

export function ticketMatchesMachine(
  ticket: FleetTicketRecord,
  machine: FleetMachineRecord,
) {
  const machineKey = normalizeFleetReference(machine.machine_number_normalized);
  const strongTicketKey = normalizeFleetReference(ticket.machine_number_normalized);

  if (strongTicketKey) {
    return strongTicketKey === machineKey;
  }

  const legacyTicketKey = normalizeFleetReference(
    ticket.machine_number || ticket.machine_reference,
  );

  return Boolean(legacyTicketKey && legacyTicketKey === machineKey);
}

export function buildFleetMachineSummaries(
  machines: FleetMachineRecord[],
  tickets: FleetTicketRecord[],
) {
  const summaries = new Map<string, FleetMachineSummary>();

  for (const machine of machines) {
    summaries.set(normalizeFleetReference(machine.machine_number_normalized), {
      ...machine,
      tickets: [],
      total_requests: 0,
      open_requests: 0,
      completed_requests: 0,
      urgent_requests: 0,
      awaiting_parts_requests: 0,
      linked_order_value: 0,
      last_activity_at: machine.updated_at,
      latest_ticket: null,
    });
  }

  for (const ticket of tickets) {
    const strongKey = normalizeFleetReference(ticket.machine_number_normalized);
    const legacyKey = normalizeFleetReference(
      ticket.machine_number || ticket.machine_reference,
    );
    const summary = summaries.get(strongKey || legacyKey);

    if (!summary || !ticketMatchesMachine(ticket, summary)) {
      continue;
    }

    summary.tickets.push(ticket);
    summary.total_requests += 1;

    const status = ticket.status?.trim().toUpperCase() || "PENDING";
    if (activeStatuses.has(status)) {
      summary.open_requests += 1;
    }
    if (status === "COMPLETED") {
      summary.completed_requests += 1;
    }
    if (ticket.is_urgent) {
      summary.urgent_requests += 1;
    }
    if (status === "ORDERED" || status === "ESTIMATE" || status === "QUOTE") {
      summary.awaiting_parts_requests += 1;
    }
    if (typeof ticket.order_amount === "number" && Number.isFinite(ticket.order_amount)) {
      summary.linked_order_value += ticket.order_amount;
    }

    const ticketActivity = latestDate(ticket.updated_at, ticket.created_at);
    summary.last_activity_at = latestDate(summary.last_activity_at, ticketActivity);
  }

  return Array.from(summaries.values())
    .map((summary) => {
      const sortedTickets = [...summary.tickets].sort(
        (left, right) =>
          dateValue(latestDate(right.updated_at, right.created_at)) -
          dateValue(latestDate(left.updated_at, left.created_at)),
      );

      return {
        ...summary,
        tickets: sortedTickets,
        latest_ticket: sortedTickets[0] ?? null,
      };
    })
    .sort((left, right) => {
      if (right.open_requests !== left.open_requests) {
        return right.open_requests - left.open_requests;
      }
      if (dateValue(right.last_activity_at) !== dateValue(left.last_activity_at)) {
        return dateValue(right.last_activity_at) - dateValue(left.last_activity_at);
      }
      return left.machine_number.localeCompare(right.machine_number, undefined, {
        numeric: true,
      });
    });
}

export function latestDate(
  ...values: Array<string | null | undefined>
): string | null {
  return (
    values
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => dateValue(right) - dateValue(left))[0] ?? null
  );
}

function dateValue(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}
