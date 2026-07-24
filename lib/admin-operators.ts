import type { SupabaseClient } from "@supabase/supabase-js";

export const CORE_ADMIN_OPERATOR_OPTIONS = ["Scott", "Tom", "George", "Samantha"] as const;

export type AdminOperatorName = (typeof CORE_ADMIN_OPERATOR_OPTIONS)[number];

const EXCLUDED_ADMIN_OPERATOR_NAMES = new Set([
  "admin",
  "drew",
  "scot",
  "scott alcock",
]);

export type AdminOperatorRecord = {
  name: string;
  sort_order: number;
  created_at: string;
};

export function normalizeAdminOperatorName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function isReportableAdminOperatorName(value: string | null | undefined) {
  const normalized = normalizeAdminOperatorName(value ?? "").toLowerCase();
  return Boolean(normalized) && !EXCLUDED_ADMIN_OPERATOR_NAMES.has(normalized);
}

export function isCoreAdminOperatorName(value: string) {
  const normalized = normalizeAdminOperatorName(value).toLowerCase();
  return CORE_ADMIN_OPERATOR_OPTIONS.some(
    (option) => normalizeAdminOperatorName(option).toLowerCase() === normalized,
  );
}

function mergeWithCoreAdminOperators(records: AdminOperatorRecord[]) {
  const mergedByName = new Map<string, AdminOperatorRecord>();

  for (const [index, name] of CORE_ADMIN_OPERATOR_OPTIONS.entries()) {
    const normalizedName = normalizeAdminOperatorName(name);
    mergedByName.set(normalizedName.toLowerCase(), {
      name: normalizedName,
      sort_order: index + 1,
      created_at: new Date(0).toISOString(),
    });
  }

  for (const record of records) {
    const normalizedName = normalizeAdminOperatorName(record.name);
    if (!isReportableAdminOperatorName(normalizedName)) {
      continue;
    }

    mergedByName.set(normalizedName.toLowerCase(), {
      name: normalizedName,
      sort_order: record.sort_order,
      created_at: record.created_at,
    });
  }

  return Array.from(mergedByName.values()).sort((left, right) => {
    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }

    return left.created_at.localeCompare(right.created_at);
  });
}

export async function fetchAdminOperatorRecords(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("admin_operators")
    .select("name, sort_order, created_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const records = ((data ?? []) as AdminOperatorRecord[]).filter(
    (record) => typeof record.name === "string",
  );

  return mergeWithCoreAdminOperators(records);
}

export async function addAdminOperator(
  supabase: SupabaseClient,
  payload: {
    name: string;
    sortOrder: number;
  },
) {
  const normalizedName = normalizeAdminOperatorName(payload.name);

  if (!normalizedName) {
    throw new Error("Admin operator name is required.");
  }

  if (!isReportableAdminOperatorName(normalizedName)) {
    throw new Error(`${normalizedName} is not a valid reporting operator.`);
  }

  if (isCoreAdminOperatorName(normalizedName)) {
    throw new Error(`${normalizedName} is a built-in operator and already appears in reporting.`);
  }

  const { data, error } = await supabase
    .from("admin_operators")
    .insert({
      name: normalizedName,
      sort_order: payload.sortOrder,
    })
    .select("name, sort_order, created_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as AdminOperatorRecord;
}

export async function deleteAdminOperator(supabase: SupabaseClient, name: string) {
  const normalizedName = normalizeAdminOperatorName(name);

  if (!normalizedName) {
    throw new Error("Admin operator name is required.");
  }

  if (isCoreAdminOperatorName(normalizedName)) {
    throw new Error(`${normalizedName} is a built-in operator and cannot be deleted.`);
  }

  const { error } = await supabase
    .from("admin_operators")
    .delete()
    .eq("name", normalizedName);

  if (error) {
    throw new Error(error.message);
  }
}

export function getDefaultAdminOperatorOptions() {
  return [...CORE_ADMIN_OPERATOR_OPTIONS];
}
