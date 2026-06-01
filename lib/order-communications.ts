import {
  formatOperationalDate,
  formatOrderAmount,
  type TicketOperationalRecord,
} from "@/lib/ticket-operational";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupplierName } from "@/lib/suppliers";

type CommunicableOrder = TicketOperationalRecord & {
  request_summary?: string | null;
  request_details?: string | null;
};

type SupplierDispatchContact = {
  contact_email: string | null;
  contact_phone: string | null;
  whatsapp_number: string | null;
  preferred_contact_method: "email" | "phone" | "whatsapp" | "manual" | null;
};

export type SupplierOrderDispatchPlan = {
  channel: "email" | "whatsapp" | "records";
  supplierHref: string | null;
  recordsHref: string | null;
  summary: string;
  supplierContactSummary: string;
  openInBrowser: boolean;
};

export type SupplierOrderDispatchPreference = "none" | "email" | "whatsapp";

export const PARTS_RECORDS_EMAIL = "Parts@mervynlambert.co.uk";

export function buildSupplierOrderMailto(order: CommunicableOrder) {
  const recipient = order.supplier_email?.trim() ?? "";
  const subject = buildSupplierOrderSubject(order);
  const lines = buildSupplierOrderBodyLines(order);

  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    lines.join("\n"),
  )}&cc=${encodeURIComponent(PARTS_RECORDS_EMAIL)}`;
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

export function buildSupplierOrderSubject(order: CommunicableOrder) {
  const poNumber = order.purchase_order_number?.trim() || order.id.slice(0, 8).toUpperCase();
  const shortTicketId = order.id.slice(0, 8).toUpperCase();
  return `Order ${poNumber} - Parts Required - ${shortTicketId}`;
}

export function buildSupplierOrderBodyLines(order: CommunicableOrder) {
  const poNumber = order.purchase_order_number?.trim() || order.id.slice(0, 8).toUpperCase();
  const shortTicketId = order.id.slice(0, 8).toUpperCase();
  const partsRequired = order.request_summary?.trim() || order.request_details?.trim() || "-";

  return [
    `Please supply the following RELAY order.`,
    "",
    `Order Number: ${poNumber}`,
    `Parts Required: ${partsRequired}`,
    `Ticket ID: ${shortTicketId}`,
    `Supplier: ${order.supplier_name ?? "-"}`,
    `Expected Delivery: ${formatOperationalDate(order.expected_delivery_date)}`,
    `Amount: ${formatOrderAmount(order.order_amount)}`,
    `Job Number: ${order.job_number ?? "-"}`,
    `Machine Reference: ${order.machine_reference ?? "-"}`,
    "",
    "Please confirm availability and lead time.",
  ];
}

export function buildSupplierOrderRecordsMailto(order: CommunicableOrder) {
  const subject = buildSupplierOrderSubject(order);
  const body = buildSupplierOrderBodyLines(order).join("\n");

  return `mailto:${encodeURIComponent(PARTS_RECORDS_EMAIL)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

export function buildSupplierOrderWhatsAppHref(order: CommunicableOrder, recipient: string) {
  const normalizedRecipient = normalizePhoneNumber(recipient);

  if (!normalizedRecipient) {
    return null;
  }

  const message = buildSupplierOrderBodyLines(order).join("\n");
  return `https://wa.me/${normalizedRecipient}?text=${encodeURIComponent(message)}`;
}

export async function loadSupplierDispatchContact(
  supabase: SupabaseClient,
  supplierName: string,
) {
  const normalizedSupplierName = normalizeSupplierName(supplierName);

  if (!normalizedSupplierName) {
    return null;
  }

  const { data, error } = await supabase
    .from("supplier_contacts")
    .select("contact_email, contact_phone, whatsapp_number, preferred_contact_method")
    .eq("supplier_name_normalized", normalizedSupplierName)
    .maybeSingle<SupplierDispatchContact>();

  if (error) {
    return null;
  }

  return data ?? null;
}

export function buildSupplierOrderDispatchPlan(
  order: CommunicableOrder,
  contact: SupplierDispatchContact | null,
  preferredChannel: SupplierOrderDispatchPreference = "none",
): SupplierOrderDispatchPlan {
  const supplierEmail = contact?.contact_email?.trim() || order.supplier_email?.trim() || "";
  const supplierPhone = contact?.whatsapp_number?.trim() || contact?.contact_phone?.trim() || "";
  const preferredMethod = contact?.preferred_contact_method ?? "manual";
  const wantsEmail = preferredChannel === "email";
  const wantsWhatsApp = preferredChannel === "whatsapp";

  if (wantsEmail && supplierEmail) {
    return {
      channel: "email",
      supplierHref: buildSupplierOrderMailto({ ...order, supplier_email: supplierEmail }),
      recordsHref: null,
      summary: `Email draft prepared for the supplier and copied to ${PARTS_RECORDS_EMAIL}.`,
      supplierContactSummary: `Email ${supplierEmail}.`,
      openInBrowser: true,
    };
  }

  if (wantsWhatsApp && supplierPhone) {
    return {
      channel: "whatsapp",
      supplierHref: buildSupplierOrderWhatsAppHref(order, supplierPhone),
      recordsHref: buildSupplierOrderRecordsMailto(order),
      summary: `WhatsApp draft prepared for the supplier and a records copy was prepared for ${PARTS_RECORDS_EMAIL}.`,
      supplierContactSummary: `WhatsApp ${supplierPhone}.`,
      openInBrowser: true,
    };
  }

  if (preferredMethod === "email" && supplierEmail) {
    return {
      channel: "email",
      supplierHref: buildSupplierOrderMailto({ ...order, supplier_email: supplierEmail }),
      recordsHref: null,
      summary: `Email draft prepared for the supplier and copied to ${PARTS_RECORDS_EMAIL}.`,
      supplierContactSummary: `Email ${supplierEmail}.`,
      openInBrowser: true,
    };
  }

  if ((preferredMethod === "whatsapp" || preferredMethod === "phone") && supplierPhone) {
    return {
      channel: "whatsapp",
      supplierHref: buildSupplierOrderWhatsAppHref(order, supplierPhone),
      recordsHref: buildSupplierOrderRecordsMailto(order),
      summary: `WhatsApp draft prepared for the supplier and a records copy was prepared for ${PARTS_RECORDS_EMAIL}.`,
      supplierContactSummary: `WhatsApp ${supplierPhone}.`,
      openInBrowser: true,
    };
  }

  if (supplierEmail) {
    return {
      channel: "email",
      supplierHref: buildSupplierOrderMailto({ ...order, supplier_email: supplierEmail }),
      recordsHref: null,
      summary: `Email draft prepared for the supplier and copied to ${PARTS_RECORDS_EMAIL}.`,
      supplierContactSummary: `Email ${supplierEmail}.`,
      openInBrowser: true,
    };
  }

  if (supplierPhone) {
    return {
      channel: "whatsapp",
      supplierHref: buildSupplierOrderWhatsAppHref(order, supplierPhone),
      recordsHref: buildSupplierOrderRecordsMailto(order),
      summary: `WhatsApp draft prepared for the supplier and a records copy was prepared for ${PARTS_RECORDS_EMAIL}.`,
      supplierContactSummary: `WhatsApp ${supplierPhone}.`,
      openInBrowser: true,
    };
  }

  return {
    channel: "records",
    supplierHref: null,
    recordsHref: buildSupplierOrderRecordsMailto(order),
    summary:
      preferredChannel === "none"
        ? `No supplier draft was opened. A records copy was prepared for ${PARTS_RECORDS_EMAIL}.`
        : `No supplier email or WhatsApp address was available, so a records-only copy was prepared for ${PARTS_RECORDS_EMAIL}.`,
    supplierContactSummary: "No supplier contact address on file.",
    openInBrowser: preferredChannel !== "none",
  };
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

function normalizePhoneNumber(value: string) {
  const digits = value.replace(/[^\d]/g, "");

  if (!digits) {
    return "";
  }

  return digits;
}
