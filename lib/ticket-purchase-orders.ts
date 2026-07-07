"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupplierName } from "@/lib/suppliers";

export const ticketPurchaseOrderStatuses = [
  "DRAFT",
  "SENT",
  "RECEIVED",
  "CANCELLED",
] as const;

export type TicketPurchaseOrderStatus = (typeof ticketPurchaseOrderStatuses)[number];

export type TicketPurchaseOrderRecord = {
  id: string;
  ticket_id: string;
  created_by: string | null;
  updated_by: string | null;
  supplier_name: string;
  supplier_name_normalized: string;
  purchase_order_number: string;
  supplier_email: string | null;
  order_amount: number | null;
  po_status: TicketPurchaseOrderStatus;
  notes: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type TicketPurchaseOrderRow = {
  id: string;
  ticket_id: string;
  created_by: string | null;
  updated_by: string | null;
  supplier_name: string | null;
  supplier_name_normalized: string | null;
  purchase_order_number: string | null;
  supplier_email: string | null;
  order_amount: number | string | null;
  po_status: string | null;
  notes: string | null;
  sent_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type TicketPurchaseOrderDraft = {
  supplier_name: string;
  purchase_order_number: string;
  supplier_email: string;
  order_amount: string;
  po_status: TicketPurchaseOrderStatus;
  notes: string;
};

export function buildEmptyTicketPurchaseOrderDraft(): TicketPurchaseOrderDraft {
  return {
    supplier_name: "",
    purchase_order_number: "",
    supplier_email: "",
    order_amount: "",
    po_status: "DRAFT",
    notes: "",
  };
}

export function buildTicketPurchaseOrderDraft(record: TicketPurchaseOrderRecord): TicketPurchaseOrderDraft {
  return {
    supplier_name: record.supplier_name,
    purchase_order_number: record.purchase_order_number,
    supplier_email: record.supplier_email ?? "",
    order_amount: typeof record.order_amount === "number" ? record.order_amount.toFixed(2) : "",
    po_status: record.po_status,
    notes: record.notes ?? "",
  };
}

export function formatTicketPurchaseOrderStatus(status: TicketPurchaseOrderStatus) {
  switch (status) {
    case "SENT":
      return "Sent";
    case "RECEIVED":
      return "Received";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Draft";
  }
}

export async function fetchTicketPurchaseOrders(supabase: SupabaseClient, ticketId: string) {
  const { data, error } = await supabase
    .from("ticket_purchase_orders")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as TicketPurchaseOrderRow[]).map(normalizeTicketPurchaseOrderRow);
}

export async function createTicketPurchaseOrder(
  supabase: SupabaseClient,
  payload: {
    ticketId: string;
    createdBy: string | null;
    updatedBy: string | null;
    supplierName: string;
    purchaseOrderNumber: string;
    supplierEmail?: string | null;
    orderAmount?: number | null;
    poStatus?: TicketPurchaseOrderStatus;
    notes?: string | null;
    sentAt?: string | null;
  },
) {
  const { data, error } = await supabase
    .from("ticket_purchase_orders")
    .insert({
      ticket_id: payload.ticketId,
      created_by: payload.createdBy,
      updated_by: payload.updatedBy,
      supplier_name: payload.supplierName.trim(),
      supplier_name_normalized: normalizeSupplierName(payload.supplierName),
      purchase_order_number: payload.purchaseOrderNumber.trim(),
      supplier_email: payload.supplierEmail?.trim() || null,
      order_amount: typeof payload.orderAmount === "number" ? payload.orderAmount : null,
      po_status: payload.poStatus ?? "DRAFT",
      notes: payload.notes?.trim() || null,
      sent_at: payload.sentAt ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeTicketPurchaseOrderRow(data as TicketPurchaseOrderRow);
}

function normalizeTicketPurchaseOrderRow(row: TicketPurchaseOrderRow): TicketPurchaseOrderRecord {
  return {
    id: row.id,
    ticket_id: row.ticket_id,
    created_by: row.created_by,
    updated_by: row.updated_by,
    supplier_name: row.supplier_name?.trim() || "",
    supplier_name_normalized: row.supplier_name_normalized?.trim() || normalizeSupplierName(row.supplier_name ?? ""),
    purchase_order_number: row.purchase_order_number?.trim() || "",
    supplier_email: row.supplier_email?.trim() || null,
    order_amount: typeof row.order_amount === "number" ? row.order_amount : typeof row.order_amount === "string" ? Number(row.order_amount) : null,
    po_status: normalizeTicketPurchaseOrderStatus(row.po_status),
    notes: row.notes?.trim() || null,
    sent_at: row.sent_at ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
  };
}

function normalizeTicketPurchaseOrderStatus(value: string | null | undefined): TicketPurchaseOrderStatus {
  if (ticketPurchaseOrderStatuses.includes(value as TicketPurchaseOrderStatus)) {
    return value as TicketPurchaseOrderStatus;
  }

  return "DRAFT";
}
