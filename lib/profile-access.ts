import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AppProfileRole = string | null;
export type AppProfile = {
  role: AppProfileRole;
  username?: string | null;
  display_name?: string | null;
} | null;

export type AccessLevel = "admin" | "user";

export function getAccessLevel(user: User | null, profile: AppProfile): AccessLevel {
  const email = (user?.email || "").toLowerCase();
  const username = (profile?.username || "").toLowerCase();
  const displayName = (profile?.display_name || "").toLowerCase();
  const identity = `${email} ${username} ${displayName}`;

  if (email === "admin@mlp.local") {
    return "admin";
  }

  if (identity.includes(".admin")) {
    return "admin";
  }

  if (identity.includes(".user")) {
    return "user";
  }

  if (profile?.role === "admin") {
    return "admin";
  }

  if (profile?.role === "user") {
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
    throw new Error(profileError.message);
  }

  const normalizedProfile: AppProfile = profile
    ? {
        role: typeof profile.role === "string" ? profile.role : null,
        username:
          typeof profile.username === "string" ? profile.username : null,
        display_name:
          typeof profile.full_name === "string" ? profile.full_name : null,
      }
    : null;

  const accessLevel = getAccessLevel(user, normalizedProfile);

  console.log("RELAY access check", {
    email: user?.email,
    profileRole: normalizedProfile?.role,
    profileUsername: normalizedProfile?.username,
    accessLevel,
  });

  return {
    user,
    role: normalizedProfile?.role ?? null,
    profile: normalizedProfile,
    accessLevel,
    isAdmin: accessLevel === "admin",
  };
}
