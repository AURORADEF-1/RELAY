export type PrePickTicket = {
  id: string;
  job_number: string | null;
  status: string | null;
  bin_location: string | null;
  machine_reference: string | null;
  machine_number: string | null;
  request_summary: string | null;
  request_details: string | null;
  requester_name: string | null;
  assigned_to: string | null;
  expected_delivery_date: string | null;
  is_urgent: boolean | null;
  updated_at: string | null;
};

export type PrePickBin = {
  key: string;
  label: string;
  tickets: PrePickTicket[];
};

export function groupTicketsByBin(tickets: PrePickTicket[]) {
  const groups = new Map<string, PrePickBin>();
  for (const ticket of tickets) {
    const label = ticket.bin_location?.trim();
    if (!label) continue;
    const key = normalizePrePickSearch(label);
    const group = groups.get(key) ?? { key, label, tickets: [] };
    group.tickets.push(ticket);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      tickets: group.tickets.sort(
        (left, right) =>
          Number(Boolean(right.is_urgent)) - Number(Boolean(left.is_urgent))
          || Number(right.status === "READY") - Number(left.status === "READY")
          || new Date(right.updated_at ?? 0).getTime() - new Date(left.updated_at ?? 0).getTime(),
      ),
    }))
    .sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { numeric: true }),
    );
}

export function normalizePrePickSearch(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}
