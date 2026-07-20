import type { SupabaseClient } from "@supabase/supabase-js";
import { rankBrowserSemanticIntent } from "@/lib/browser-semantic-model";
import { activeTicketStatuses } from "@/lib/statuses";

type AnalyticsIntent =
  | "overview"
  | "machines"
  | "suppliers"
  | "requesters"
  | "departments"
  | "operators"
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
  { intent: "machines", examples: "Which machine reference has the most requests? Show busiest machines." },
  { intent: "suppliers", examples: "Who is our main supplier? Which supplier receives the most purchase orders?" },
  { intent: "requesters", examples: "Who raises the most requests? Show the busiest requesters." },
  { intent: "departments", examples: "Which department creates the most tickets? Show demand by department." },
  { intent: "operators", examples: "Who handles the most jobs? Show workload by assigned operator." },
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
  machine_make: string | null;
  machine_model: string | null;
  job_number: string | null;
  request_summary: string | null;
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

export type RelayAnalyticsSnapshot = {
  tickets: RelayAnalyticsTicket[];
  purchaseOrders: RelayAnalyticsPurchaseOrder[];
  loadedAt: Date;
};

export type RelayConsoleAiAnswer = {
  text: string;
  facts: string[];
  sourceNote: string;
};

const TICKET_FIELDS = [
  "id",
  "requester_name",
  "department",
  "machine_reference",
  "machine_make",
  "machine_model",
  "job_number",
  "request_summary",
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

const PAGE_SIZE = 1000;

function toNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function loadAllTickets(supabase: SupabaseClient) {
  const rows: RelayAnalyticsTicket[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tickets")
      .select(TICKET_FIELDS)
      .order("created_at", { ascending: false })
      .range(start, start + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as RelayAnalyticsTicket[];
    rows.push(...page.map((row) => ({ ...row, order_amount: toNullableNumber(row.order_amount) })));
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadAllPurchaseOrders(supabase: SupabaseClient) {
  const rows: RelayAnalyticsPurchaseOrder[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("ticket_purchase_orders")
      .select(PURCHASE_ORDER_FIELDS)
      .order("created_at", { ascending: false })
      .range(start, start + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as RelayAnalyticsPurchaseOrder[];
    rows.push(...page.map((row) => ({ ...row, order_amount: toNullableNumber(row.order_amount) })));
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function loadRelayAnalyticsSnapshot(supabase: SupabaseClient) {
  const [tickets, purchaseOrders] = await Promise.all([
    loadAllTickets(supabase),
    loadAllPurchaseOrders(supabase),
  ]);
  return { tickets, purchaseOrders, loadedAt: new Date() } satisfies RelayAnalyticsSnapshot;
}

type GroupValue = { key: string; label: string; count: number; total: number };

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") || "";
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
  const query = ` ${normalize(question)} `;
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

async function detectIntent(question: string) {
  try {
    const match = await rankBrowserSemanticIntent(question, ANALYTICS_INTENTS);
    if (match && match.score >= 0.27) return match.intent;
  } catch (error) {
    console.warn("RELAY AI semantic router unavailable; using local analytics rules", error);
  }
  return detectIntentFromWords(question);
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
) {
  const intent = await detectIntent(question);
  switch (intent) {
    case "machines": return answerMachines(snapshot);
    case "suppliers": return answerSuppliers(snapshot);
    case "spend": return answerSuppliers(snapshot, true);
    case "requesters": return answerRankedTickets(snapshot, "requester_name", "Top requesters", "No requester names are recorded.");
    case "departments": return answerRankedTickets(snapshot, "department", "Top departments", "No departments are recorded.");
    case "operators": return answerRankedTickets(snapshot, "assigned_to", "Operator workload", "No operator assignments are recorded.");
    case "statuses": return answerStatuses(snapshot);
    case "overdue": return answerAttention(snapshot, "overdue");
    case "urgent": return answerAttention(snapshot, "urgent");
    case "unassigned": return answerAttention(snapshot, "unassigned");
    case "ready": return answerAttention(snapshot, "ready");
    case "trends": return answerTrends(snapshot);
    case "requests": return answerRankedTickets(snapshot, "request_summary", "Most common request summaries", "No request summaries are recorded.");
    case "overview": return answerOverview(snapshot);
  }
}
