import type { SupabaseClient } from "@supabase/supabase-js";

export type MachineRegistryRecord = {
  id?: string;
  machine_number: string;
  machine_number_normalized: string;
  fleet_type: "telehandler" | "excavator";
  item_description: string;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  status: string | null;
  quantity: number | null;
  buying_price: number | null;
  selling_price: number | null;
  source_sheet: string | null;
  source_row: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type MachineSnapshot = {
  machine_number: string;
  machine_number_normalized: string;
  machine_fleet_type: "telehandler" | "excavator";
  machine_item_description: string;
  machine_make: string | null;
  machine_model: string | null;
  machine_serial_number: string | null;
  machine_status: string | null;
  machine_quantity: number | null;
  machine_buying_price: number | null;
  machine_selling_price: number | null;
  machine_source_sheet: string | null;
  machine_source_row: number | null;
  machine_verified: boolean;
  machine_verified_at: string | null;
  machine_verified_by: string | null;
};

export function normalizeMachineNumber(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function parseMachineMakeModel(itemDescription: string) {
  const normalized = itemDescription.trim().replace(/\s+/g, " ");
  const [make, ...rest] = normalized.split(" ").filter(Boolean);

  if (!make) {
    return {
      make: null,
      model: null,
    };
  }

  return {
    make: make.toUpperCase(),
    model: rest.length > 0 ? rest.join(" ") : null,
  };
}

export function buildMachineSnapshot(
  record: MachineRegistryRecord | null,
  verifiedBy?: string | null,
): MachineSnapshot | null {
  if (!record) {
    return null;
  }

  return {
    machine_number: record.machine_number,
    machine_number_normalized: record.machine_number_normalized,
    machine_fleet_type: record.fleet_type,
    machine_item_description: record.item_description,
    machine_make: record.make,
    machine_model: record.model,
    machine_serial_number: record.serial_number,
    machine_status: record.status,
    machine_quantity: record.quantity,
    machine_buying_price: record.buying_price,
    machine_selling_price: record.selling_price,
    machine_source_sheet: record.source_sheet,
    machine_source_row: record.source_row,
    machine_verified: true,
    machine_verified_at: new Date().toISOString(),
    machine_verified_by: verifiedBy ?? null,
  };
}

export async function lookupMachineRegistryRecord(
  supabase: SupabaseClient,
  machineReference: string,
) {
  const normalized = normalizeMachineNumber(machineReference);

  if (!normalized) {
    return null;
  }

  const { data, error } = await supabase
    .from("machines")
    .select(
      "id, machine_number, machine_number_normalized, fleet_type, item_description, make, model, serial_number, status, quantity, buying_price, selling_price, source_sheet, source_row, created_at, updated_at",
    )
    .eq("machine_number_normalized", normalized)
    .maybeSingle<MachineRegistryRecord>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

