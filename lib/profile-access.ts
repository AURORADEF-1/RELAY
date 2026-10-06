import type { SupabaseClient, User } from "@supabase/supabase-js";
import { normalizeAccessGroup, type AccessGroupId } from "@/lib/access-groups";

export type AppProfileRole = string | null;
export type AppProfile = {
  role: AppProfileRole;
  display_name?: string | null;
  interface_mode?: "standard" | "front_counter" | null;
  access_group?: AccessGroupId | null;
} | null;

export type AccessLevel = "admin" | "user";
type CurrentUserWithRoleResult = {
  user: User | null;
  role: AppProfileRole;
  profile: AppProfile;
  accessLevel: AccessLevel;
  isAdmin: boolean;
  isFrontCounter: boolean;
  accessGroup: AccessGroupId | null;
};

const USER_ROLE_CACHE_TTL_MS = 5_000;

let cachedCurrentUserWithRole:
  | { expiresAt: number; value: CurrentUserWithRoleResult }
  | null = null;
let currentUserWithRoleInFlight: Promise<CurrentUserWithRoleResult> | null = null;

export function getAccessLevel(user: User | null, profile: AppProfile): AccessLevel {
  const role = (profile?.role || "").toLowerCase().trim();

  if (role === "admin") {
    return "admin";
  }

  if (role === "user") {
    return "user";
  }

  return "user";
}

export function isAdmin(user: User | null, profile: AppProfile) {
  return getAccessLevel(user, profile) === "admin";
}

export function isUserOnly(user: User | null, profile: AppProfile) {
  return getAccessLevel(user, profile) === "user";
}

export function clearCurrentUserWithRoleCache() {
  cachedCurrentUserWithRole = null;
  currentUserWithRoleInFlight = null;
}

async function resolveCurrentUserWithRole(
  supabase: SupabaseClient,
): Promise<CurrentUserWithRoleResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!user) {
    return {
      user: null,
      role: null,
      profile: null,
      accessLevel: "user",
      isAdmin: false,
      isFrontCounter: false,
      accessGroup: null,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, full_name, interface_mode, access_group")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.warn("RELAY profile lookup fallback", profileError.message);
  }

  const normalizedProfile: AppProfile = profile && !profileError
    ? {
        role: typeof profile.role === "string" ? profile.role : null,
        display_name:
          typeof profile.full_name === "string" ? profile.full_name : null,
        interface_mode:
          profile.interface_mode === "front_counter" ? "front_counter" : "standard",
        access_group: typeof profile.access_group === "string"
          ? normalizeAccessGroup(profile.access_group)
          : null,
      }
    : null;

  const resolvedProfile: AppProfile = normalizedProfile
    ? normalizedProfile
    : {
        role: "requester",
        display_name: null,
        interface_mode: "standard",
        access_group: null,
      };

  const accessLevel = getAccessLevel(user, resolvedProfile);
  const isFrontCounter = resolvedProfile?.interface_mode === "front_counter";
  const accessGroup = resolvedProfile?.access_group ?? null;

  return {
    user,
    role: resolvedProfile?.role ?? null,
    profile: resolvedProfile,
    accessLevel,
    isAdmin: accessLevel === "admin",
    isFrontCounter,
    accessGroup,
  };
}

export async function getCurrentUserWithRole(
  supabase: SupabaseClient,
  options?: { forceFresh?: boolean },
): Promise<CurrentUserWithRoleResult> {
  const now = Date.now();

  if (!options?.forceFresh && cachedCurrentUserWithRole && cachedCurrentUserWithRole.expiresAt > now) {
    return cachedCurrentUserWithRole.value;
  }

  // A fresh lookup should bypass the completed cache, not duplicate an identity
  // request that is already running. Coalescing here prevents competing GoTrue
  // browser-lock requests when several client components mount together.
  if (currentUserWithRoleInFlight) {
    return currentUserWithRoleInFlight;
  }

  const request = resolveCurrentUserWithRole(supabase)
    .then((value) => {
      cachedCurrentUserWithRole = {
        value,
        expiresAt: Date.now() + USER_ROLE_CACHE_TTL_MS,
      };
      return value;
    })
    .finally(() => {
      currentUserWithRoleInFlight = null;
    });

  currentUserWithRoleInFlight = request;
  return request;
}

export async function fetchProfileDisplayNamesByUserId(
  supabase: SupabaseClient,
  userIds: string[],
) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

  if (uniqueUserIds.length === 0) {
    return {} as Record<string, string>;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", uniqueUserIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).reduce<Record<string, string>>((accumulator, profile) => {
    if (typeof profile.id !== "string") {
      return accumulator;
    }

    const displayName =
      typeof profile.full_name === "string" ? profile.full_name.trim() : "";

    if (displayName) {
      accumulator[profile.id] = displayName;
    }

    return accumulator;
  }, {});
}
