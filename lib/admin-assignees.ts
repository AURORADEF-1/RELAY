import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  CORE_ADMIN_OPERATOR_OPTIONS,
  isReportableAdminOperatorName,
  normalizeAdminOperatorName,
} from "@/lib/admin-operators";

export type AdminAssigneeOption = {
  userId: string;
  label: string;
  fullName: string;
  isCurrentUser: boolean;
};

type AdminProfileRow = {
  id: string;
  full_name: string | null;
};

export function getAdminAssignmentLabel(value: string) {
  const normalized = normalizeAdminOperatorName(value);
  const comparable = normalized.toLowerCase();
  const coreName = CORE_ADMIN_OPERATOR_OPTIONS.find((name) => {
    const core = name.toLowerCase();
    return comparable === core || comparable.startsWith(`${core} `);
  });
  return coreName ?? normalized;
}

export async function fetchAdminAssigneeOptions(
  supabase: SupabaseClient,
  current: {
    user: User;
    displayName: string;
  },
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "admin")
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const options = new Map<string, AdminAssigneeOption>();
  for (const profile of (data ?? []) as AdminProfileRow[]) {
    const fullName = normalizeAdminOperatorName(profile.full_name ?? "");
    const label = getAdminAssignmentLabel(fullName);
    if (!profile.id || !isReportableAdminOperatorName(label)) continue;
    options.set(profile.id, {
      userId: profile.id,
      label,
      fullName,
      isCurrentUser: profile.id === current.user.id,
    });
  }

  const currentFullName = normalizeAdminOperatorName(
    current.displayName || current.user.email?.split("@")[0] || "",
  );
  const currentLabel = getAdminAssignmentLabel(currentFullName);
  if (isReportableAdminOperatorName(currentLabel)) {
    options.set(current.user.id, {
      userId: current.user.id,
      label: currentLabel,
      fullName: currentFullName,
      isCurrentUser: true,
    });
  }

  return Array.from(options.values()).sort(
    (left, right) =>
      Number(right.isCurrentUser) - Number(left.isCurrentUser)
      || left.label.localeCompare(right.label),
  );
}
