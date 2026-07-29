import { z } from "zod";
import { getFleetMachineGroup } from "@/lib/fleet-workspace";
import { extractRicoMachineModel } from "@/lib/integrations/rico/normalizers";

export const RICO_FLEET_FEED_DEFAULT_LIMIT = 200;
export const RICO_FLEET_FEED_MAX_LIMIT = 500;

export type RicoFleetFeedMachineRow = {
  id: string;
  machine_number: string;
  machine_number_normalized: string;
  fleet_type: string | null;
  item_description: string | null;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RicoFleetFeedStatus = "active" | "disposed" | "sold";

export type RicoFleetFeedMachine = {
  relay_id: string;
  machine_ref: string | null;
  manufacturer: string;
  model: string;
  serial_number: string;
  plant_reference: string;
  fleet_number: string;
  type: string;
  engine: string | null;
  year: string | null;
  serial_range: string | null;
  status: RicoFleetFeedStatus;
  status_detail: string | null;
  current_hours: number | null;
  hours_reading_date: string | null;
  service_interval_hours: number | null;
  service_interval_months: number | null;
  location: string | null;
  notes: string | null;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RicoFleetFeedQuery = {
  limit: number;
  offset: number;
  updatedSince: string | null;
};

export const ricoFleetFeedMachineRowSchema = z.object({
  id: z.string().uuid(),
  machine_number: z.string(),
  machine_number_normalized: z.string(),
  fleet_type: z.string().nullable(),
  item_description: z.string().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  serial_number: z.string().nullable(),
  status: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export const ricoFleetFeedPageSchema = z.object({
  total: z.coerce.number().int().min(0),
  excluded: z.coerce.number().int().min(0),
  rows: z.array(ricoFleetFeedMachineRowSchema),
});

const querySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(RICO_FLEET_FEED_MAX_LIMIT)
    .default(RICO_FLEET_FEED_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
  updated_since: z.string().trim().optional(),
});

const unusableSerials = new Set([
  "",
  "-",
  "0",
  "N/A",
  "NA",
  "NONE",
  "NOT KNOWN",
  "TBC",
  "UNKNOWN",
]);

function clean(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") || null;
}

export function parseRicoFleetFeedQuery(searchParams: URLSearchParams): RicoFleetFeedQuery {
  const parsed = querySchema.parse({
    limit: searchParams.get("limit") || undefined,
    offset: searchParams.get("offset") || undefined,
    updated_since: searchParams.get("updated_since") || undefined,
  });
  let updatedSince: string | null = null;

  if (parsed.updated_since) {
    const timestamp = Date.parse(parsed.updated_since);
    if (!Number.isFinite(timestamp)) {
      throw new z.ZodError([
        {
          code: "custom",
          path: ["updated_since"],
          message: "updated_since must be an ISO-8601 timestamp.",
        },
      ]);
    }
    updatedSince = new Date(timestamp).toISOString();
  }

  return {
    limit: parsed.limit,
    offset: parsed.offset,
    updatedSince,
  };
}

export function isUsableRicoFleetSerial(serialNumber: string | null | undefined) {
  const normalized = clean(serialNumber)?.toUpperCase() ?? "";
  return !unusableSerials.has(normalized);
}

export function normalizeRicoFleetFeedStatus(status: string | null | undefined): RicoFleetFeedStatus {
  const normalized = clean(status)?.toLowerCase() ?? "";

  if (/\bsold\b/.test(normalized)) {
    return "sold";
  }
  if (/\b(disposed|scrap(?:ped)?|written off)\b/.test(normalized)) {
    return "disposed";
  }
  return "active";
}

export function toRicoFleetFeedMachine(row: RicoFleetFeedMachineRow): RicoFleetFeedMachine {
  const serialNumber = clean(row.serial_number);
  if (!serialNumber || !isUsableRicoFleetSerial(serialNumber)) {
    throw new Error("A serialized physical machine is required for the RICO fleet feed.");
  }

  const description = clean(row.item_description);
  const manufacturer = clean(row.make) ?? clean(description?.split(" ")[0]) ?? "UNKNOWN";
  const rawModel = clean(row.model) ?? description ?? "UNKNOWN";
  const model = extractRicoMachineModel(rawModel, manufacturer) || rawModel;
  const plantReference = clean(row.machine_number) ?? row.id;

  return {
    relay_id: row.id,
    // RELAY does not yet persist RICO's machineRef; serial and relay_id are stable matching keys.
    machine_ref: null,
    manufacturer,
    model,
    serial_number: serialNumber,
    plant_reference: plantReference,
    fleet_number: plantReference,
    type: getFleetMachineGroup(row).replace(/s$/, ""),
    engine: null,
    year: null,
    serial_range: null,
    status: normalizeRicoFleetFeedStatus(row.status),
    status_detail: clean(row.status),
    current_hours: null,
    hours_reading_date: null,
    service_interval_hours: null,
    service_interval_months: null,
    location: null,
    notes: null,
    description,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
