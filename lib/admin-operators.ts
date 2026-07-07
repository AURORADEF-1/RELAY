import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_ADMIN_OPERATOR_OPTIONS = ["Scott", "Tom", "George", "Samantha"] as const;

export type AdminOperatorName = (typeof DEFAULT_ADMIN_OPERATOR_OPTIONS)[number];

export type AdminOperatorRecord = {
  name: string;
  sort_order: number;
  created_at: string;
};

export function normalizeAdminOperatorName(value: string) {
  return value.trim().replace(/\s+/g, " ");
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

  return ((data ?? []) as AdminOperatorRecord[]).filter((record) => typeof record.name === "string");
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

  const { error } = await supabase
    .from("admin_operators")
    .delete()
    .eq("name", normalizedName);

  if (error) {
    throw new Error(error.message);
  }
}

export function getDefaultAdminOperatorOptions() {
  return [...DEFAULT_ADMIN_OPERATOR_OPTIONS];
}
