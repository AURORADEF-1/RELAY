"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export type PartsLookupRecord = {
  id: string;
  source_ticket_part_id: string;
  ticket_id: string;
  ticket_purchase_order_id: string | null;
  job_number: string | null;
  machine_number: string | null;
  machine_number_normalized: string | null;
  machine_reference: string | null;
  machine_fleet_type: string | null;
  machine_make: string | null;
  machine_model: string | null;
  machine_serial_number: string | null;
  part_description: string;
  part_number: string;
  quantity: number;
  supplier_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type PartsLookupRow = {
  id: string;
  source_ticket_part_id: string | null;
  ticket_id: string | null;
  ticket_purchase_order_id: string | null;
  job_number: string | null;
  machine_number: string | null;
  machine_number_normalized: string | null;
  machine_reference: string | null;
  machine_fleet_type: string | null;
  machine_make: string | null;
  machine_model: string | null;
  machine_serial_number: string | null;
  part_description: string | null;
  part_number: string | null;
  quantity: number | null;
  supplier_name: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const PARTS_LOOKUP_SELECT =
  "id,source_ticket_part_id,ticket_id,ticket_purchase_order_id,job_number,machine_number,machine_number_normalized,machine_reference,machine_fleet_type,machine_make,machine_model,machine_serial_number,part_description,part_number,quantity,supplier_name,notes,created_at,updated_at";

export async function fetchPartsLookup(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("parts_lookup")
    .select("*")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as PartsLookupRow[]).map(normalizePartsLookupRow);
}

export async function fetchPartsLookupCandidates(
  supabase: SupabaseClient,
  machine: {
    machineNumberNormalized?: string | null;
    machineMake?: string | null;
    machineModel?: string | null;
  },
) {
  const machineNumberNormalized = machine.machineNumberNormalized?.trim() || "";
  const machineMake = machine.machineMake?.trim() || "";
  const machineModel = machine.machineModel?.trim() || "";
  const queries: Array<PromiseLike<{ data: unknown; error: { message: string } | null }>> = [];

  if (machineNumberNormalized) {
    queries.push(
      supabase
        .from("parts_lookup")
        .select(PARTS_LOOKUP_SELECT)
        .eq("machine_number_normalized", machineNumberNormalized)
        .order("updated_at", { ascending: false })
        .limit(200),
    );
  }

  if (machineMake && machineModel) {
    queries.push(
      supabase
        .from("parts_lookup")
        .select(PARTS_LOOKUP_SELECT)
        .ilike("machine_make", machineMake)
        .ilike("machine_model", machineModel)
        .order("updated_at", { ascending: false })
        .limit(500),
    );
  }

  if (queries.length === 0) {
    return [];
  }

  const results = await Promise.all(queries);
  const rowsById = new Map<string, PartsLookupRow>();

  for (const result of results) {
    if (result.error) {
      throw new Error(result.error.message);
    }

    for (const row of (result.data ?? []) as PartsLookupRow[]) {
      rowsById.set(row.id, row);
    }
  }

  return Array.from(rowsById.values()).map(normalizePartsLookupRow);
}

function normalizePartsLookupRow(row: PartsLookupRow): PartsLookupRecord {
  return {
    id: row.id,
    source_ticket_part_id: row.source_ticket_part_id?.trim() || "",
    ticket_id: row.ticket_id?.trim() || "",
    ticket_purchase_order_id: row.ticket_purchase_order_id?.trim() || null,
    job_number: row.job_number?.trim() || null,
    machine_number: row.machine_number?.trim() || null,
    machine_number_normalized: row.machine_number_normalized?.trim() || null,
    machine_reference: row.machine_reference?.trim() || null,
    machine_fleet_type: row.machine_fleet_type?.trim() || null,
    machine_make: row.machine_make?.trim() || null,
    machine_model: row.machine_model?.trim() || null,
    machine_serial_number: row.machine_serial_number?.trim() || null,
    part_description: row.part_description?.trim() || "",
    part_number: row.part_number?.trim() || "",
    quantity: typeof row.quantity === "number" && row.quantity > 0 ? row.quantity : 1,
    supplier_name: row.supplier_name?.trim() || null,
    notes: row.notes?.trim() || null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
  };
}
