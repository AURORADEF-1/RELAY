export type ConsoleTicket = {
  id: string;
  requester_name: string | null;
  department: string | null;
  machine_reference: string | null;
  job_number: string | null;
  request_summary: string | null;
  request_details: string | null;
  status: string | null;
  assigned_to: string | null;
  expected_delivery_date: string | null;
  supplier_name: string | null;
  purchase_order_number: string | null;
  order_amount: number | null;
  bin_location: string | null;
  notes: string | null;
  is_urgent: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  latest_note: string | null;
};

export type ConsoleTicketUpdate = {
  ticket_id: string;
  comment: string | null;
  notes: string | null;
  created_at: string | null;
};

export function mergeLatestTicketNotes(
  tickets: Omit<ConsoleTicket, "latest_note">[],
  updates: ConsoleTicketUpdate[],
) {
  const latestNoteByTicketId = new Map<string, string>();

  for (const update of updates) {
    if (latestNoteByTicketId.has(update.ticket_id)) {
      continue;
    }

    const note = update.comment?.trim() || update.notes?.trim();
    if (note) {
      latestNoteByTicketId.set(update.ticket_id, note);
    }
  }

  return tickets.map<ConsoleTicket>((ticket) => ({
    ...ticket,
    latest_note: latestNoteByTicketId.get(ticket.id) ?? ticket.notes?.trim() ?? null,
  }));
}

export function formatConsoleCurrency(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
}

export function formatConsoleDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatConsoleDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
