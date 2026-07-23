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

const PART_SEARCH_CONCEPTS = [
  ["vent", "duct", "grille", "louvre", "outlet", "airflow"],
  ["round", "circular", "circle"],
  ["window", "glass", "glazing", "windscreen", "windshield"],
  ["lamp", "light", "lighting", "headlamp", "worklight"],
  ["hose", "pipe", "tube", "line"],
  ["seal", "gasket", "oring", "o-ring"],
  ["track", "crawler", "undercarriage"],
  ["bucket", "attachment", "implement"],
  ["cab", "cabin", "operator"],
  ["filter", "element", "strainer"],
  ["deadman", "safety", "lock", "pilot", "presence", "isolation"],
  ["aircon", "air-conditioning", "ac", "compressor", "refrigeration"],
  ["cable", "wire", "linkage", "control"],
] as const;

const PART_SEARCH_SYNONYMS = new Map<string, readonly string[]>(
  PART_SEARCH_CONCEPTS.flatMap((concept) =>
    concept.map((term) => [term, concept] as const),
  ),
);

export function normalizeTakeuchiModel(value: string | null | undefined) {
  return value?.trim().replace(/[\s_-]+/g, "").toUpperCase() || "";
}

export function buildTakeuchiModelCandidates(value: string | null | undefined) {
  const candidates = new Set<string>();
  const coreModel = value?.match(/\bTB\s*\d{2,4}(?:\s*-\s*\d+)?\b/i)?.[0] ?? "";

  for (const candidate of [value, coreModel]) {
    const normalized = normalizeTakeuchiModel(candidate);
    if (!normalized) continue;
    candidates.add(normalized);
    candidates.add(normalized.replace(/^TAKEUCHI/, ""));
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
  return value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .replace(/\s+/g, " ") || "";
}

export function expandPartSearchTerms(value: string | null | undefined) {
  const normalized = normalizeSearchText(value);
  const terms = new Set(normalized.split(" ").filter(Boolean));

  for (const term of Array.from(terms)) {
    for (const synonym of PART_SEARCH_SYNONYMS.get(term) ?? []) {
      terms.add(synonym);
    }
  }

  return Array.from(terms);
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

  const originalTokens = new Set(normalizedQuery.split(" ").filter(Boolean));
  for (const token of expandPartSearchTerms(normalizedQuery)) {
    if (haystack.includes(token)) {
      const tokenScore = token.length >= 6 ? 14 : 8;
      score += originalTokens.has(token) ? tokenScore : Math.max(4, tokenScore - 5);
    }
  }

  return score;
}

export async function fetchTakeuchiPartsCatalog(
  supabase: SupabaseClient,
  options: {
    machineModel?: string | null;
    serialNumber?: string | null;
    maxRows?: number;
    searchText?: string | null;
  } = {},
) {
  const normalizedModel = normalizeTakeuchiModel(options.machineModel ?? "");
  const parsedSerial = parseTakeuchiSerialNumber(options.serialNumber ?? "");
  const maxRows = Math.max(1, options.maxRows ?? Number.MAX_SAFE_INTEGER);
  const searchTerms = expandPartSearchTerms(options.searchText)
    .filter((term) => term.length >= 2)
    .slice(0, 12);

  const selectClause =
    "id,catalog_key,machine_make,machine_model,machine_model_normalized,serial_start,serial_end,bom_main_group,bom_sub_group,bom_item,part_number,part_description,suggested_part_number,notes,source_file_name,source_sheet,source_row,created_at,updated_at";
  const pageSize = 1000;
  const allRows: TakeuchiPartCatalogRow[] = [];

  for (let start = 0; start < maxRows; start += pageSize) {
    const currentPageSize = Math.min(pageSize, maxRows - start);
    let query = supabase
      .from("takeuchi_parts_catalog")
      .select(selectClause)
      .order("bom_main_group", { ascending: true })
      .order("bom_sub_group", { ascending: true })
      .order("part_number", { ascending: true })
      .range(start, start + currentPageSize - 1);

    if (normalizedModel) {
      const modelCandidates = buildTakeuchiModelCandidates(options.machineModel);
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

    if (searchTerms.length > 0) {
      query = query.or(
        searchTerms.flatMap((term) => [
          `part_description.ilike.*${term}*`,
          `part_number.ilike.*${term}*`,
          `suggested_part_number.ilike.*${term}*`,
          `bom_main_group.ilike.*${term}*`,
          `bom_sub_group.ilike.*${term}*`,
          `bom_item.ilike.*${term}*`,
        ]).join(","),
      );
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const pageRows = (data ?? []) as TakeuchiPartCatalogRow[];
    allRows.push(...pageRows);

    if (pageRows.length < currentPageSize) {
      break;
    }
  }

  return allRows.map(normalizeTakeuchiPartCatalogRow);
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
