import { type TicketOperationalRecord } from "@/lib/ticket-operational";

export type RetailDeliveryMethod = "collect" | "delivery";
export type RetailCustomerDispatchChannel = "email" | "whatsapp" | "records";

export type RetailCustomerDispatchPlan = {
  channel: RetailCustomerDispatchChannel;
  customerHref: string | null;
  recordsHref: string | null;
  summary: string;
  openInBrowser: boolean;
};

export type RetailTicketRecord = TicketOperationalRecord & {
  is_retail_sale?: boolean | null;
  retail_sales_reference?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  retail_delivery_method?: RetailDeliveryMethod | null;
  retail_delivery_address?: string | null;
  retail_apc_tracking_number?: string | null;
};

export function buildRetailCustomerDispatchPlan(
  ticket: RetailTicketRecord,
  stage: "ordered" | "ready",
): RetailCustomerDispatchPlan {
  const email = ticket.customer_email?.trim() || "";
  const phone = normalizePhoneNumber(ticket.customer_phone ?? "");
  const summary = buildRetailCustomerSummary(ticket, stage);
  const recordsHref = buildRetailCustomerRecordsMailto(ticket, stage);

  if (email) {
    return {
      channel: "email",
      customerHref: buildRetailCustomerMailto(ticket, stage, email),
      recordsHref,
      summary,
      openInBrowser: true,
    };
  }

  if (phone) {
    return {
      channel: "whatsapp",
      customerHref: buildRetailCustomerWhatsAppHref(ticket, stage, phone),
      recordsHref,
      summary,
      openInBrowser: true,
    };
  }

  return {
    channel: "records",
    customerHref: null,
    recordsHref,
    summary,
    openInBrowser: false,
  };
}

export function buildRetailCustomerComment(ticket: RetailTicketRecord, stage: "ordered" | "ready") {
  const method = ticket.retail_delivery_method?.trim().toLowerCase();
  const customerName = ticket.customer_name?.trim() || "Customer";
  const partsRequired = ticket.request_summary?.trim() || ticket.request_details?.trim() || "your part";

  if (stage === "ordered") {
    return `${customerName} retail order prepared for ${partsRequired}.`;
  }

  if (stage === "ready" && method === "delivery") {
    const tracking = ticket.retail_apc_tracking_number?.trim() || "tracking pending";
    return `${customerName} out-for-delivery update prepared for ${partsRequired}. APC tracking ${tracking}.`;
  }

  if (stage === "ready" && method !== "delivery") {
    return `${customerName} collection update prepared for ${partsRequired}.`;
  }

  return `${customerName} retail workflow update prepared for ${partsRequired}.`;
}

export function buildRetailCustomerSummary(
  ticket: RetailTicketRecord,
  stage: "ordered" | "ready",
) {
  const deliveryMethod = ticket.retail_delivery_method?.trim().toLowerCase();
  const customerName = ticket.customer_name?.trim() || "customer";

  if (stage === "ready" && deliveryMethod === "delivery") {
    return `Out-for-delivery draft prepared for ${customerName}. APC tracking will be included.`;
  }

  if (stage === "ready" && deliveryMethod !== "delivery") {
    return `Ready-to-collect draft prepared for ${customerName}.`;
  }

  if (deliveryMethod === "delivery") {
    return `Delivery draft prepared for ${customerName}.`;
  }

  return `Retail customer update prepared for ${customerName}.`;
}

export function buildRetailCustomerMailto(
  ticket: RetailTicketRecord,
  stage: "ordered" | "ready",
  recipient: string,
) {
  const subject = buildRetailCustomerSubject(ticket, stage);
  const body = buildRetailCustomerBodyLines(ticket, stage).join("\n");

  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildRetailCustomerRecordsMailto(
  ticket: RetailTicketRecord,
  stage: "ordered" | "ready",
) {
  const subject = buildRetailCustomerSubject(ticket, stage);
  const body = buildRetailCustomerBodyLines(ticket, stage).join("\n");

  return `mailto:${encodeURIComponent("Parts@mervynlambert.co.uk")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildRetailCustomerWhatsAppHref(
  ticket: RetailTicketRecord,
  stage: "ordered" | "ready",
  recipient: string,
) {
  const message = buildRetailCustomerBodyLines(ticket, stage).join("\n");
  return `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`;
}

export function buildRetailCustomerSubject(
  ticket: RetailTicketRecord,
  stage: "ordered" | "ready",
) {
  const salesReference = ticket.retail_sales_reference?.trim() || ticket.id.slice(0, 8).toUpperCase();

  if (stage === "ready" && ticket.retail_delivery_method === "delivery") {
    return `Order ${salesReference} - Out for delivery`;
  }

  if (ticket.retail_delivery_method === "delivery") {
    return `Order ${salesReference} - Out for delivery`;
  }

  return `Order ${salesReference} - Ready to collect`;
}

export function buildRetailCustomerBodyLines(
  ticket: RetailTicketRecord,
  stage: "ordered" | "ready",
) {
  const partsRequired = ticket.request_summary?.trim() || ticket.request_details?.trim() || "-";
  const customerName = ticket.customer_name?.trim() || "Customer";
  const salesReference = ticket.retail_sales_reference?.trim() || ticket.id.slice(0, 8).toUpperCase();
  const deliveryAddress = ticket.retail_delivery_address?.trim() || "-";
  const tracking = ticket.retail_apc_tracking_number?.trim() || "-";
  if (stage === "ready" && ticket.retail_delivery_method === "delivery") {
    return [
      `Hello ${customerName},`,
      "",
      `Your order of ${partsRequired} is out for delivery.`,
      `Order Reference: ${salesReference}`,
      `Delivery Address: ${deliveryAddress}`,
      `APC Tracking Number: ${tracking}`,
      "",
      "Please keep this message for your records.",
    ];
  }

  if (ticket.retail_delivery_method === "delivery") {
    return [
      `Hello ${customerName},`,
      "",
      `Your order of ${partsRequired} is out for delivery.`,
      `Order Reference: ${salesReference}`,
      `Delivery Address: ${deliveryAddress}`,
      `APC Tracking Number: ${tracking}`,
      "",
      "Please keep this message for your records.",
    ];
  }

  return [
    `Hello ${customerName},`,
    "",
    `Your order of ${partsRequired} is ready to collect from Stores.`,
    `Order Reference: ${salesReference}`,
    "",
    "Please collect when convenient.",
  ];
}

function normalizePhoneNumber(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const digits = trimmed.replace(/[^0-9+]/g, "").replace(/^\+/, "");

  if (digits.startsWith("0")) {
    return `44${digits.slice(1)}`;
  }

  if (digits.startsWith("44")) {
    return digits;
  }

  return digits;
}
