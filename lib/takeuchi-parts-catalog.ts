"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export type TakeuchiPartCatalogRecord = {
  id: string;
  catalog_key: string;
  machine_make: string;
  machine_model: string;
  machine_model_normalized: string;
  serial_start: number;
  serial_end: number;
  bom_main_group: string;
  bom_sub_group: string;
  bom_item: string | null;
  part_number: string;
  part_description: string;
  suggested_part_number: string | null;
  notes: string | null;
  source_file_name: string | null;
  source_sheet: string | null;
  source_row: number | null;
  created_at: string;
  updated_at: string;
};

type TakeuchiPartCatalogRow = {
  id: string;
  catalog_key: string | null;
  machine_make: string | null;
  machine_model: string | null;
  machine_model_normalized: string | null;
  serial_start: number | string | null;
  serial_end: number | string | null;
  bom_main_group: string | null;
  bom_sub_group: string | null;
  bom_item: string | null;
  part_number: string | null;
  part_description: string | null;
  suggested_part_number: string | null;
  notes: string | null;
  source_file_name: string | null;
  source_sheet: string | null;
  source_row: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type TakeuchiPartCatalogImportRow = {
  catalog_key: string;
  machine_make: string;
  machine_model: string;
  machine_model_normalized: string;
  serial_start: number;
  serial_end: number;
  bom_main_group: string;
  bom_sub_group: string;
  bom_item: string | null;
  part_number: string;
  part_description: string;
  suggested_part_number: string | null;
  notes: string | null;
  source_file_name: string | null;
  source_sheet: string | null;
  source_row: number | null;
};

export type TakeuchiPartSuggestion = TakeuchiPartCatalogRecord & {
  matchScore: number;
  matchReason: string;
};

export function normalizeTakeuchiModel(value: string | null | undefined) {
  return value?.trim().replace(/[\s_-]+/g, "").toUpperCase() || "";
}

export function buildTakeuchiModelCandidates(value: string | null | undefined) {
  const normalized = normalizeTakeuchiModel(value);
  const candidates = new Set<string>();

  if (normalized) {
    candidates.add(normalized);
    candidates.add(normalized.replace(/^TAKEUCHI/, ""));
    candidates.add(normalized.replace(/^TB/, "TB"));
  }

  return Array.from(candidates).filter(Boolean);
}

export function parseTakeuchiSerialNumber(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/[, ]+/g, "");
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildTakeuchiCatalogKey(input: {
  machineModel: string;
  serialStart: number;
  serialEnd: number;
  bomMainGroup: string;
  bomSubGroup: string;
  bomItem?: string | null;
  partNumber: string;
  partDescription: string;
}) {
  return [
    normalizeTakeuchiModel(input.machineModel),
    String(input.serialStart),
    String(input.serialEnd),
    normalizeSearchText(input.bomMainGroup),
    normalizeSearchText(input.bomSubGroup),
    normalizeSearchText(input.bomItem),
    normalizeSearchText(input.partNumber),
    normalizeSearchText(input.partDescription),
  ].join("|");
}

export function normalizeSearchText(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") || "";
}

export function scoreTakeuchiPartSuggestion(
  part: Pick<TakeuchiPartCatalogRecord, "bom_main_group" | "bom_sub_group" | "bom_item" | "part_number" | "part_description" | "suggested_part_number">,
  query: string,
) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return 0;
  }

  const haystack = normalizeSearchText(
    [
      part.bom_main_group,
      part.bom_sub_group,
      part.bom_item,
      part.part_number,
      part.part_description,
      part.suggested_part_number,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (!haystack) {
    return 0;
  }

  if (haystack === normalizedQuery) {
    return 120;
  }

  let score = 0;
  if (haystack.includes(normalizedQuery)) {
    score += 60;
  }

  if (haystack.startsWith(normalizedQuery)) {
    score += 25;
  }

  for (const token of normalizedQuery.split(" ").filter(Boolean)) {
    if (haystack.includes(token)) {
      score += token.length >= 6 ? 14 : 8;
    }
  }

  return score;
}

export async function fetchTakeuchiPartsCatalog(
  supabase: SupabaseClient,
  options: {
    machineModel?: string | null;
    serialNumber?: string | null;
  } = {},
) {
  const normalizedModel = normalizeTakeuchiModel(options.machineModel ?? "");
  const parsedSerial = parseTakeuchiSerialNumber(options.serialNumber ?? "");

  let query = supabase
    .from("takeuchi_parts_catalog")
    .select(
      "id,catalog_key,machine_make,machine_model,machine_model_normalized,serial_start,serial_end,bom_main_group,bom_sub_group,bom_item,part_number,part_description,suggested_part_number,notes,source_file_name,source_sheet,source_row,created_at,updated_at",
    )
    .order("bom_main_group", { ascending: true })
    .order("bom_sub_group", { ascending: true })
    .order("part_number", { ascending: true });

  if (normalizedModel) {
    const modelCandidates = buildTakeuchiModelCandidates(normalizedModel);
    if (modelCandidates.length === 1) {
      query = query.eq("machine_model_normalized", modelCandidates[0]);
    } else {
      query = query.or(
        modelCandidates.map((candidate) => `machine_model_normalized.ilike.*${candidate}*`).join(","),
      );
    }
  }

  if (parsedSerial !== null) {
    query = query.lte("serial_start", parsedSerial).gte("serial_end", parsedSerial);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as TakeuchiPartCatalogRow[]).map(normalizeTakeuchiPartCatalogRow);
}

export function normalizeTakeuchiPartCatalogRow(row: TakeuchiPartCatalogRow): TakeuchiPartCatalogRecord {
  return {
    id: row.id,
    catalog_key: row.catalog_key?.trim() || "",
    machine_make: row.machine_make?.trim() || "Takeuchi",
    machine_model: row.machine_model?.trim() || "",
    machine_model_normalized: row.machine_model_normalized?.trim() || normalizeTakeuchiModel(row.machine_model ?? ""),
    serial_start: parseTakeuchiSerialNumber(String(row.serial_start ?? "")) ?? 0,
    serial_end: parseTakeuchiSerialNumber(String(row.serial_end ?? "")) ?? 0,
    bom_main_group: row.bom_main_group?.trim() || "",
    bom_sub_group: row.bom_sub_group?.trim() || "",
    bom_item: row.bom_item?.trim() || null,
    part_number: row.part_number?.trim() || "",
    part_description: row.part_description?.trim() || "",
    suggested_part_number: row.suggested_part_number?.trim() || null,
    notes: row.notes?.trim() || null,
    source_file_name: row.source_file_name?.trim() || null,
    source_sheet: row.source_sheet?.trim() || null,
    source_row: typeof row.source_row === "number" ? row.source_row : null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
  };
}

export function buildTakeuchiPartSuggestions(
  parts: TakeuchiPartCatalogRecord[],
  query: string,
  options: {
    limit?: number;
  } = {},
) {
  const limit = options.limit ?? 12;
  return parts
    .map((part) => {
      const matchScore = scoreTakeuchiPartSuggestion(part, query);
      const matchReason =
        matchScore >= 60
          ? "Strong description match"
          : matchScore >= 30
            ? "Likely catalogue match"
            : "Browse candidate";

      return {
        ...part,
        matchScore,
        matchReason,
      };
    })
    .filter((part) => part.matchScore > 0)
    .sort((left, right) => right.matchScore - left.matchScore || left.part_number.localeCompare(right.part_number))
    .slice(0, limit);
}
