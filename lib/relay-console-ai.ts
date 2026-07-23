import type { SupabaseClient } from "@supabase/supabase-js";
import { rankBrowserSemanticIntent } from "@/lib/browser-semantic-model";
import { activeTicketStatuses } from "@/lib/statuses";

type AnalyticsIntent =
  | "overview"
  | "customer_fleet"
  | "machines"
  | "suppliers"
  | "requesters"
  | "departments"
  | "operators"
  | "admin_performance"
  | "statuses"
  | "spend"
  | "overdue"
  | "urgent"
  | "unassigned"
  | "ready"
  | "trends"
  | "requests";

const ANALYTICS_INTENTS: Array<{ intent: AnalyticsIntent; examples: string }> = [
  { intent: "overview", examples: "Give me an operations overview. What needs attention across RELAY?" },
  { intent: "customer_fleet", examples: "List Shred Station's customer fleet. Show a customer's machines and their request history." },
  { intent: "machines", examples: "Which machine reference has the most requests? Show busiest machines." },
  { intent: "suppliers", examples: "Who is our main supplier? Which supplier receives the most purchase orders?" },
  { intent: "requesters", examples: "Who raises the most requests? Show the busiest requesters." },
  { intent: "departments", examples: "Which department creates the most tickets? Show demand by department." },
  { intent: "operators", examples: "Who handles the most jobs? Show workload by assigned operator." },
  { intent: "admin_performance", examples: "Generate an admin performance report. Compare operator output, completion, overdue work and time to ready." },
  { intent: "statuses", examples: "How many requests are in each status? Show the queue breakdown." },
  { intent: "spend", examples: "What is our supplier spend and order value? Who has the highest spend?" },
  { intent: "overdue", examples: "Which orders are overdue or due now? What needs chasing?" },
  { intent: "urgent", examples: "Show urgent requests. Which critical jobs need attention?" },
  { intent: "unassigned", examples: "Which requests are unassigned? What work has no owner?" },
  { intent: "ready", examples: "What is ready for collection? Show ready jobs and bin locations." },
  { intent: "trends", examples: "Are requests increasing? Compare this month with the previous period." },
  { intent: "requests", examples: "What parts or request descriptions occur most often? Show common demand." },
];

export type RelayAnalyticsTicket = {
  id: string;
  requester_name: string | null;
  department: string | null;
  machine_reference: string | null;
  machine_number: string | null;
  machine_number_normalized: string | null;
  machine_make: string | null;
  machine_model: string | null;
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
  is_urgent: boolean | null;
  is_retail_sale: boolean | null;
  customer_name: string | null;
  created_at: string | null;
  updated_at: string | null;
  ordered_at: string | null;
  ready_at: string | null;
  notes: string | null;
};

export type RelayAnalyticsPurchaseOrder = {
  id: string;
  ticket_id: string;
  supplier_name: string;
  purchase_order_number: string;
  order_amount: number | null;
  po_status: string;
  created_at: string | null;
};

export type RelayAnalyticsCompletionEvent = {
  ticket_id: string;
  status: string | null;
  created_at: string | null;
};

export type RelayAnalyticsCustomerFleetMachine = {
  id: string;
  machine_number: string;
  machine_number_normalized: string;
  fleet_type: string | null;
  item_description: string | null;
  make: string | null;
  model: string | null;
  serial_number: string | null;
};

export type RelayAnalyticsCustomerFleet = {
  id: string;
  name: string;
  slug: string;
  machines: RelayAnalyticsCustomerFleetMachine[];
};

export type RelayAnalyticsSnapshot = {
  tickets: RelayAnalyticsTicket[];
  purchaseOrders: RelayAnalyticsPurchaseOrder[];
  completionEvents: RelayAnalyticsCompletionEvent[];
  customerFleets: RelayAnalyticsCustomerFleet[];
  loadedAt: Date;
  coverage: RelayAnalyticsCoverage;
};

export type RelayAnalyticsDataset =
  | "tickets"
  | "purchase orders"
  | "completion events"
  | "customer fleets"
  | "fleet assignments"
  | "fleet machines";

export type RelayAnalyticsCoverage = {
  queryCount: number;
  rowsRead: number;
  truncated: RelayAnalyticsDataset[];
};

export type RelayConsoleAiAnswer = {
  text: string;
  facts: string[];
  sourceNote: string;
  download?: {
    filename: string;
    label?: string;
    content?: string;
    mimeType?: string;
    workbook?: {
      sheetName: string;
      rows: Array<Array<string | number>>;
    };
  };
  copyText?: string;
};

const TICKET_FIELDS = [
  "id",
  "requester_name",
  "department",
  "machine_reference",
  "machine_number",
  "machine_number_normalized",
  "machine_make",
  "machine_model",
  "job_number",
  "request_summary",
  "request_details",
  "status",
  "assigned_to",
  "expected_delivery_date",
  "supplier_name",
  "purchase_order_number",
  "order_amount",
  "bin_location",
  "is_urgent",
  "is_retail_sale",
  "customer_name",
  "created_at",
  "updated_at",
  "ordered_at",
  "ready_at",
  "notes",
].join(",");

const PURCHASE_ORDER_FIELDS = [
  "id",
  "ticket_id",
  "supplier_name",
  "purchase_order_number",
  "order_amount",
  "po_status",
  "created_at",
].join(",");

const COMPLETION_EVENT_FIELDS = "ticket_id,status,created_at";

export const RELAY_AI_GUARDRAILS = {
  cacheWindowMs: 5 * 60_000,
  maxQuestionsPerWindow: 20,
  questionWindowMs: 5 * 60_000,
  maxQuestionLength: 500,
  queryTimeoutMs: 12_000,
  pageSize: 1_000,
  maxTicketRows: 6_000,
  maxPurchaseOrderRows: 4_000,
  maxCompletionEventRows: 6_000,
  maxCustomerFleets: 50,
  maxFleetAssignments: 1_000,
  maxFleetMachines: 1_000,
  machineIdChunkSize: 100,
  maxExactLookupRows: 6,
} as const;

type BoundedLoad<T> = {
  rows: T[];
  queryCount: number;
  truncated: boolean;
};

async function runBudgetedQuery<T>(
  label: string,
  query: (signal: AbortSignal) => PromiseLike<T>,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RELAY_AI_GUARDRAILS.queryTimeoutMs);

  try {
    return await Promise.resolve(query(controller.signal));
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${label} exceeded the ${RELAY_AI_GUARDRAILS.queryTimeoutMs / 1000}-second RELAY AI query limit.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loadBoundedPages<T>(
  maxRows: number,
  loadPage: (
    start: number,
    end: number,
    signal: AbortSignal,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  label: string,
): Promise<BoundedLoad<T>> {
  const rows: T[] = [];
  let queryCount = 0;

  while (rows.length < maxRows) {
    const remaining = maxRows - rows.length;
    const pageSize = Math.min(RELAY_AI_GUARDRAILS.pageSize, remaining);
    const response = await runBudgetedQuery(label, (signal) =>
      loadPage(rows.length, rows.length + pageSize - 1, signal),
    );
    queryCount += 1;

    if (response.error) throw new Error(response.error.message);
    const page = (response.data ?? []) as T[];
    rows.push(...page);

    if (page.length < pageSize) {
      return { rows, queryCount, truncated: false };
    }
    if (rows.length >= maxRows) {
      const probe = await runBudgetedQuery(label, (signal) =>
        loadPage(maxRows, maxRows, signal),
      );
      queryCount += 1;
      if (probe.error) throw new Error(probe.error.message);
      return {
        rows,
        queryCount,
        truncated: ((probe.data ?? []) as T[]).length > 0,
      };
    }
  }

  return { rows, queryCount, truncated: true };
}

function toNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function loadAllTickets(supabase: SupabaseClient) {
  const result = await loadBoundedPages<RelayAnalyticsTicket>(
    RELAY_AI_GUARDRAILS.maxTicketRows,
    (start, end, signal) => supabase
      .from("tickets")
      .select(TICKET_FIELDS)
      .order("created_at", { ascending: false })
      .range(start, end)
      .abortSignal(signal),
    "Ticket analytics",
  );
  return {
    ...result,
    rows: result.rows.map((row) => ({ ...row, order_amount: toNullableNumber(row.order_amount) })),
  };
}

async function loadAllPurchaseOrders(supabase: SupabaseClient) {
  const result = await loadBoundedPages<RelayAnalyticsPurchaseOrder>(
    RELAY_AI_GUARDRAILS.maxPurchaseOrderRows,
    (start, end, signal) => supabase
      .from("ticket_purchase_orders")
      .select(PURCHASE_ORDER_FIELDS)
      .order("created_at", { ascending: false })
      .range(start, end)
      .abortSignal(signal),
    "Purchase-order analytics",
  );
  return {
    ...result,
    rows: result.rows.map((row) => ({ ...row, order_amount: toNullableNumber(row.order_amount) })),
  };
}

async function loadAllCompletionEvents(supabase: SupabaseClient) {
  return loadBoundedPages<RelayAnalyticsCompletionEvent>(
    RELAY_AI_GUARDRAILS.maxCompletionEventRows,
    (start, end, signal) => supabase
      .from("ticket_updates")
      .select(COMPLETION_EVENT_FIELDS)
      .eq("status", "COMPLETED")
      .order("created_at", { ascending: false })
      .range(start, end)
      .abortSignal(signal),
    "Completion analytics",
  );
}

async function loadCustomerFleets(supabase: SupabaseClient) {
  let queryCount = 0;
  const fleetResponse = await runBudgetedQuery("Customer fleet lookup", (signal) =>
    supabase
      .from("customer_fleets")
      .select("id, name, slug")
      .order("name", { ascending: true })
      .limit(RELAY_AI_GUARDRAILS.maxCustomerFleets + 1)
      .abortSignal(signal),
  );
  queryCount += 1;
  const { data: fleetData, error: fleetError } = fleetResponse;

  if (fleetError) throw new Error(fleetError.message);

  const allFleets = (fleetData ?? []) as Array<{ id: string; name: string; slug: string }>;
  const fleets = allFleets.slice(0, RELAY_AI_GUARDRAILS.maxCustomerFleets);
  const truncated: RelayAnalyticsDataset[] = allFleets.length > fleets.length ? ["customer fleets"] : [];
  if (fleets.length === 0) {
    return { rows: [] as RelayAnalyticsCustomerFleet[], queryCount, rowsRead: 0, truncated };
  }

  const assignmentResponse = await runBudgetedQuery("Fleet assignment lookup", (signal) =>
    supabase
      .from("customer_fleet_machines")
      .select("fleet_id, machine_id")
      .in("fleet_id", fleets.map((fleet) => fleet.id))
      .limit(RELAY_AI_GUARDRAILS.maxFleetAssignments + 1)
      .abortSignal(signal),
  );
  queryCount += 1;
  const { data: assignmentData, error: assignmentError } = assignmentResponse;

  if (assignmentError) throw new Error(assignmentError.message);

  const allAssignments = (assignmentData ?? []) as Array<{ fleet_id: string; machine_id: string }>;
  const assignments = allAssignments.slice(0, RELAY_AI_GUARDRAILS.maxFleetAssignments);
  if (allAssignments.length > assignments.length) truncated.push("fleet assignments");
  const allMachineIds = Array.from(new Set(assignments.map((assignment) => assignment.machine_id)));
  const machineIds = allMachineIds.slice(0, RELAY_AI_GUARDRAILS.maxFleetMachines);
  if (allMachineIds.length > machineIds.length) truncated.push("fleet machines");
  const machines: RelayAnalyticsCustomerFleetMachine[] = [];

  for (let start = 0; start < machineIds.length; start += RELAY_AI_GUARDRAILS.machineIdChunkSize) {
    const ids = machineIds.slice(start, start + RELAY_AI_GUARDRAILS.machineIdChunkSize);
    const machineResponse = await runBudgetedQuery("Fleet machine lookup", (signal) =>
      supabase
        .from("machines")
        .select("id, machine_number, machine_number_normalized, fleet_type, item_description, make, model, serial_number")
        .in("id", ids)
        .abortSignal(signal),
    );
    queryCount += 1;
    const { data: machineData, error: machineError } = machineResponse;

    if (machineError) throw new Error(machineError.message);
    machines.push(...((machineData ?? []) as RelayAnalyticsCustomerFleetMachine[]));
  }

  const machinesById = new Map(machines.map((machine) => [machine.id, machine]));
  const rows = fleets.map((fleet) => ({
    ...fleet,
    machines: assignments
      .filter((assignment) => assignment.fleet_id === fleet.id)
      .map((assignment) => machinesById.get(assignment.machine_id))
      .filter((machine): machine is RelayAnalyticsCustomerFleetMachine => Boolean(machine))
      .sort((left, right) =>
        left.machine_number.localeCompare(right.machine_number, undefined, { numeric: true }),
      ),
  })) satisfies RelayAnalyticsCustomerFleet[];
  return {
    rows,
    queryCount,
    rowsRead: fleets.length + assignments.length + machines.length,
    truncated,
  };
}

export async function loadRelayAnalyticsSnapshot(supabase: SupabaseClient) {
  const [ticketResult, purchaseOrderResult, completionResult, fleetResult] = await Promise.all([
    loadAllTickets(supabase),
    loadAllPurchaseOrders(supabase),
    loadAllCompletionEvents(supabase),
    loadCustomerFleets(supabase),
  ]);
  const truncated: RelayAnalyticsDataset[] = [...fleetResult.truncated];
  if (ticketResult.truncated) truncated.push("tickets");
  if (purchaseOrderResult.truncated) truncated.push("purchase orders");
  if (completionResult.truncated) truncated.push("completion events");

  return {
    tickets: ticketResult.rows,
    purchaseOrders: purchaseOrderResult.rows,
    completionEvents: completionResult.rows,
    customerFleets: fleetResult.rows,
    loadedAt: new Date(),
    coverage: {
      queryCount:
        ticketResult.queryCount
        + purchaseOrderResult.queryCount
        + completionResult.queryCount
        + fleetResult.queryCount,
      rowsRead:
        ticketResult.rows.length
        + purchaseOrderResult.rows.length
        + completionResult.rows.length
        + fleetResult.rowsRead,
      truncated,
    },
  } satisfies RelayAnalyticsSnapshot;
}

type GroupValue = { key: string; label: string; count: number; total: number };

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") || "";
}

function normalizeQuestion(value: string) {
  return normalize(value)
    .replace(/\b(?:suplier|suppier|suppler)\b/g, "supplier")
    .replace(/\b(?:opertor|operater)\b/g, "operator")
    .replace(/\b(?:requets|reqests|requsts)\b/g, "requests")
    .replace(/\b(?:machien|macine)\b/g, "machine")
    .replace(/\b(?:delvery|deliery)\b/g, "delivery")
    .replace(/\b(?:completd|cmpleted|complted)\b/g, "completed")
    .replace(/\b(?:assogn|asign)\b/g, "assign");
}

const PLACEHOLDER_VALUES = new Set([
  "-",
  "0",
  "n/a",
  "na",
  "none",
  "not given",
  "not provided",
  "test",
  "testing",
  "unknown",
]);

function isMeaningfulLabel(value: string | null | undefined) {
  const normalized = normalize(value);
  return Boolean(normalized) && !PLACEHOLDER_VALUES.has(normalized);
}

function rankGroups(
  values: Array<{ label: string | null | undefined; amount?: number | null }>,
) {
  const groups = new Map<string, GroupValue>();
  for (const value of values) {
    const label = value.label?.trim();
    const key = normalize(label);
    if (!label || !key || !isMeaningfulLabel(label)) continue;
    const current = groups.get(key) ?? { key, label, count: 0, total: 0 };
    current.count += 1;
    current.total += value.amount ?? 0;
    groups.set(key, current);
  }
  return Array.from(groups.values()).sort(
    (left, right) => right.count - left.count || right.total - left.total || left.label.localeCompare(right.label),
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "no date";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "invalid date"
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function topLines(groups: GroupValue[], detail: (group: GroupValue) => string, limit = 5) {
  return groups.slice(0, limit).map((group, index) => `${index + 1}. ${group.label} — ${detail(group)}`).join("\n");
}

function ticketLine(ticket: RelayAnalyticsTicket) {
  const reference = ticket.is_retail_sale
    ? ticket.customer_name?.trim() || "Retail order"
    : ticket.machine_reference?.trim() || "No machine";
  return `• ${ticket.job_number?.trim() || ticket.id.slice(0, 8)} · ${reference} · ${ticket.requester_name?.trim() || "Unknown requester"}`;
}

function dedupeRequestDescription(ticket: RelayAnalyticsTicket) {
  const summary = ticket.request_summary?.trim() || "";
  const details = ticket.request_details?.trim() || "";
  const normalizedSummary = normalize(summary);
  const normalizedDetails = normalize(details);
  if (!summary && !details) return "Not recorded";
  if (!summary || normalizedSummary === normalizedDetails) return details || summary;
  if (!details || normalizedSummary.includes(normalizedDetails)) return summary;
  if (normalizedDetails.includes(normalizedSummary)) return details;
  return `${summary}. ${details}`;
}

function nextActionForTicket(ticket: RelayAnalyticsTicket) {
  switch (ticket.status) {
    case "PENDING": return "Validate the request, assign an operator and choose the next workflow stage.";
    case "ESTIMATE": return "Confirm supplier price, availability and lead time before preparing the estimate.";
    case "QUOTE": return "Confirm approval or requested changes before progressing the order.";
    case "QUERY": return "Resolve the recorded query with the requester and add the answer to the ticket.";
    case "IN_PROGRESS": return "Confirm the part and supplier, then record PO and delivery details when ordered.";
    case "ORDERED": return `Monitor the ${formatDate(ticket.expected_delivery_date)} expected delivery and chase the supplier if it slips.`;
    case "READY": return `Confirm collection from bin ${ticket.bin_location?.trim() || "not recorded"} using the QR or verbal code.`;
    case "COMPLETED": return "No action is required unless a correction, return or audit note is needed.";
    default: return "Review the ticket and record the next operational update.";
  }
}

function findJobMatches(question: string, tickets: RelayAnalyticsTicket[]) {
  const identifiers = new Set(
    question
      .match(/[a-z0-9][a-z0-9/_-]{2,}/gi)
      ?.map((value) => normalize(value)) ?? [],
  );
  return tickets.filter((ticket) => {
    const jobNumber = normalize(ticket.job_number);
    return Boolean(jobNumber) && identifiers.has(jobNumber);
  });
}

function questionIdentifiers(question: string) {
  return new Set(
    question
      .match(/[a-z0-9][a-z0-9/_-]{2,}/gi)
      ?.map((value) => normalize(value)) ?? [],
  );
}

function findPurchaseOrderMatches(question: string, snapshot: RelayAnalyticsSnapshot) {
  const identifiers = questionIdentifiers(question);
  const linked = snapshot.purchaseOrders.filter((order) =>
    identifiers.has(normalize(order.purchase_order_number)),
  );
  const linkedTicketIds = new Set(linked.map((order) => order.ticket_id));
  const legacy = snapshot.tickets
    .filter((ticket) =>
      !linkedTicketIds.has(ticket.id) &&
      Boolean(ticket.purchase_order_number) &&
      identifiers.has(normalize(ticket.purchase_order_number)),
    )
    .map((ticket) => ({
      id: `legacy-${ticket.id}`,
      ticket_id: ticket.id,
      supplier_name: ticket.supplier_name?.trim() || "Not recorded",
      purchase_order_number: ticket.purchase_order_number?.trim() || "Not recorded",
      order_amount: ticket.order_amount,
      po_status: ticket.status === "COMPLETED" ? "COMPLETED" : "OPEN",
      created_at: ticket.ordered_at ?? ticket.created_at,
    }));
  return [...linked, ...legacy];
}

function extractExactLookup(question: string) {
  const explicitPoNumber = question.match(
    /\b(?:po|purchase\s+order)\s+(?:number|no\.?|ref(?:erence)?|id)\s*[:#-]?\s*([a-z0-9][a-z0-9/_-]{1,})\b/i,
  )?.[1];
  const adjacentPoNumber = question.match(
    /\b(?:po|purchase\s+order)\s*[:#-]?\s*([a-z0-9][a-z0-9/_-]{1,})\b/i,
  )?.[1];
  const poNumber = explicitPoNumber
    ?? (adjacentPoNumber && /\d/.test(adjacentPoNumber) ? adjacentPoNumber : null);
  if (poNumber) return { type: "purchase_order" as const, identifier: poNumber };

  const explicitJobNumber = question.match(
    /\b(?:job|ticket|request)\s+(?:number|no\.?|ref(?:erence)?|id)\s*[:#-]?\s*([a-z0-9][a-z0-9/_-]{1,})\b/i,
  )?.[1];
  const adjacentJobNumber = question.match(
    /\b(?:job|ticket)\s*[:#-]?\s*([a-z0-9][a-z0-9/_-]{1,})\b/i,
  )?.[1] ?? question.match(
    /\b([a-z0-9][a-z0-9/_-]{1,})\s*[-:]?\s*(?:job|ticket)\b/i,
  )?.[1];
  const ignoredReferences = new Set(["a", "the", "this", "that", "my", "our"]);
  const jobNumber = explicitJobNumber
    ?? (adjacentJobNumber
      && /\d/.test(adjacentJobNumber)
      && !ignoredReferences.has(adjacentJobNumber.toLowerCase())
      ? adjacentJobNumber
      : /\b(?:job|ticket)\b/i.test(question)
      ? question.match(/\b\d{3,10}\b/)?.[0]
      : null);

  return jobNumber ? { type: "job" as const, identifier: jobNumber } : null;
}

function exactLookupCostNote(queryCount: number, rowsRead: number) {
  return ` Cost guardrail: targeted lookup read ${formatNumber(rowsRead)} rows across ${formatNumber(queryCount)} bounded ${queryCount === 1 ? "query" : "queries"}; the broad analytics snapshot was not loaded.`;
}

export async function answerRelayConsoleExactLookup(
  supabase: SupabaseClient,
  question: string,
): Promise<RelayConsoleAiAnswer | null> {
  const lookup = extractExactLookup(question);
  if (!lookup) return null;

  if (lookup.type === "job") {
    const response = await runBudgetedQuery("Exact job lookup", (signal) =>
      supabase
        .from("tickets")
        .select(TICKET_FIELDS)
        .ilike("job_number", lookup.identifier)
        .order("created_at", { ascending: false })
        .limit(RELAY_AI_GUARDRAILS.maxExactLookupRows)
        .abortSignal(signal),
    );
    if (response.error) throw new Error(response.error.message);
    const matches = ((response.data ?? []) as unknown as RelayAnalyticsTicket[])
      .map((row) => ({ ...row, order_amount: toNullableNumber(row.order_amount) }));
    if (matches.length === 0) {
      return {
        text: `I could not find an accessible ticket with the exact job number ${lookup.identifier}. Check the number and try again.`,
        facts: ["0 exact matches", lookup.identifier],
        sourceNote: `Exact job-number lookup. No broader query was run.${exactLookupCostNote(1, 0)}`,
      };
    }
    const answer = answerJobLookup(matches);
    return {
      ...answer,
      sourceNote: `${answer.sourceNote}${exactLookupCostNote(1, matches.length)}`,
    };
  }

  const [orderResponse, legacyTicketResponse] = await Promise.all([
    runBudgetedQuery("Exact purchase-order lookup", (signal) =>
      supabase
        .from("ticket_purchase_orders")
        .select(PURCHASE_ORDER_FIELDS)
        .ilike("purchase_order_number", lookup.identifier)
        .order("created_at", { ascending: false })
        .limit(RELAY_AI_GUARDRAILS.maxExactLookupRows)
        .abortSignal(signal),
    ),
    runBudgetedQuery("Legacy purchase-order lookup", (signal) =>
      supabase
        .from("tickets")
        .select(TICKET_FIELDS)
        .ilike("purchase_order_number", lookup.identifier)
        .order("created_at", { ascending: false })
        .limit(RELAY_AI_GUARDRAILS.maxExactLookupRows)
        .abortSignal(signal),
    ),
  ]);
  if (orderResponse.error) throw new Error(orderResponse.error.message);
  if (legacyTicketResponse.error) throw new Error(legacyTicketResponse.error.message);

  const linkedOrders = ((orderResponse.data ?? []) as unknown as RelayAnalyticsPurchaseOrder[])
    .map((row) => ({ ...row, order_amount: toNullableNumber(row.order_amount) }));
  const legacyTickets = ((legacyTicketResponse.data ?? []) as unknown as RelayAnalyticsTicket[])
    .map((row) => ({ ...row, order_amount: toNullableNumber(row.order_amount) }));
  const linkedTicketIds = Array.from(new Set(linkedOrders.map((order) => order.ticket_id)));
  let linkedTickets: RelayAnalyticsTicket[] = [];
  let queryCount = 2;

  if (linkedTicketIds.length > 0) {
    const ticketResponse = await runBudgetedQuery("Linked PO ticket lookup", (signal) =>
      supabase
        .from("tickets")
        .select(TICKET_FIELDS)
        .in("id", linkedTicketIds)
        .limit(RELAY_AI_GUARDRAILS.maxExactLookupRows)
        .abortSignal(signal),
    );
    queryCount += 1;
    if (ticketResponse.error) throw new Error(ticketResponse.error.message);
    linkedTickets = ((ticketResponse.data ?? []) as unknown as RelayAnalyticsTicket[])
      .map((row) => ({ ...row, order_amount: toNullableNumber(row.order_amount) }));
  }

  const linkedIds = new Set(linkedOrders.map((order) => order.ticket_id));
  const legacyOrders = legacyTickets
    .filter((ticket) => !linkedIds.has(ticket.id))
    .map((ticket) => ({
      id: `legacy-${ticket.id}`,
      ticket_id: ticket.id,
      supplier_name: ticket.supplier_name?.trim() || "Not recorded",
      purchase_order_number: ticket.purchase_order_number?.trim() || lookup.identifier,
      order_amount: ticket.order_amount,
      po_status: ticket.status === "COMPLETED" ? "COMPLETED" : "OPEN",
      created_at: ticket.ordered_at ?? ticket.created_at,
    }));
  const matches = [...linkedOrders, ...legacyOrders];
  const tickets = [...linkedTickets, ...legacyTickets];
  const rowsRead = linkedOrders.length + tickets.length;

  if (matches.length === 0) {
    return {
      text: `I could not find an accessible purchase order with the exact number ${lookup.identifier}. Check the number and try again.`,
      facts: ["0 exact matches", lookup.identifier],
      sourceNote: `Exact PO-number lookup across linked and legacy records. No broader query was run.${exactLookupCostNote(queryCount, rowsRead)}`,
    };
  }

  const snapshot: RelayAnalyticsSnapshot = {
    tickets,
    purchaseOrders: linkedOrders,
    completionEvents: [],
    customerFleets: [],
    loadedAt: new Date(),
    coverage: { queryCount, rowsRead, truncated: [] },
  };
  const answer = answerPurchaseOrderLookup(matches, snapshot);
  return {
    ...answer,
    sourceNote: `${answer.sourceNote}${exactLookupCostNote(queryCount, rowsRead)}`,
  };
}

function answerPurchaseOrderLookup(
  matches: RelayAnalyticsPurchaseOrder[],
  snapshot: RelayAnalyticsSnapshot,
): RelayConsoleAiAnswer {
  const ticketsById = new Map(snapshot.tickets.map((ticket) => [ticket.id, ticket]));
  const blocks = matches.slice(0, 8).map((order) => {
    const ticket = ticketsById.get(order.ticket_id);
    return [
      `PO ${order.purchase_order_number}`,
      `Supplier: ${order.supplier_name || "not recorded"}`,
      `PO status: ${order.po_status || "not recorded"} · Value: ${order.order_amount === null ? "not recorded" : formatCurrency(order.order_amount)}`,
      `Job: ${ticket?.job_number?.trim() || "not recorded"} · Machine: ${ticket?.machine_reference?.trim() || "not recorded"}`,
      `Request: ${ticket ? dedupeRequestDescription(ticket) : "linked ticket is not accessible"}`,
      `Ticket status: ${ticket?.status || "not recorded"} · Assigned to: ${ticket?.assigned_to?.trim() || "unassigned"}`,
      `Ordered: ${formatDate(ticket?.ordered_at ?? order.created_at)} · Delivery ETA: ${formatDate(ticket?.expected_delivery_date)}`,
      ticket ? `Recommended next action: ${nextActionForTicket(ticket)}` : null,
      ticket ? `Open ticket: /tickets/${ticket.id}` : null,
    ].filter(Boolean).join("\n");
  });

  return {
    text: blocks.join("\n\n"),
    facts: [
      `${formatNumber(matches.length)} PO${matches.length === 1 ? "" : "s"}`,
      matches[0]?.supplier_name || "Supplier not recorded",
      ticketsById.get(matches[0]?.ticket_id)?.expected_delivery_date
        ? `ETA ${formatDate(ticketsById.get(matches[0].ticket_id)?.expected_delivery_date)}`
        : "ETA not recorded",
    ],
    sourceNote: "Exact PO-number match against linked purchase orders and legacy ticket PO fields.",
  };
}

function answerJobLookup(matches: RelayAnalyticsTicket[]): RelayConsoleAiAnswer {
  const ordered = [...matches].sort((left, right) =>
    new Date(right.created_at ?? "").getTime() - new Date(left.created_at ?? "").getTime(),
  );
  const blocks = ordered.slice(0, 5).map((ticket) => [
    `Job ${ticket.job_number?.trim() || "not recorded"}`,
    `Request: ${dedupeRequestDescription(ticket)}`,
    `Machine: ${ticket.machine_reference?.trim() || "not recorded"}`,
    `Requester: ${ticket.requester_name?.trim() || "not recorded"}${ticket.department?.trim() ? ` · ${ticket.department.trim()}` : ""}`,
    `Status: ${ticket.status || "UNKNOWN"} · Assigned to: ${ticket.assigned_to?.trim() || "unassigned"}`,
    `Supplier: ${ticket.supplier_name?.trim() || "not recorded"} · PO: ${ticket.purchase_order_number?.trim() || "not recorded"}`,
    `Expected delivery: ${formatDate(ticket.expected_delivery_date)} · Bin: ${ticket.bin_location?.trim() || "not recorded"}`,
    ticket.notes?.trim() ? `Latest recorded note: ${ticket.notes.trim()}` : null,
    `Recommended next action: ${nextActionForTicket(ticket)}`,
    `Open ticket: /tickets/${ticket.id}`,
  ].filter(Boolean).join("\n"));

  return {
    text: blocks.join("\n\n"),
    facts: [`${formatNumber(matches.length)} ticket${matches.length === 1 ? "" : "s"}`, matches[0]?.status || "UNKNOWN", matches[0]?.assigned_to?.trim() || "Unassigned"],
    sourceNote: "Exact job-number match against live accessible ticket rows.",
  };
}

function supplierRecords(snapshot: RelayAnalyticsSnapshot) {
  const activeOrders = snapshot.purchaseOrders.filter((order) => order.po_status !== "CANCELLED");
  const poTicketIds = new Set(activeOrders.map((order) => order.ticket_id));
  return [
    ...activeOrders
      .map((order) => ({ label: order.supplier_name, amount: order.order_amount })),
    ...snapshot.tickets
      .filter((ticket) => !poTicketIds.has(ticket.id) && ticket.supplier_name?.trim())
      .map((ticket) => ({ label: ticket.supplier_name, amount: ticket.order_amount })),
  ];
}

function detectIntentFromWords(question: string): AnalyticsIntent {
  const query = ` ${normalizeQuestion(question)} `;
  if (/(admin|operator).*(performance|productivity|report|output)|performance report/.test(query)) return "admin_performance";
  if (/customer fleet|shred\s*stations?|shredstation/.test(query)) return "customer_fleet";
  if (/machine|fleet|plant ref/.test(query)) return "machines";
  if (/supplier|vendor/.test(query)) return /spend|value|cost/.test(query) ? "spend" : "suppliers";
  if (/spend|order value|cost/.test(query)) return "spend";
  if (/requester|raises|raised by/.test(query)) return "requesters";
  if (/department|team/.test(query)) return "departments";
  if (/operator|assigned|workload|handling/.test(query)) return "operators";
  if (/overdue|late|due now|chase/.test(query)) return "overdue";
  if (/urgent|critical|priority/.test(query)) return "urgent";
  if (/unassigned|no owner/.test(query)) return "unassigned";
  if (/ready|collection| bin /.test(query)) return "ready";
  if (/trend|increase|decrease|this month|last month/.test(query)) return "trends";
  if (/part|description|common request|most requested/.test(query)) return "requests";
  if (/status|breakdown|queue/.test(query)) return "statuses";
  return "overview";
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

type KpiDateRange = {
  start: Date | null;
  end: Date | null;
  label: string;
};

function startOfWeek(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

function parseReportDate(value: string) {
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const ukMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const parts = isoMatch
    ? [Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3])]
    : ukMatch
      ? [Number(ukMatch[3]), Number(ukMatch[2]), Number(ukMatch[1])]
      : null;
  if (!parts) return null;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 && date.getDate() === parts[2]
    ? date
    : null;
}

function kpiDateRange(question: string): KpiDateRange {
  const query = normalize(question);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const explicitRange = query.match(/(?:from|between)\s+(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\s+(?:to|and)\s+(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
  if (explicitRange) {
    const start = parseReportDate(explicitRange[1]);
    const inclusiveEnd = parseReportDate(explicitRange[2]);
    if (start && inclusiveEnd && inclusiveEnd >= start) {
      const end = new Date(inclusiveEnd);
      end.setDate(end.getDate() + 1);
      return { start, end, label: `${formatDate(start.toISOString())} to ${formatDate(inclusiveEnd.toISOString())}` };
    }
  }
  if (query.includes("this month")) {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      label: now.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    };
  }
  if (query.includes("last month")) {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      start,
      end: new Date(now.getFullYear(), now.getMonth(), 1),
      label: start.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    };
  }
  if (query.includes("this week")) {
    const start = startOfWeek(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end, label: `week commencing ${formatDate(start.toISOString())}` };
  }
  if (query.includes("last week")) {
    const end = startOfWeek(now);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    return { start, end, label: `week commencing ${formatDate(start.toISOString())}` };
  }
  if (query.includes("today")) {
    const end = new Date(today);
    end.setDate(end.getDate() + 1);
    return { start: today, end, label: formatDate(today.toISOString()) };
  }
  const daysMatch = query.match(/(?:last|past)\s+(\d{1,3})\s+days?/);
  if (daysMatch) {
    const days = Math.min(Number(daysMatch[1]), 366);
    return { start: new Date(now.getTime() - days * 86_400_000), end: now, label: `last ${days} days` };
  }
  if (query.includes("this year")) {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear() + 1, 0, 1),
      label: String(now.getFullYear()),
    };
  }
  return { start: null, end: null, label: "all recorded time" };
}

function completionDateByTicket(snapshot: RelayAnalyticsSnapshot) {
  const dates = new Map<string, string>();
  for (const event of snapshot.completionEvents) {
    if (event.created_at && !dates.has(event.ticket_id)) dates.set(event.ticket_id, event.created_at);
  }
  return dates;
}

function answerOperatorCompletionKpi(
  question: string,
  snapshot: RelayAnalyticsSnapshot,
): RelayConsoleAiAnswer | null {
  const query = ` ${normalize(question)} `;
  if (!/\b(?:completed|complete|finished)\b/.test(query) || !/\b(?:jobs?|tickets?|requests?)\b/.test(query)) {
    return null;
  }

  const operators = rankGroups(snapshot.tickets.map((ticket) => ({ label: ticket.assigned_to })));
  const operatorMatches = operators.filter((candidate) => {
    if (query.includes(` ${candidate.key} `)) return true;
    const firstName = candidate.key.split(" ")[0];
    return Boolean(firstName) && query.includes(` ${firstName} `);
  });
  const operator = operatorMatches.length === 1 ? operatorMatches[0] : null;
  if (!operator) return null;

  const range = kpiDateRange(question);
  const completionDates = completionDateByTicket(snapshot);
  const rows = snapshot.tickets
    .filter((ticket) => normalize(ticket.assigned_to) === operator.key)
    .map((ticket) => {
      const recordedCompletion = completionDates.get(ticket.id) ?? null;
      const completionDate = recordedCompletion || (ticket.status === "COMPLETED" ? ticket.updated_at : null);
      return { ticket, completionDate, usedFallback: !recordedCompletion && Boolean(completionDate) };
    })
    .filter((row): row is { ticket: RelayAnalyticsTicket; completionDate: string; usedFallback: boolean } => Boolean(row.completionDate))
    .filter((row) => {
      const time = new Date(row.completionDate).getTime();
      return Number.isFinite(time)
        && (!range.start || time >= range.start.getTime())
        && (!range.end || time < range.end.getTime());
    })
    .sort((left, right) => new Date(right.completionDate).getTime() - new Date(left.completionDate).getTime());
  const fallbackCount = rows.filter((row) => row.usedFallback).length;

  const workbookRows: Array<Array<string | number>> = [[
    "Job number",
    "Machine reference",
    "Request",
    "Requester",
    "Department",
    "Assigned operator",
    "Created date",
    "Ordered date",
    "Completed date",
    "Elapsed days",
    "Supplier",
    "PO number",
    "Delivery ETA",
  ]];
  for (const row of rows) {
    const created = new Date(row.ticket.created_at ?? "").getTime();
    const completed = new Date(row.completionDate).getTime();
    const elapsedDays = Number.isFinite(created) && Number.isFinite(completed) && completed >= created
      ? Number(((completed - created) / 86_400_000).toFixed(1))
      : "";
    workbookRows.push([
      row.ticket.job_number?.trim() || row.ticket.id,
      row.ticket.machine_reference?.trim() || "",
      dedupeRequestDescription(row.ticket),
      row.ticket.requester_name?.trim() || "",
      row.ticket.department?.trim() || "",
      operator.label,
      row.ticket.created_at ? formatDate(row.ticket.created_at) : "",
      row.ticket.ordered_at ? formatDate(row.ticket.ordered_at) : "",
      formatDate(row.completionDate),
      elapsedDays,
      row.ticket.supplier_name?.trim() || "",
      row.ticket.purchase_order_number?.trim() || "",
      row.ticket.expected_delivery_date ? formatDate(row.ticket.expected_delivery_date) : "",
    ]);
  }

  const detail = rows.slice(0, 10).map((row) =>
    `• ${row.ticket.job_number?.trim() || row.ticket.id.slice(0, 8)} · completed ${formatDate(row.completionDate)} · ${row.ticket.machine_reference?.trim() || "no machine"}`,
  ).join("\n");
  const safeOperator = operator.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    text: `${operator.label} completed ${formatNumber(rows.length)} job${rows.length === 1 ? "" : "s"} in ${range.label}.${detail ? `\n\nCompletion date order\n${detail}` : ""}`,
    facts: [`${formatNumber(rows.length)} completed`, range.label, "Excel available"],
    sourceNote: `Completion dates use ticket activity records${fallbackCount ? `, with updated_at fallback for ${fallbackCount} legacy ticket${fallbackCount === 1 ? "" : "s"}` : ""}. Results are sorted by completion date, newest first.`,
    download: {
      filename: `relay-${safeOperator}-completed-${new Date().toISOString().slice(0, 10)}.xlsx`,
      label: "Download Excel report",
      workbook: {
        sheetName: `${operator.label} completed`.slice(0, 31),
        rows: workbookRows,
      },
    },
  };
}

function answerAdminPerformance(snapshot: RelayAnalyticsSnapshot): RelayConsoleAiAnswer {
  const now = Date.now();
  const ordersByTicket = new Map<string, number>();
  for (const order of snapshot.purchaseOrders) {
    if (order.po_status === "CANCELLED") continue;
    ordersByTicket.set(order.ticket_id, (ordersByTicket.get(order.ticket_id) ?? 0) + (order.order_amount ?? 0));
  }

  const grouped = new Map<string, {
    name: string;
    assigned: number;
    completed: number;
    active: number;
    overdue: number;
    urgent: number;
    readyDurations: number[];
    orderValue: number;
  }>();

  for (const ticket of snapshot.tickets) {
    const name = ticket.assigned_to?.trim();
    if (!isMeaningfulLabel(name)) continue;
    const key = normalize(name);
    const row = grouped.get(key) ?? {
      name: name as string,
      assigned: 0,
      completed: 0,
      active: 0,
      overdue: 0,
      urgent: 0,
      readyDurations: [],
      orderValue: 0,
    };
    row.assigned += 1;
    if (ticket.status === "COMPLETED") row.completed += 1;
    else row.active += 1;
    if (ticket.is_urgent && ticket.status !== "COMPLETED") row.urgent += 1;
    const eta = new Date(ticket.expected_delivery_date ?? "").getTime();
    if (ticket.status === "ORDERED" && Number.isFinite(eta) && eta < now) row.overdue += 1;
    const created = new Date(ticket.created_at ?? "").getTime();
    const ready = new Date(ticket.ready_at ?? "").getTime();
    if (Number.isFinite(created) && Number.isFinite(ready) && ready >= created) {
      row.readyDurations.push((ready - created) / 86_400_000);
    }
    row.orderValue += ordersByTicket.has(ticket.id)
      ? ordersByTicket.get(ticket.id) ?? 0
      : ticket.order_amount ?? 0;
    grouped.set(key, row);
  }

  const rows = Array.from(grouped.values()).sort(
    (left, right) => right.completed - left.completed || right.assigned - left.assigned || left.name.localeCompare(right.name),
  );
  const detail = rows.slice(0, 10).map((row) => {
    const completionRate = row.assigned > 0 ? (row.completed / row.assigned) * 100 : 0;
    const averageReady = row.readyDurations.length
      ? row.readyDurations.reduce((total, value) => total + value, 0) / row.readyDurations.length
      : null;
    return `• ${row.name} · ${formatNumber(row.completed)} completed / ${formatNumber(row.assigned)} assigned (${completionRate.toFixed(1)}%) · ${formatNumber(row.active)} active · ${formatNumber(row.overdue)} overdue · ${averageReady === null ? "no time-to-ready data" : `${averageReady.toFixed(1)} days avg to ready`}`;
  }).join("\n");
  const csvHeader = ["Operator", "Assigned", "Completed", "Completion rate", "Active", "Urgent active", "Overdue ordered", "Average days to ready", "Recorded PO value"];
  const csvRows = rows.map((row) => {
    const completionRate = row.assigned > 0 ? (row.completed / row.assigned) * 100 : 0;
    const averageReady = row.readyDurations.length
      ? row.readyDurations.reduce((total, value) => total + value, 0) / row.readyDurations.length
      : "";
    return [row.name, row.assigned, row.completed, completionRate.toFixed(1), row.active, row.urgent, row.overdue, typeof averageReady === "number" ? averageReady.toFixed(1) : "", row.orderValue]
      .map(csvCell)
      .join(",");
  });

  return {
    text: rows.length
      ? `Admin performance report\n\n${detail}\n\nThese are workload and workflow indicators, not a quality score. Completion rate is all-time and can be affected by reassignment, ticket age and data completeness.`
      : "No assigned operator data is available for a performance report.",
    facts: [`${formatNumber(rows.length)} operators`, `${formatNumber(snapshot.tickets.length)} tickets`, "CSV available"],
    sourceNote: "All accessible tickets and linked POs; time-to-ready uses recorded created_at and ready_at timestamps.",
    download: {
      filename: `relay-admin-performance-${new Date().toISOString().slice(0, 10)}.csv`,
      content: [csvHeader.map(csvCell).join(","), ...csvRows].join("\n"),
      mimeType: "text/csv;charset=utf-8",
    },
  };
}

async function detectIntent(question: string) {
  const wordIntent = detectIntentFromWords(question);
  if (wordIntent !== "overview") return wordIntent;

  try {
    const match = await rankBrowserSemanticIntent(question, ANALYTICS_INTENTS);
    if (match && match.score >= 0.27) return match.intent;
  } catch (error) {
    console.warn("RELAY AI semantic router unavailable; using local analytics rules", error);
  }
  return wordIntent;
}

function answerCustomerFleet(
  question: string,
  snapshot: RelayAnalyticsSnapshot,
): RelayConsoleAiAnswer {
  const normalizedQuestion = normalize(question);
  const compactQuestion = normalizedQuestion.replace(/[^a-z0-9]/g, "");
  const namedFleet = snapshot.customerFleets.find((fleet) => {
    const normalizedName = normalize(fleet.name);
    const compactName = normalizedName.replace(/[^a-z0-9]/g, "");
    return normalizedQuestion.includes(normalizedName) || compactQuestion.includes(compactName);
  });
  const fleet = namedFleet ?? (snapshot.customerFleets.length === 1 ? snapshot.customerFleets[0] : null);

  if (!fleet) {
    const available = snapshot.customerFleets.map((item) => item.name).join(", ");
    return {
      text: available
        ? `I could not identify which customer fleet you meant. Available customer fleets: ${available}.`
        : "No customer fleets are configured in RELAY.",
      facts: [`${formatNumber(snapshot.customerFleets.length)} customer fleets`],
      sourceNote: "Live customer fleet memberships and verified machine mappings.",
    };
  }

  const machineReference = question.match(
    /\b(?:machine|fleet|ref(?:erence)?)\s*(?:number|no\.?)?\s*[:#-]?\s*(\d{1,8})\b/i,
  )?.[1];
  const selectedMachines = machineReference
    ? fleet.machines.filter((machine) => machine.machine_number_normalized === machineReference)
    : fleet.machines;

  if (machineReference && selectedMachines.length === 0) {
    return {
      text: `Machine ${machineReference} is not assigned to ${fleet.name}'s customer fleet.`,
      facts: [`${formatNumber(fleet.machines.length)} fleet machines`, fleet.name],
      sourceNote: "Exact normalized reference check against the live customer fleet mapping.",
    };
  }

  const fleetMachineKeys = new Set(
    selectedMachines.map((machine) => machine.machine_number_normalized),
  );
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const ticketsByMachine = new Map<string, RelayAnalyticsTicket[]>();

  for (const ticket of snapshot.tickets) {
    const machineKey = normalizeMachineReference(
      ticket.machine_number_normalized || ticket.machine_number || ticket.machine_reference,
    );

    if (!fleetMachineKeys.has(machineKey)) continue;
    const current = ticketsByMachine.get(machineKey) ?? [];
    current.push(ticket);
    ticketsByMachine.set(machineKey, current);
  }

  if (machineReference) {
    const machine = selectedMachines[0];
    const machineTickets = ticketsByMachine.get(machine.machine_number_normalized) ?? [];
    const recentTickets = machineTickets.filter(
      (ticket) => dateValue(ticket.created_at) >= thirtyDaysAgo,
    );
    const active = machineTickets.filter((ticket) =>
      activeTicketStatuses.some((status) => status === ticket.status),
    );
    const details = [machine.make, machine.model].filter(Boolean).join(" ") || machine.item_description || "Details not recorded";
    const recentLines = machineTickets
      .slice(0, 5)
      .map((ticket) => `${ticketLine(ticket)} · ${ticket.status || "UNKNOWN"}`)
      .join("\n");

    return {
      text: `${fleet.name} machine ${machine.machine_number}\n\n${details}\nSerial: ${machine.serial_number || "not recorded"}\nFleet category: ${formatFleetType(machine.fleet_type)}\n\nRequest activity\n• ${formatNumber(recentTickets.length)} requests in the past 30 days\n• ${formatNumber(machineTickets.length)} requests all time\n• ${formatNumber(active.length)} currently active${recentLines ? `\n\nRecent requests\n${recentLines}` : "\n\nNo requests are recorded against this machine."}`,
      facts: [`${formatNumber(recentTickets.length)} in 30 days`, `${formatNumber(machineTickets.length)} all time`, `${formatNumber(active.length)} active`],
      sourceNote: `Verified ${fleet.name} fleet mapping joined to all accessible ticket rows by normalized machine reference.`,
    };
  }

  const lines = selectedMachines.map((machine) => {
    const machineTickets = ticketsByMachine.get(machine.machine_number_normalized) ?? [];
    const recentCount = machineTickets.filter(
      (ticket) => dateValue(ticket.created_at) >= thirtyDaysAgo,
    ).length;
    const label = [machine.make, machine.model].filter(Boolean).join(" ") || machine.item_description || "Details not recorded";
    return `• ${machine.machine_number} · ${label} · serial ${machine.serial_number || "not recorded"} · ${formatNumber(recentCount)} requests in 30 days · ${formatNumber(machineTickets.length)} all time`;
  });
  const totalFleetTickets = lines.length
    ? snapshot.tickets.filter((ticket) =>
      fleetMachineKeys.has(normalizeMachineReference(
        ticket.machine_number_normalized || ticket.machine_number || ticket.machine_reference,
      )),
    )
    : [];
  const recentFleetTickets = totalFleetTickets.filter(
    (ticket) => dateValue(ticket.created_at) >= thirtyDaysAgo,
  );

  return {
    text: `${fleet.name} has ${formatNumber(fleet.machines.length)} verified fleet machines. I found ${formatNumber(recentFleetTickets.length)} requests across them in the past 30 days and ${formatNumber(totalFleetTickets.length)} all time.\n\n${lines.join("\n")}`,
    facts: [`${formatNumber(fleet.machines.length)} machines`, `${formatNumber(recentFleetTickets.length)} requests in 30 days`, `${formatNumber(totalFleetTickets.length)} all time`],
    sourceNote: `Live ${fleet.name} customer fleet mapping joined to accessible tickets by normalized machine reference.`,
  };
}

function normalizeMachineReference(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, "").toUpperCase() || "";
}

function formatFleetType(value: string | null) {
  return value
    ? value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())
    : "Not recorded";
}

function dateValue(value: string | null | undefined) {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function answerMachines(snapshot: RelayAnalyticsSnapshot): RelayConsoleAiAnswer {
  const groups = rankGroups(snapshot.tickets
    .filter((ticket) => !ticket.is_retail_sale)
    .map((ticket) => ({
      label: ticket.machine_reference,
    })));
  const leader = groups[0];
  return {
    text: leader
      ? `The machine reference with the highest recorded demand is ${leader.label}, with ${formatNumber(leader.count)} requests.\n\nTop machine references\n${topLines(groups, (group) => `${formatNumber(group.count)} requests`)}`
      : "No machine references are recorded on accessible tickets.",
    facts: [formatNumber(snapshot.tickets.length), `${formatNumber(groups.length)} machines`, leader?.label ?? "No leader"],
    sourceNote: "All accessible ticket rows; retail sales excluded from machine ranking.",
  };
}

function answerSuppliers(snapshot: RelayAnalyticsSnapshot, spendFirst = false): RelayConsoleAiAnswer {
  const groups = rankGroups(supplierRecords(snapshot));
  const bySpend = [...groups].sort((left, right) => right.total - left.total || right.count - left.count);
  const main = groups[0];
  const spendLeader = bySpend[0];
  const totalSpend = groups.reduce((total, group) => total + group.total, 0);
  const headline = spendFirst
    ? spendLeader
      ? `${spendLeader.label} has the highest recorded order value at ${formatCurrency(spendLeader.total)} across ${formatNumber(spendLeader.count)} orders.`
      : "No supplier spend is recorded."
    : main
      ? `${main.label} is the main supplier by order count, with ${formatNumber(main.count)} recorded orders worth ${formatCurrency(main.total)}.`
      : "No supplier orders are recorded.";
  return {
    text: `${headline}\n\nTop suppliers by order count\n${topLines(groups, (group) => `${formatNumber(group.count)} orders · ${formatCurrency(group.total)}`)}`,
    facts: [`${formatNumber(groups.length)} suppliers`, formatCurrency(totalSpend), `${formatNumber(supplierRecords(snapshot).length)} orders`],
    sourceNote: "Purchase-order rows, with legacy ticket supplier fields used only when a ticket has no linked PO.",
  };
}

function answerRankedTickets(
  snapshot: RelayAnalyticsSnapshot,
  field: "requester_name" | "department" | "assigned_to" | "request_summary",
  heading: string,
  empty: string,
) {
  const groups = rankGroups(snapshot.tickets.map((ticket) => ({ label: ticket[field] })));
  return {
    text: groups[0]
      ? `${groups[0].label} ranks first with ${formatNumber(groups[0].count)} requests.\n\n${heading}\n${topLines(groups, (group) => `${formatNumber(group.count)} requests`)}`
      : empty,
    facts: [`${formatNumber(snapshot.tickets.length)} tickets`, `${formatNumber(groups.length)} groups`, groups[0]?.label ?? "No leader"],
    sourceNote: "All accessible ticket rows grouped by the recorded field.",
  } satisfies RelayConsoleAiAnswer;
}

function answerStatuses(snapshot: RelayAnalyticsSnapshot): RelayConsoleAiAnswer {
  const groups = rankGroups(snapshot.tickets.map((ticket) => ({ label: ticket.status || "UNKNOWN" })));
  const active = snapshot.tickets.filter((ticket) => activeTicketStatuses.some((status) => status === ticket.status)).length;
  const completed = snapshot.tickets.filter((ticket) => ticket.status === "COMPLETED").length;
  return {
    text: `There are ${formatNumber(active)} active and ${formatNumber(completed)} completed tickets in the accessible dataset.\n\nStatus breakdown\n${topLines(groups, (group) => `${formatNumber(group.count)} tickets`, groups.length)}`,
    facts: [`${formatNumber(active)} active`, `${formatNumber(completed)} completed`, `${formatNumber(snapshot.tickets.length)} total`],
    sourceNote: "All accessible tickets grouped by current status.",
  };
}

function answerAttention(snapshot: RelayAnalyticsSnapshot, intent: "overdue" | "urgent" | "unassigned" | "ready") {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const matches = snapshot.tickets.filter((ticket) => {
    if (intent === "urgent") return Boolean(ticket.is_urgent) && ticket.status !== "COMPLETED";
    if (intent === "unassigned") return !ticket.assigned_to?.trim() && ticket.status !== "COMPLETED";
    if (intent === "ready") return ticket.status === "READY";
    if (ticket.status !== "ORDERED" || !ticket.expected_delivery_date) return false;
    const due = new Date(ticket.expected_delivery_date);
    return !Number.isNaN(due.getTime()) && due <= now;
  });
  const labels = {
    overdue: "due or overdue ordered tickets",
    urgent: "urgent active tickets",
    unassigned: "active tickets without an assigned operator",
    ready: "tickets ready for collection",
  } as const;
  const detail = matches.slice(0, 10).map((ticket) => {
    const suffix = intent === "ready"
      ? ` · bin ${ticket.bin_location?.trim() || "not recorded"}`
      : intent === "overdue"
        ? ` · due ${formatDate(ticket.expected_delivery_date)}`
        : "";
    return `${ticketLine(ticket)}${suffix}`;
  }).join("\n");
  return {
    text: matches.length > 0
      ? `I found ${formatNumber(matches.length)} ${labels[intent]}.\n\n${detail}${matches.length > 10 ? `\n• Plus ${formatNumber(matches.length - 10)} more` : ""}`
      : `There are no ${labels[intent]} in the accessible dataset.`,
    facts: [`${formatNumber(matches.length)} matches`, `${formatNumber(snapshot.tickets.length)} checked`, "Live Supabase read"],
    sourceNote: intent === "overdue"
      ? "ORDERED tickets with expected delivery on or before today."
      : "All accessible tickets filtered by the current recorded state.",
  };
}

function answerTrends(snapshot: RelayAnalyticsSnapshot): RelayConsoleAiAnswer {
  const now = Date.now();
  const period = 30 * 24 * 60 * 60 * 1000;
  const current = snapshot.tickets.filter((ticket) => {
    const time = new Date(ticket.created_at ?? "").getTime();
    return Number.isFinite(time) && time >= now - period;
  }).length;
  const previous = snapshot.tickets.filter((ticket) => {
    const time = new Date(ticket.created_at ?? "").getTime();
    return Number.isFinite(time) && time >= now - period * 2 && time < now - period;
  }).length;
  const difference = current - previous;
  const direction = difference === 0 ? "flat" : difference > 0 ? "up" : "down";
  const percentage = previous > 0 ? Math.abs((difference / previous) * 100) : null;
  return {
    text: `Request volume is ${direction}. The last 30 days recorded ${formatNumber(current)} tickets versus ${formatNumber(previous)} in the preceding 30 days.${percentage === null ? "" : ` That is ${percentage.toFixed(1)}% ${direction}.`}`,
    facts: [`${formatNumber(current)} current`, `${formatNumber(previous)} previous`, `${difference >= 0 ? "+" : ""}${formatNumber(difference)} change`],
    sourceNote: "Ticket creation dates compared across two consecutive 30-day windows.",
  };
}

function answerOverview(snapshot: RelayAnalyticsSnapshot): RelayConsoleAiAnswer {
  const active = snapshot.tickets.filter((ticket) => activeTicketStatuses.some((status) => status === ticket.status));
  const urgent = active.filter((ticket) => ticket.is_urgent).length;
  const unassigned = active.filter((ticket) => !ticket.assigned_to?.trim()).length;
  const ready = active.filter((ticket) => ticket.status === "READY").length;
  const ordered = active.filter((ticket) => ticket.status === "ORDERED").length;
  const suppliers = rankGroups(supplierRecords(snapshot));
  const machines = rankGroups(snapshot.tickets.map((ticket) => ({ label: ticket.machine_reference })));
  return {
    text: `RELAY currently has ${formatNumber(active.length)} active tickets. ${formatNumber(urgent)} are urgent, ${formatNumber(unassigned)} are unassigned, ${formatNumber(ordered)} are ordered and ${formatNumber(ready)} are ready for collection.\n\nHighest-demand machine: ${machines[0]?.label ?? "not recorded"} (${formatNumber(machines[0]?.count ?? 0)} requests).\nMain supplier by order count: ${suppliers[0]?.label ?? "not recorded"} (${formatNumber(suppliers[0]?.count ?? 0)} orders).`,
    facts: [`${formatNumber(active.length)} active`, `${formatNumber(urgent)} urgent`, `${formatNumber(ready)} ready`],
    sourceNote: "Live roll-up of all accessible tickets and purchase orders.",
  };
}

export async function answerRelayConsoleQuestion(
  question: string,
  snapshot: RelayAnalyticsSnapshot,
): Promise<RelayConsoleAiAnswer> {
  let answer: RelayConsoleAiAnswer;
  let interpretation = "operator completion report";
  const completionKpi = answerOperatorCompletionKpi(question, snapshot);
  if (completionKpi) {
    answer = completionKpi;
  } else {
    const isExplicitPoLookup = /\bpo\b|purchase order/i.test(question);
    const poMatches = findPurchaseOrderMatches(question, snapshot);
    const jobMatches = findJobMatches(question, snapshot.tickets);

    if (isExplicitPoLookup && poMatches.length > 0) {
      interpretation = "purchase-order lookup";
      answer = answerPurchaseOrderLookup(poMatches, snapshot);
    } else if (jobMatches.length > 0) {
      interpretation = "job-number lookup";
      answer = answerJobLookup(jobMatches);
    } else if (poMatches.length > 0) {
      interpretation = "purchase-order lookup";
      answer = answerPurchaseOrderLookup(poMatches, snapshot);
    } else {
      const intent = await detectIntent(question);
      interpretation = intent.replaceAll("_", " ");
      switch (intent) {
        case "customer_fleet": answer = answerCustomerFleet(question, snapshot); break;
        case "machines": answer = answerMachines(snapshot); break;
        case "suppliers": answer = answerSuppliers(snapshot); break;
        case "spend": answer = answerSuppliers(snapshot, true); break;
        case "requesters": answer = answerRankedTickets(snapshot, "requester_name", "Top requesters", "No requester names are recorded."); break;
        case "departments": answer = answerRankedTickets(snapshot, "department", "Top departments", "No departments are recorded."); break;
        case "operators": answer = answerRankedTickets(snapshot, "assigned_to", "Operator workload", "No operator assignments are recorded."); break;
        case "admin_performance": answer = answerAdminPerformance(snapshot); break;
        case "statuses": answer = answerStatuses(snapshot); break;
        case "overdue": answer = answerAttention(snapshot, "overdue"); break;
        case "urgent": answer = answerAttention(snapshot, "urgent"); break;
        case "unassigned": answer = answerAttention(snapshot, "unassigned"); break;
        case "ready": answer = answerAttention(snapshot, "ready"); break;
        case "trends": answer = answerTrends(snapshot); break;
        case "requests": answer = answerRankedTickets(snapshot, "request_summary", "Most common request summaries", "No request summaries are recorded."); break;
        case "overview": answer = answerOverview(snapshot); break;
      }
    }
  }

  const coverage = snapshot.coverage;
  const costNote = coverage.truncated.length > 0
    ? ` Cost guardrail reached for ${coverage.truncated.join(", ")}; all-time totals may be partial and are based on the newest bounded records.`
    : ` Cost guardrail: ${formatNumber(coverage.rowsRead)} rows across ${formatNumber(coverage.queryCount)} bounded reads, cached for five minutes.`;

  return {
    ...answer,
    sourceNote: `Interpreted as ${interpretation}. ${answer.sourceNote}${costNote}`,
  };
}
