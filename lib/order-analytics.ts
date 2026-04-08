import {
  formatOrderAmount,
  isTicketOrderOverdue,
  isTrackedOrderRecord,
  type TicketOperationalRecord,
} from "@/lib/ticket-operational";

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
        (existing?.overdueCount ?? 0) + (isTicketOrderOverdue(ticket) ? 1 : 0),
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

export function formatSupplierSpend(value: number) {
  return formatOrderAmount(value);
}

function normalizeSupplierName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

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
