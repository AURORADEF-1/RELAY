import {
  buildOrdersSnapshot,
  formatSupplierSpend,
  type MonthlySupplierSpendSnapshot,
} from "@/lib/order-analytics";
import { formatOperationalDate, formatOrderAmount, type TicketOperationalRecord } from "@/lib/ticket-operational";
import {
  canonicalizeSupplierDisplayName,
  normalizeSupplierName,
} from "@/lib/suppliers";

export type SupplierWorkflowStage =
  | "draft"
  | "ready"
  | "emailed"
  | "whatsapp_sent"
  | "follow_up";

export type SupplierPreferredContactMethod =
  | "email"
  | "phone"
  | "whatsapp"
  | "manual";

export type SupplierContactRecord = {
  id?: string;
  supplier_name: string;
  supplier_name_normalized: string;
  contact_email: string | null;
  contact_phone: string | null;
  whatsapp_number: string | null;
  preferred_contact_method: SupplierPreferredContactMethod | null;
  workflow_stage: SupplierWorkflowStage | null;
  notes: string | null;
  last_contacted_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SupplierDirectoryTrendRow = {
  month_start: string;
  order_count: number;
  total_spend: number;
};

export type SupplierDirectoryOrder = TicketOperationalRecord & {
  supplier_email?: string | null;
};

export type SupplierDirectoryEntry = {
  supplierName: string;
  normalizedSupplierName: string;
  orderCount: number;
  overdueCount: number;
  totalSpend: number;
  lastOrderedAt: string | null;
  currentMonthOrderCount: number;
  currentMonthSpend: number;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsappNumber: string | null;
  preferredContactMethod: SupplierPreferredContactMethod | null;
  workflowStage: SupplierWorkflowStage | null;
  notes: string | null;
  lastContactedAt: string | null;
  latestTicketSupplierEmail: string | null;
  monthlyTrend: SupplierDirectoryTrendRow[];
  recentOrders: SupplierDirectoryOrder[];
};

export type SupplierBriefTicket = Pick<
  SupplierDirectoryOrder,
  | "id"
  | "job_number"
  | "machine_reference"
  | "purchase_order_number"
  | "request_summary"
  | "request_details"
  | "ordered_at"
  | "expected_delivery_date"
  | "order_amount"
  | "status"
>;

const DEFAULT_WORKFLOW_STAGE: SupplierWorkflowStage = "draft";

export function buildSupplierDirectoryEntries({
  tickets,
  monthlySpendSnapshots,
  contacts,
}: {
  tickets: SupplierDirectoryOrder[];
  monthlySpendSnapshots: MonthlySupplierSpendSnapshot[];
  contacts: SupplierContactRecord[];
}) {
  const orderSnapshot = buildOrdersSnapshot(tickets);
  const trackedOrders = orderSnapshot.trackedOrders as SupplierDirectoryOrder[];
  const supplierSummaryByKey = new Map(
    orderSnapshot.supplierSummaries.map((summary) => [summary.normalizedSupplierName, summary]),
  );
  const monthlyTrendByKey = new Map<string, SupplierDirectoryTrendRow[]>();
  const contactByKey = new Map(
    contacts.map((contact) => [contact.supplier_name_normalized, contact]),
  );
  const recentOrdersByKey = new Map<string, SupplierDirectoryOrder[]>();

  monthlySpendSnapshots.forEach((snapshot) => {
    const normalized = snapshot.supplier_name_normalized?.trim().toLowerCase();

    if (!normalized) {
      return;
    }

    const currentRows = monthlyTrendByKey.get(normalized) ?? [];
    currentRows.push({
      month_start: snapshot.month_start,
      order_count: snapshot.order_count,
      total_spend: Number(Number(snapshot.total_spend).toFixed(2)),
    });
    monthlyTrendByKey.set(normalized, currentRows);
  });

  trackedOrders.forEach((ticket) => {
    const supplierName = ticket.supplier_name?.trim();

    if (!supplierName) {
      return;
    }

    const normalized = normalizeSupplierName(supplierName);
    const currentOrders = recentOrdersByKey.get(normalized) ?? [];
    currentOrders.push(ticket);
    recentOrdersByKey.set(normalized, currentOrders);
  });

  const normalizedKeys = new Set<string>([
    ...supplierSummaryByKey.keys(),
    ...monthlyTrendByKey.keys(),
    ...contactByKey.keys(),
    ...recentOrdersByKey.keys(),
  ]);

  const entries = Array.from(normalizedKeys.values()).map((normalizedSupplierName) => {
    const summary = supplierSummaryByKey.get(normalizedSupplierName);
    const contact = contactByKey.get(normalizedSupplierName);
    const monthlyTrend = (monthlyTrendByKey.get(normalizedSupplierName) ?? []).sort((left, right) =>
      right.month_start.localeCompare(left.month_start),
    );
    const recentOrders = (recentOrdersByKey.get(normalizedSupplierName) ?? [])
      .slice()
      .sort((left, right) => getSupplierOrderSortTime(right) - getSupplierOrderSortTime(left))
      .slice(0, 5);
    const latestTrackedOrder = recentOrders[0] ?? null;
    const supplierName =
      contact?.supplier_name?.trim() ||
      summary?.supplierName?.trim() ||
      latestTrackedOrder?.supplier_name?.trim() ||
      canonicalizeSupplierDisplayName(normalizedSupplierName);
    const currentMonthKey = getCurrentMonthKey();
    const currentMonthTrendRow = monthlyTrend.find((row) => row.month_start === currentMonthKey) ?? null;

    return {
      supplierName,
      normalizedSupplierName,
      orderCount: summary?.orderCount ?? monthlyTrend.reduce((sum, row) => sum + row.order_count, 0),
      overdueCount: summary?.overdueCount ?? 0,
      totalSpend: Number(
        (summary?.totalSpend ?? monthlyTrend.reduce((sum, row) => sum + row.total_spend, 0)).toFixed(2),
      ),
      lastOrderedAt:
        summary?.lastOrderedAt ??
        latestTrackedOrder?.ordered_at ??
        latestTrackedOrder?.updated_at ??
        latestTrackedOrder?.created_at ??
        null,
      currentMonthOrderCount: currentMonthTrendRow?.order_count ?? 0,
      currentMonthSpend: Number((currentMonthTrendRow?.total_spend ?? 0).toFixed(2)),
      contactEmail: contact?.contact_email?.trim() || latestTrackedOrder?.supplier_email?.trim() || null,
      contactPhone: contact?.contact_phone?.trim() || null,
      whatsappNumber: contact?.whatsapp_number?.trim() || contact?.contact_phone?.trim() || null,
      preferredContactMethod: contact?.preferred_contact_method ?? null,
      workflowStage: contact?.workflow_stage ?? DEFAULT_WORKFLOW_STAGE,
      notes: contact?.notes?.trim() || null,
      lastContactedAt: contact?.last_contacted_at ?? null,
      latestTicketSupplierEmail: latestTrackedOrder?.supplier_email?.trim() || null,
      monthlyTrend,
      recentOrders,
    } satisfies SupplierDirectoryEntry;
  });

  const supplierOptions = Array.from(
    new Set(
      entries
        .map((entry) => entry.supplierName.trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));

  entries.sort((left, right) => {
    if (right.totalSpend !== left.totalSpend) {
      return right.totalSpend - left.totalSpend;
    }

    if (right.orderCount !== left.orderCount) {
      return right.orderCount - left.orderCount;
    }

    return left.supplierName.localeCompare(right.supplierName);
  });

  return {
    entries,
    supplierOptions,
    trackedOrders,
    orderSnapshot,
  };
}

export function buildSupplierSuggestionOptions(values: Array<string | null | undefined>) {
  const suggestionMap = new Map<string, string>();

  values.forEach((value) => {
    const trimmed = value?.trim() || "";

    if (!trimmed) {
      return;
    }

    const normalized = normalizeSupplierName(trimmed);

    if (!suggestionMap.has(normalized)) {
      suggestionMap.set(normalized, canonicalizeSupplierDisplayName(trimmed));
    }
  });

  return Array.from(suggestionMap.values()).sort((left, right) => left.localeCompare(right));
}

export function isLikelyInvalidSupplierName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return true;
  }

  if (normalized.length < 3) {
    return true;
  }

  if (/^\d+$/.test(normalized)) {
    return true;
  }

  if (/^[A-Z]{2}\d{2}\s?[A-Z]{3}$/i.test(normalized)) {
    return true;
  }

  return false;
}

export function buildSupplierBriefText(
  entry: SupplierDirectoryEntry,
  ticket?: SupplierBriefTicket | null,
) {
  const lines = [
    `Supplier: ${entry.supplierName}`,
    `Orders: ${entry.orderCount}`,
    `Total spend: ${formatSupplierSpend(entry.totalSpend)}`,
    `Current month orders: ${entry.currentMonthOrderCount}`,
    `Current month spend: ${formatSupplierSpend(entry.currentMonthSpend)}`,
    `Last ordered: ${formatOperationalDate(entry.lastOrderedAt)}`,
    `Contact email: ${entry.contactEmail ?? entry.latestTicketSupplierEmail ?? "-"}`,
    `Contact phone: ${entry.contactPhone ?? "-"}`,
    `WhatsApp: ${entry.whatsappNumber ?? "-"}`,
    `Workflow stage: ${entry.workflowStage ?? "-"}`,
    "",
    "Latest ticket",
    `PO: ${ticket?.purchase_order_number ?? "-"}`,
    `Job: ${ticket?.job_number ?? "-"}`,
    `Machine: ${ticket?.machine_reference ?? "-"}`,
    `Amount: ${formatOrderAmount(ticket?.order_amount ?? null)}`,
    `Expected delivery: ${formatOperationalDate(ticket?.expected_delivery_date)}`,
    `Status: ${ticket?.status ?? "-"}`,
    `Summary: ${ticket?.request_summary ?? ticket?.request_details ?? "-"}`,
  ];

  return lines.join("\n");
}

export function buildSupplierMailtoHref(
  entry: SupplierDirectoryEntry,
  ticket?: SupplierBriefTicket | null,
) {
  const recipient = entry.contactEmail?.trim() || entry.latestTicketSupplierEmail?.trim() || "";

  if (!recipient) {
    return null;
  }

  const subject = `RELAY supplier follow-up: ${entry.supplierName}`;
  const body = buildSupplierBriefText(entry, ticket);

  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildSupplierWhatsAppHref(
  entry: SupplierDirectoryEntry,
  ticket?: SupplierBriefTicket | null,
) {
  const recipient = normalizePhoneNumber(entry.whatsappNumber ?? entry.contactPhone ?? "");

  if (!recipient) {
    return null;
  }

  const body = buildSupplierBriefText(entry, ticket);

  return `https://wa.me/${recipient}?text=${encodeURIComponent(body)}`;
}

export function normalizePhoneNumber(value: string) {
  return value.replace(/[^\d]/g, "");
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function getSupplierOrderSortTime(ticket: SupplierDirectoryOrder) {
  const source = ticket.ordered_at ?? ticket.updated_at ?? ticket.created_at;
  const time = source ? new Date(source).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}
