"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export const ticketPartStatuses = [
  "REQUESTED",
  "SOURCED",
  "FITTED",
  "CANCELLED",
] as const;

export type TicketPartStatus = (typeof ticketPartStatuses)[number];

export type TicketPartRecord = {
  id: string;
  ticket_id: string;
  ticket_purchase_order_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  job_number: string | null;
  machine_reference: string | null;
  machine_number_normalized: string | null;
  machine_make: string | null;
  machine_model: string | null;
  part_description: string;
  part_number: string;
  quantity: number;
  received_quantity: number;
  received_at: string | null;
  received_by: string | null;
  part_status: TicketPartStatus;
  supplier_name: string | null;
  notes: string | null;
  source_system: string | null;
  source_product_id: string | null;
  source_price_snapshot: number | null;
  source_currency: string | null;
  source_stock_snapshot: number | null;
  source_checked_at: string | null;
  source_bin_location: string | null;
  source_subgroup: string | null;
  source_requested_quantity: number | null;
  source_issued_quantity: number | null;
  source_shortfall_quantity: number | null;
  source_stock_after: number | null;
  source_allocation_status: string | null;
  created_at: string;
  updated_at: string;
};

type TicketPartRow = {
  id: string;
  ticket_id: string;
  ticket_purchase_order_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  job_number: string | null;
  machine_reference: string | null;
  machine_number_normalized: string | null;
  machine_make: string | null;
  machine_model: string | null;
  part_description: string | null;
  part_number: string | null;
  quantity: number | null;
  received_quantity: number | null;
  received_at: string | null;
  received_by: string | null;
  part_status: string | null;
  supplier_name: string | null;
  notes: string | null;
  source_system?: string | null;
  source_product_id?: string | null;
  source_price_snapshot?: number | string | null;
  source_currency?: string | null;
  source_stock_snapshot?: number | null;
  source_checked_at?: string | null;
  source_bin_location?: string | null;
  source_subgroup?: string | null;
  source_requested_quantity?: number | null;
  source_issued_quantity?: number | null;
  source_shortfall_quantity?: number | null;
  source_stock_after?: number | null;
  source_allocation_status?: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type TicketPartDraft = {
  part_description: string;
  part_number: string;
  quantity: string;
  ticket_purchase_order_id: string;
  supplier_name: string;
  notes: string;
  part_status: TicketPartStatus;
};

export function buildEmptyTicketPartDraft(): TicketPartDraft {
  return {
    part_description: "",
    part_number: "",
    quantity: "1",
    ticket_purchase_order_id: "",
    supplier_name: "",
    notes: "",
    part_status: "REQUESTED",
  };
}

export function buildTicketPartDraft(record: TicketPartRecord): TicketPartDraft {
  return {
    part_description: record.part_description,
    part_number: record.part_number,
    quantity: String(record.quantity),
    ticket_purchase_order_id: record.ticket_purchase_order_id ?? "",
    supplier_name: record.supplier_name ?? "",
    notes: record.notes ?? "",
    part_status: record.part_status,
  };
}

export function formatTicketPartStatus(status: TicketPartStatus) {
  switch (status) {
    case "SOURCED":
      return "Sourced";
    case "FITTED":
      return "Fitted";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Requested";
  }
}

export function normalizeTicketPartMachineReference(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, "").toUpperCase() || null;
}

export function getTicketPartOutstandingQuantity(
  part: Pick<TicketPartRecord, "quantity" | "received_quantity" | "part_status">,
) {
  if (part.part_status === "CANCELLED") {
    return 0;
  }

  return Math.max(part.quantity - part.received_quantity, 0);
}

export function getOutstandingTicketParts(parts: TicketPartRecord[]) {
  return parts.filter((part) => getTicketPartOutstandingQuantity(part) > 0);
}

export function formatOutstandingTicketParts(parts: TicketPartRecord[]) {
  return getOutstandingTicketParts(parts)
    .map((part) => {
      const quantity = getTicketPartOutstandingQuantity(part);
      const label = part.part_number || part.part_description || "Unnamed part";
      return `${quantity} x ${label}`;
    })
    .join(", ");
}

export async function fetchTicketParts(supabase: SupabaseClient, ticketId: string) {
  const { data, error } = await supabase
    .from("ticket_parts")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as TicketPartRow[]).map(normalizeTicketPartRow);
}

export async function createTicketPart(
  supabase: SupabaseClient,
  payload: {
    ticketId: string;
    purchaseOrderId?: string | null;
    createdBy: string | null;
    updatedBy: string | null;
    jobNumber?: string | null;
    machineReference?: string | null;
    machineMake?: string | null;
    machineModel?: string | null;
    partDescription: string;
    partNumber: string;
    quantity?: number;
    partStatus?: TicketPartStatus;
    supplierName?: string | null;
    notes?: string | null;
    sourceSystem?: string | null;
    sourceProductId?: string | null;
    sourcePriceSnapshot?: number | null;
    sourceCurrency?: string | null;
    sourceStockSnapshot?: number | null;
    sourceCheckedAt?: string | null;
    sourceBinLocation?: string | null;
    sourceSubgroup?: string | null;
  },
) {
  const { data, error } = await supabase
    .from("ticket_parts")
    .insert({
      ticket_id: payload.ticketId,
      ticket_purchase_order_id: payload.purchaseOrderId ?? null,
      created_by: payload.createdBy,
      updated_by: payload.updatedBy,
      job_number: payload.jobNumber?.trim() || null,
      machine_reference: payload.machineReference?.trim() || null,
      machine_number_normalized: normalizeTicketPartMachineReference(payload.machineReference),
      machine_make: payload.machineMake?.trim() || null,
      machine_model: payload.machineModel?.trim() || null,
      part_description: payload.partDescription.trim(),
      part_number: payload.partNumber.trim(),
      quantity: typeof payload.quantity === "number" ? payload.quantity : 1,
      part_status: payload.partStatus ?? "REQUESTED",
      supplier_name: payload.supplierName?.trim() || null,
      notes: payload.notes?.trim() || null,
      source_system: payload.sourceSystem?.trim() || null,
      source_product_id: payload.sourceProductId?.trim() || null,
      source_price_snapshot:
        typeof payload.sourcePriceSnapshot === "number" ? payload.sourcePriceSnapshot : null,
      source_currency: payload.sourceCurrency?.trim() || null,
      source_stock_snapshot:
        typeof payload.sourceStockSnapshot === "number" ? payload.sourceStockSnapshot : null,
      source_checked_at: payload.sourceCheckedAt ?? null,
      source_bin_location: payload.sourceBinLocation?.trim() || null,
      source_subgroup: payload.sourceSubgroup?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeTicketPartRow(data as TicketPartRow);
}

export async function receiveTicketPart(
  supabase: SupabaseClient,
  partId: string,
  quantity: number,
) {
  const { data, error } = await supabase.rpc("receive_ticket_part", {
    p_part_id: partId,
    p_quantity: quantity,
  });

  if (error) {
    throw new Error(error.message);
  }

  return normalizeTicketPartRow(data as TicketPartRow);
}

function normalizeTicketPartRow(row: TicketPartRow): TicketPartRecord {
  const quantity = typeof row.quantity === "number" && row.quantity > 0 ? row.quantity : 1;

  return {
    id: row.id,
    ticket_id: row.ticket_id,
    ticket_purchase_order_id: row.ticket_purchase_order_id?.trim() || null,
    created_by: row.created_by,
    updated_by: row.updated_by,
    job_number: row.job_number?.trim() || null,
    machine_reference: row.machine_reference?.trim() || null,
    machine_number_normalized: row.machine_number_normalized?.trim() || null,
    machine_make: row.machine_make?.trim() || null,
    machine_model: row.machine_model?.trim() || null,
    part_description: row.part_description?.trim() || "",
    part_number: row.part_number?.trim() || "",
    quantity,
    received_quantity:
      typeof row.received_quantity === "number" && row.received_quantity > 0
        ? Math.min(row.received_quantity, quantity)
        : 0,
    received_at: row.received_at ?? null,
    received_by: row.received_by ?? null,
    part_status: normalizeTicketPartStatus(row.part_status),
    supplier_name: row.supplier_name?.trim() || null,
    notes: row.notes?.trim() || null,
    source_system: row.source_system?.trim() || null,
    source_product_id: row.source_product_id?.trim() || null,
    source_price_snapshot:
      typeof row.source_price_snapshot === "number"
        ? row.source_price_snapshot
        : typeof row.source_price_snapshot === "string"
          ? Number(row.source_price_snapshot)
          : null,
    source_currency: row.source_currency?.trim() || null,
    source_stock_snapshot: row.source_stock_snapshot ?? null,
    source_checked_at: row.source_checked_at ?? null,
    source_bin_location: row.source_bin_location?.trim() || null,
    source_subgroup: row.source_subgroup?.trim() || null,
    source_requested_quantity: row.source_requested_quantity ?? null,
    source_issued_quantity: row.source_issued_quantity ?? null,
    source_shortfall_quantity: row.source_shortfall_quantity ?? null,
    source_stock_after: row.source_stock_after ?? null,
    source_allocation_status: row.source_allocation_status?.trim() || null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
  };
}

function normalizeTicketPartStatus(value: string | null | undefined): TicketPartStatus {
  if (ticketPartStatuses.includes(value as TicketPartStatus)) {
    return value as TicketPartStatus;
  }

  return "REQUESTED";
}
