import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AppProfileRole = string | null;
export type AppProfile = {
  role: AppProfileRole;
  username?: string | null;
  display_name?: string | null;
} | null;

export type AccessLevel = "admin" | "user";

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

async function syncProfileAccessRole(
  supabase: SupabaseClient,
  user: User,
  profile: AppProfile,
) {
  const derivedRole = getDerivedProfileRole(user);

  if (!derivedRole || profile?.role === derivedRole) {
    return profile;
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        role: derivedRole,
        username: profile?.username ?? null,
        full_name: profile?.display_name ?? null,
      },
      {
        onConflict: "id",
      },
    )
    .select("role, username, full_name")
    .maybeSingle();

  if (error) {
    console.warn("RELAY profile role sync failed", error.message);
    return profile;
  }

  return data
    ? {
        role: typeof data.role === "string" ? data.role : derivedRole,
        username: typeof data.username === "string" ? data.username : null,
        display_name:
          typeof data.full_name === "string" ? data.full_name : null,
      }
    : {
        role: derivedRole,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
      };
}

export async function getCurrentUserWithRole(supabase: SupabaseClient): Promise<{
  user: User | null;
  role: AppProfileRole;
  profile: AppProfile;
  accessLevel: AccessLevel;
  isAdmin: boolean;
}> {
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

  const syncedProfile = await syncProfileAccessRole(
    supabase,
    user,
    normalizedProfile,
  );

  const accessLevel = getAccessLevel(user, syncedProfile);

  return {
    user,
    role: syncedProfile?.role ?? null,
    profile: syncedProfile,
    accessLevel,
    isAdmin: accessLevel === "admin",
  };
}
