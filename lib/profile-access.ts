import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AppProfileRole = string | null;
export type AppProfile = {
  role: AppProfileRole;
  username?: string | null;
  display_name?: string | null;
} | null;

export type AccessLevel = "admin" | "user";
type CurrentUserWithRoleResult = {
  user: User | null;
  role: AppProfileRole;
  profile: AppProfile;
  accessLevel: AccessLevel;
  isAdmin: boolean;
};

const USER_ROLE_CACHE_TTL_MS = 5_000;

let cachedCurrentUserWithRole:
  | { expiresAt: number; value: CurrentUserWithRoleResult }
  | null = null;
let currentUserWithRoleInFlight: Promise<CurrentUserWithRoleResult> | null = null;

function getNormalizedEmailLocalPart(user: User | null) {
  const email = (user?.email || "").toLowerCase().trim();
  return email.split("@")[0] || "";
}

export function getAccessLevel(user: User | null, profile: AppProfile): AccessLevel {
  const email = (user?.email || "").toLowerCase().trim();
  const emailLocalPart = getNormalizedEmailLocalPart(user);
  const role = (profile?.role || "").toLowerCase().trim();

  if (role === "admin") {
    return "admin";
  }

  if (role === "user") {
    return "user";
  }

  if (email === "admin@mlp.local") {
    return "admin";
  }

  if (emailLocalPart.endsWith(".admin")) {
    return "admin";
  }

  if (emailLocalPart.endsWith(".user")) {
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

function getDerivedProfileRole(user: User | null): "admin" | "user" | null {
  const email = (user?.email || "").toLowerCase().trim();
  const emailLocalPart = getNormalizedEmailLocalPart(user);

  if (email === "admin@mlp.local" || emailLocalPart.endsWith(".admin")) {
    return "admin";
  }

  if (emailLocalPart.endsWith(".user")) {
    return "user";
  }

  return null;
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
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, username, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.warn("RELAY profile lookup fallback", profileError.message);
  }

  const normalizedProfile: AppProfile = profile && !profileError
    ? {
        role: typeof profile.role === "string" ? profile.role : null,
        username:
          typeof profile.username === "string" ? profile.username : null,
        display_name:
          typeof profile.full_name === "string" ? profile.full_name : null,
      }
    : null;

  const derivedRole = getDerivedProfileRole(user);
  const resolvedProfile: AppProfile = normalizedProfile
    ? {
        ...normalizedProfile,
        role: normalizedProfile.role ?? derivedRole,
      }
    : derivedRole
      ? {
          role: derivedRole,
          username: null,
          display_name: null,
        }
      : null;

  const accessLevel = getAccessLevel(user, resolvedProfile);

  return {
    user,
    role: resolvedProfile?.role ?? null,
    profile: resolvedProfile,
    accessLevel,
    isAdmin: accessLevel === "admin",
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

  if (!options?.forceFresh && currentUserWithRoleInFlight) {
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
    .select("id, full_name, username")
    .in("id", uniqueUserIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).reduce<Record<string, string>>((accumulator, profile) => {
    if (typeof profile.id !== "string") {
      return accumulator;
    }

    const displayName =
      (typeof profile.full_name === "string" ? profile.full_name.trim() : "") ||
      (typeof profile.username === "string" ? profile.username.trim() : "");

    if (displayName) {
      accumulator[profile.id] = displayName;
    }

    return accumulator;
  }, {});
}
