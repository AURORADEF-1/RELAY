const DAY_MS = 24 * 60 * 60 * 1000;

export type PartsJobReportTicket = {
  job_number?: string | null;
  status?: string | null;
  requester_name?: string | null;
  department?: string | null;
  assigned_to?: string | null;
  machine_reference?: string | null;
  machine_number?: string | null;
  machine_make?: string | null;
  machine_model?: string | null;
  request_summary?: string | null;
  supplier_name?: string | null;
  purchase_order_number?: string | null;
  expected_delivery_date?: string | null;
  ordered_at?: string | null;
  ready_at?: string | null;
  bin_location?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function safeSpreadsheetText(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
}

function ageInDays(value: string | null | undefined, now: number) {
  const created = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(created) ? Math.max(0, Math.floor((now - created) / DAY_MS)) : null;
}

export function buildPartsJobReportRows(tickets: PartsJobReportTicket[], now = Date.now()) {
  return tickets
    .map((ticket) => {
      const ageDays = ageInDays(ticket.created_at, now);
      return {
        "Job Number": safeSpreadsheetText(ticket.job_number),
        Status: safeSpreadsheetText(ticket.status),
        "Age (Days)": ageDays,
        "Over 30 Days": ageDays !== null && ageDays > 30 ? "Yes" : "No",
        "Requester Name": safeSpreadsheetText(ticket.requester_name),
        Department: safeSpreadsheetText(ticket.department),
        "Assigned To": safeSpreadsheetText(ticket.assigned_to),
        "Machine Reference": safeSpreadsheetText(ticket.machine_reference),
        "Fleet Number": safeSpreadsheetText(ticket.machine_number),
        Machine: safeSpreadsheetText([ticket.machine_make, ticket.machine_model].filter(Boolean).join(" ")),
        Summary: safeSpreadsheetText(ticket.request_summary),
        Supplier: safeSpreadsheetText(ticket.supplier_name),
        "Purchase Order": safeSpreadsheetText(ticket.purchase_order_number),
        "Expected Delivery": ticket.expected_delivery_date ?? "",
        "Ordered At": ticket.ordered_at ?? "",
        "Ready At": ticket.ready_at ?? "",
        "Ready Bin": safeSpreadsheetText(ticket.bin_location),
        "Created At": ticket.created_at ?? "",
        "Last Updated": ticket.updated_at ?? "",
      };
    })
    .sort((left, right) => {
      if (left["Over 30 Days"] !== right["Over 30 Days"]) return left["Over 30 Days"] === "Yes" ? -1 : 1;
      return (right["Age (Days)"] ?? -1) - (left["Age (Days)"] ?? -1);
    });
}
