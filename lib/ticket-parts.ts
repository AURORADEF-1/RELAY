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
  part_status: TicketPartStatus;
  supplier_name: string | null;
  notes: string | null;
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
  part_status: string | null;
  supplier_name: string | null;
  notes: string | null;
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
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeTicketPartRow(data as TicketPartRow);
}

function normalizeTicketPartRow(row: TicketPartRow): TicketPartRecord {
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
    quantity: typeof row.quantity === "number" && row.quantity > 0 ? row.quantity : 1,
    part_status: normalizeTicketPartStatus(row.part_status),
    supplier_name: row.supplier_name?.trim() || null,
    notes: row.notes?.trim() || null,
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
