import type { SupabaseClient } from "@supabase/supabase-js";

export type RequesterAccountRecord = {
  user_id: string;
  full_name: string | null;
};

export async function fetchRequesterAccounts(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("role", "user")
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<{ id: string; full_name: string | null }>)
    .filter((profile) => typeof profile.id === "string")
    .map((profile) => ({
      user_id: profile.id,
      full_name: profile.full_name?.trim() || null,
    })) satisfies RequesterAccountRecord[];
}
