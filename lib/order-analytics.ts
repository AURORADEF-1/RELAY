import {
  formatOrderAmount,
  isTicketOrderOverdue,
  isTicketPastExpectedDelivery,
  isTrackedOrderRecord,
  type TicketOperationalRecord,
} from "@/lib/ticket-operational";
import { normalizeSupplierName } from "@/lib/suppliers";

export type SupplierOrderSummary = {
  supplierName: string;
  normalizedSupplierName: string;
  orderCount: number;
  overdueCount: number;
  totalSpend: number;
  lastOrderedAt: string | null;
};

export type OrdersSnapshot = {
  trackedOrders: TicketOperationalRecord[];
  overdueOrders: TicketOperationalRecord[];
  openOrdersCount: number;
  totalSpend: number;
  supplierCount: number;
  supplierSummaries: SupplierOrderSummary[];
};

export function buildOrdersSnapshot(tickets: TicketOperationalRecord[]): OrdersSnapshot {
  const trackedOrders = tickets
    .filter(isTrackedOrderRecord)
    .sort((left, right) => {
      const leftTime = getOrderSortTime(left);
      const rightTime = getOrderSortTime(right);
      return rightTime - leftTime;
    });

  const overdueOrders = trackedOrders.filter((ticket) => isTicketOrderOverdue(ticket));
  const openOrdersCount = trackedOrders.filter((ticket) => ticket.status === "ORDERED").length;
  const supplierMap = new Map<string, SupplierOrderSummary>();

  trackedOrders.forEach((ticket) => {
    const supplierName = ticket.supplier_name?.trim();

    if (!supplierName) {
      return;
    }

    const normalizedSupplierName = normalizeSupplierName(supplierName);
    const existing = supplierMap.get(normalizedSupplierName);
    const orderAmount = typeof ticket.order_amount === "number" ? ticket.order_amount : 0;
    const lastOrderedAt = latestTimestamp(
      existing?.lastOrderedAt ?? null,
      ticket.ordered_at ?? ticket.updated_at ?? ticket.created_at ?? null,
    );

    supplierMap.set(normalizedSupplierName, {
      supplierName: existing?.supplierName ?? supplierName,
      normalizedSupplierName,
      orderCount: (existing?.orderCount ?? 0) + 1,
      overdueCount:
        (existing?.overdueCount ?? 0) + (isTicketPastExpectedDelivery(ticket) ? 1 : 0),
      totalSpend: Number(((existing?.totalSpend ?? 0) + orderAmount).toFixed(2)),
      lastOrderedAt,
    });
  });

  const supplierSummaries = Array.from(supplierMap.values()).sort((left, right) => {
    if (right.totalSpend !== left.totalSpend) {
      return right.totalSpend - left.totalSpend;
    }

    return right.orderCount - left.orderCount;
  });

  const totalSpend = Number(
    trackedOrders
      .reduce((sum, ticket) => sum + (typeof ticket.order_amount === "number" ? ticket.order_amount : 0), 0)
      .toFixed(2),
  );

  return {
    trackedOrders,
    overdueOrders,
    openOrdersCount,
    totalSpend,
    supplierCount: supplierSummaries.length,
    supplierSummaries,
  };
}

export type MonthlySupplierSpendSnapshot = {
  id?: string;
  month_start: string;
  supplier_name: string;
  supplier_name_normalized: string;
  order_count: number;
  total_spend: number;
  generated_at: string;
};

export function buildMonthlySupplierSpendSnapshots(tickets: TicketOperationalRecord[]) {
  const monthMap = new Map<string, Map<string, MonthlySupplierSpendSnapshot>>();

  tickets
    .filter(isTrackedOrderRecord)
    .forEach((ticket) => {
      const supplierName = ticket.supplier_name?.trim();
      const orderedAt = ticket.ordered_at ?? ticket.updated_at ?? ticket.created_at;

      if (!supplierName || !orderedAt) {
        return;
      }

      const orderedDate = new Date(orderedAt);

      if (Number.isNaN(orderedDate.getTime())) {
        return;
      }

      const monthStart = `${orderedDate.getFullYear()}-${String(orderedDate.getMonth() + 1).padStart(2, "0")}-01`;
      const normalizedSupplierName = normalizeSupplierName(supplierName);
      const monthEntries = monthMap.get(monthStart) ?? new Map<string, MonthlySupplierSpendSnapshot>();
      const existing = monthEntries.get(normalizedSupplierName);
      const orderAmount = typeof ticket.order_amount === "number" ? ticket.order_amount : 0;

      monthEntries.set(normalizedSupplierName, {
        month_start: monthStart,
        supplier_name: existing?.supplier_name ?? supplierName,
        supplier_name_normalized: normalizedSupplierName,
        order_count: (existing?.order_count ?? 0) + 1,
        total_spend: Number(((existing?.total_spend ?? 0) + orderAmount).toFixed(2)),
        generated_at: new Date().toISOString(),
      });

      monthMap.set(monthStart, monthEntries);
    });

  return Array.from(monthMap.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .flatMap(([, monthEntries]) =>
      Array.from(monthEntries.values()).sort((left, right) => right.total_spend - left.total_spend),
    );
}

export function formatSupplierSpend(value: number) {
  return formatOrderAmount(value);
}

export function getOrdersFilterStatuses(filter: OrdersFilterKey) {
  switch (filter) {
    case "live":
      return ["ORDERED"] as const;
    case "ready":
      return ["READY"] as const;
    case "completed":
      return ["COMPLETED"] as const;
    default:
      return ["ORDERED", "READY", "COMPLETED"] as const;
  }
}

export type OrdersFilterKey = "all" | "live" | "ready" | "completed";

function getOrderSortTime(ticket: TicketOperationalRecord) {
  const source = ticket.ordered_at ?? ticket.updated_at ?? ticket.created_at;
  const time = source ? new Date(source).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function latestTimestamp(left: string | null, right: string | null) {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}
