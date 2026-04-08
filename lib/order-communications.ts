import {
  formatOperationalDate,
  formatOrderAmount,
  type TicketOperationalRecord,
} from "@/lib/ticket-operational";

type CommunicableOrder = TicketOperationalRecord & {
  request_summary?: string | null;
  request_details?: string | null;
};

export function buildSupplierOrderMailto(order: CommunicableOrder) {
  const recipient = order.supplier_email?.trim() ?? "";
  const poNumber = order.purchase_order_number?.trim() || order.id.slice(0, 8);
  const subject = `Order: ${poNumber}`;
  const lines = [
    `Please supply the following RELAY order.`,
    "",
    `PO Number: ${order.purchase_order_number ?? "-"}`,
    `Supplier: ${order.supplier_name ?? "-"}`,
    `Expected Delivery: ${formatOperationalDate(order.expected_delivery_date)}`,
    `Amount: ${formatOrderAmount(order.order_amount)}`,
    `Job Number: ${order.job_number ?? "-"}`,
    `Machine Reference: ${order.machine_reference ?? "-"}`,
    `Request Summary: ${order.request_summary ?? order.request_details ?? "-"}`,
    "",
    "Please confirm availability and lead time.",
  ];

  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    lines.join("\n"),
  )}`;
}

export function buildReadyOrdersMailto(orders: CommunicableOrder[]) {
  const subject = `Ready Orders: ${new Date().toISOString().slice(0, 10)}`;
  const lines = [
    "Ready orders list from RELAY.",
    "",
    ...orders.map((order) =>
      [
        `PO: ${order.purchase_order_number ?? "-"}`,
        `Supplier: ${order.supplier_name ?? "-"}`,
        `Job: ${order.job_number ?? "-"}`,
        `Machine: ${order.machine_reference ?? "-"}`,
        `Amount: ${formatOrderAmount(order.order_amount)}`,
        `Ready / Expected: ${formatOperationalDate(order.ready_at ?? order.expected_delivery_date)}`,
      ].join(" | "),
    ),
  ];

  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

export function buildOrdersCsvContent(orders: CommunicableOrder[]) {
  const csvRows = [
    [
      "status",
      "ordered_at",
      "ready_at",
      "expected_delivery_date",
      "purchase_order_number",
      "supplier_name",
      "supplier_email",
      "order_amount",
      "job_number",
      "machine_reference",
      "request_summary",
      "assigned_to",
    ],
    ...orders.map((order) => [
      order.status ?? "",
      order.ordered_at ?? "",
      order.ready_at ?? "",
      order.expected_delivery_date ?? "",
      order.purchase_order_number ?? "",
      order.supplier_name ?? "",
      order.supplier_email ?? "",
      typeof order.order_amount === "number" ? String(order.order_amount) : "",
      order.job_number ?? "",
      order.machine_reference ?? "",
      order.request_summary ?? order.request_details ?? "",
      order.assigned_to ?? "",
    ]),
  ];

  return csvRows
    .map((row) =>
      row
        .map((value) => `"${String(value).replaceAll("\"", "\"\"")}"`)
        .join(","),
    )
    .join("\n");
}
